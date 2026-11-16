package servicestats

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"log/slog"
	"net/url"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/stretchr/testify/require"

	"github.com/Emyrk/chronicle/combatlog/parser/common/registry"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/internal/instancesearch"
)

// searchesMaxCost is the most a curated search may cost: the anonymous
// instance-search budget (serviceinstancesearch.AnonLimit burst), so the same
// search would be affordable for a logged-out visitor.
const searchesMaxCost = 40

func TestCuratedSearchRegistry(t *testing.T) {
	t.Parallel()

	require.GreaterOrEqual(t, len(curatedSearches), 8)
	require.LessOrEqual(t, len(curatedSearches), 15)

	allInstances := map[string]bool{}
	for _, name := range registry.AllInstanceNames() {
		allInstances[name] = true
	}
	seen := map[string]bool{}
	for _, s := range curatedSearches {
		t.Run(s.Slug, func(t *testing.T) {
			t.Parallel()
			require.Regexp(t, slugPattern, s.Slug)
			require.NotEmpty(t, s.Title)
			require.Contains(t, s.Title, "{server}")
			require.Contains(t, s.Answer, "{server}")
			require.NotEmpty(t, s.About)
			require.NotNil(t, s.Query.Where, "a curated search filters")
			require.Equal(t, searchesShown, s.Query.Limit)
			if s.Requires != "" {
				require.True(t, allInstances[s.Requires], "%q is not an instance any flavor registers", s.Requires)
			}
			// {value} in the answer needs a value column, and the other way round.
			require.Equal(t, s.ValueHeader != "", strings.Contains(s.Answer, "{value}"))

			// It compiles as written, and after a JSON round trip, which is how a
			// search arrives over HTTP (numbers as float64).
			opts := instancesearch.Options{TenantID: uuid.New()}
			compiled, err := instancesearch.Compile(s.Query, opts)
			require.NoError(t, err)
			t.Logf("cost %d", compiled.Cost)
			require.LessOrEqual(t, compiled.Cost, searchesMaxCost, "over the anonymous search budget")
			raw, err := json.Marshal(s.Query)
			require.NoError(t, err)
			var wire instancesearch.Query
			require.NoError(t, json.Unmarshal(raw, &wire))
			wireCompiled, err := instancesearch.Compile(wire, opts)
			require.NoError(t, err)
			require.Equal(t, compiled.SQL, wireCompiled.SQL)
		})
		require.False(t, seen[s.Slug], "duplicate slug %s", s.Slug)
		seen[s.Slug] = true
	}
}

func TestSearchHref(t *testing.T) {
	t.Parallel()

	var fastest curatedSearch
	for _, s := range curatedSearches {
		if s.Slug == "fastest-molten-core-clears" {
			fastest = s
		}
	}
	href := searchHref(fastest.Query)
	u, err := url.Parse(href)
	require.NoError(t, err)
	require.Equal(t, "/search", u.Path)
	require.Equal(t, "instance.clear_time_ms", u.Query().Get("sort"))
	require.Equal(t, "asc", u.Query().Get("order"))

	// ?q= is the base64url JSON of the where tree, as the SPA's encodeQuery writes it.
	raw, err := base64.RawURLEncoding.DecodeString(u.Query().Get("q"))
	require.NoError(t, err)
	var where instancesearch.Node
	require.NoError(t, json.Unmarshal(raw, &where))
	require.Len(t, where.And, 3)
	require.Equal(t, "instance.name", where.And[0].Field)
	require.Equal(t, "Molten Core", where.And[0].Value)

	// A kill-time sort carries its boss; the default sort carries nothing.
	for _, s := range curatedSearches {
		if s.Slug == "fastest-ragnaros-kills" {
			u, _ := url.Parse(searchHref(s.Query))
			require.Equal(t, "Ragnaros", u.Query().Get("sort_boss"))
		}
		if s.Slug == "deathless-ragnaros-kills" {
			u, _ := url.Parse(searchHref(s.Query))
			require.Empty(t, u.Query().Get("sort"))
			require.NotEmpty(t, u.Query().Get("q"))
		}
	}
	require.Equal(t, "/search", searchHref(instancesearch.Query{}))
}

func TestSearchClockAndBoardSize(t *testing.T) {
	t.Parallel()
	require.Equal(t, "38:12", searchClock(2_292_000))
	require.Equal(t, "1:02:05", searchClock(3_725_000))
	require.Equal(t, "25 Player", searchBoardSize(searchRow{Difficulty: "25 Player", MaxPlayers: 25}))
	require.Equal(t, "Heroic, 25 players", searchBoardSize(searchRow{Difficulty: "Heroic", MaxPlayers: 25}))
	require.Equal(t, "40 players", searchBoardSize(searchRow{MaxPlayers: 40}))
	require.Empty(t, searchBoardSize(searchRow{}))
}

func searchResult(guild string, started time.Time, sortValue string, clearMs int64, slug string) instancesearch.Result {
	r := instancesearch.Result{ID: uuid.New(), Slug: slug, Name: "Molten Core", GuildName: guild, StartedAt: started, MaxPlayers: 40, PlayerCount: 38, BossesKilled: 10}
	if sortValue != "" {
		r.SortValue = &sortValue
	}
	if clearMs > 0 {
		r.ClearTimeMS = &clearMs
	}
	return r
}

func TestBuildSearchPayload(t *testing.T) {
	t.Parallel()
	started := time.Date(2026, 11, 10, 20, 0, 0, 0, time.UTC)
	asOf := time.Date(2026, 11, 15, 3, 0, 0, 0, time.UTC)

	var fastest, deathless curatedSearch
	for _, s := range curatedSearches {
		switch s.Slug {
		case "fastest-molten-core-clears":
			fastest = s
		case "deathless-ragnaros-kills":
			deathless = s
		}
	}

	page := instancesearch.Page{Results: []instancesearch.Result{
		searchResult("Nightfall", started, "2292000", 2_292_000, "abc"),
		searchResult("", started, "2400000", 2_400_000, ""),
	}}
	p := buildSearchPayload(fastest, page, asOf)
	require.Equal(t, "fastest-molten-core-clears", p.Slug)
	require.Equal(t, asOf, p.AsOf)
	require.False(t, p.More)
	require.Len(t, p.Results, 2)
	require.Equal(t, searchRow{Rank: 1, Guild: "Nightfall", Raid: "Molten Core", Date: started, MaxPlayers: 40, Players: 38, Bosses: 10, Value: "38:12", RaidID: "abc"}, p.Results[0])
	require.Equal(t, page.Results[1].ID.String(), p.Results[1].RaidID, "no slug: the instance ID")
	require.Equal(t, "40:00", p.Results[1].Value)

	// A search with no value column has no values.
	require.Empty(t, buildSearchPayload(deathless, page, asOf).Results[0].Value)

	// A next page, or too many rows, means there are more matches than listed.
	page.Next = &instancesearch.Cursor{}
	require.True(t, buildSearchPayload(fastest, page, asOf).More)
	var many []instancesearch.Result
	for i := 0; i < searchesShown+3; i++ {
		many = append(many, searchResult("G", started, "1000", 1000, ""))
	}
	capped := buildSearchPayload(fastest, instancesearch.Page{Results: many}, asOf)
	require.Len(t, capped.Results, searchesShown)
	require.True(t, capped.More)
}

// searchStore serves previous snapshots and snapshot metadata.
type searchStore struct {
	database.Store
	snapshots map[string]database.StatsSnapshot
}

func (s *searchStore) GetStatsSnapshot(_ context.Context, arg database.GetStatsSnapshotParams) (database.StatsSnapshot, error) {
	if row, ok := s.snapshots[arg.PageKey]; ok {
		return row, nil
	}
	return database.StatsSnapshot{}, pgx.ErrNoRows
}

func (s *searchStore) ListStatsSnapshotMeta(context.Context, uuid.UUID) ([]database.ListStatsSnapshotMetaRow, error) {
	var out []database.ListStatsSnapshotMetaRow
	for key, row := range s.snapshots {
		out = append(out, database.ListStatsSnapshotMetaRow{PageKey: key, ProducerKey: row.ProducerKey, SampleN: row.SampleN})
	}
	return out, nil
}

func newTestSearchesProducer(searches []curatedSearch, run func(context.Context, database.Store, instancesearch.Compiled, instancesearch.SearchOptions) (instancesearch.Page, error)) *searchesProducer {
	return &searchesProducer{
		logger: slog.New(slog.DiscardHandler), searches: searches, run: run,
		now: func() time.Time { return time.Date(2026, 11, 15, 3, 0, 0, 0, time.UTC) },
	}
}

func TestSearchesProducer(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	started := time.Date(2026, 11, 10, 20, 0, 0, 0, time.UTC)
	flavor := database.WoWFlavor{database.FlavorVanilla}

	mc := fastestClears("fastest-molten-core-clears", "Molten Core", "Molten Core")
	ulduar := fastestClears("fastest-ulduar-clears", "Ulduar", "Ulduar") // Wrath: not in a vanilla flavor
	bwl := fastestClears("fastest-blackwing-lair-clears", "Blackwing Lair", "Blackwing Lair")

	var ran []string
	run := func(_ context.Context, _ database.Store, c instancesearch.Compiled, _ instancesearch.SearchOptions) (instancesearch.Page, error) {
		ran = append(ran, c.Args[0].(string))
		switch c.Args[0] {
		case "Molten Core":
			return instancesearch.Page{Results: []instancesearch.Result{searchResult("Nightfall", started, "2292000", 2_292_000, "abc")}}, nil
		case "Blackwing Lair":
			return instancesearch.Page{Results: []instancesearch.Result{}}, nil
		}
		return instancesearch.Page{}, errors.New("unexpected search")
	}
	store := &searchStore{}
	out, err := newTestSearchesProducer([]curatedSearch{mc, ulduar, bwl}, run).Compute(ctx, Tenant{Store: store, Flavor: flavor})
	require.NoError(t, err)

	require.Equal(t, []string{"Molten Core", "Blackwing Lair"}, ran, "a raid the flavor does not register runs no query")
	require.Len(t, out, 2)
	require.Equal(t, "searches/fastest-molten-core-clears", out[0].Key)
	require.Equal(t, 1, out[0].SampleN)
	require.Equal(t, searchesMinSample, out[0].MinSample)
	require.Equal(t, "searches/fastest-blackwing-lair-clears", out[1].Key)
	require.Equal(t, 0, out[1].SampleN, "an empty result is still a page, below the minimum so it is noindex")
}

// A failing search keeps the page the last good run stored; with no previous
// page it is left out. Other searches are unaffected.
func TestSearchesProducerKeepsPreviousOnFailure(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	flavor := database.WoWFlavor{database.FlavorVanilla}
	mc := fastestClears("fastest-molten-core-clears", "Molten Core", "Molten Core")
	bwl := fastestClears("fastest-blackwing-lair-clears", "Blackwing Lair", "Blackwing Lair")
	naxx := fastestClears("fastest-naxxramas-clears", "Naxxramas", "Naxxramas")

	run := func(_ context.Context, _ database.Store, c instancesearch.Compiled, _ instancesearch.SearchOptions) (instancesearch.Page, error) {
		if c.Args[0] == "Naxxramas" {
			return instancesearch.Page{Results: []instancesearch.Result{searchResult("Fresh", time.Now(), "1000", 1000, "n")}}, nil
		}
		return instancesearch.Page{}, instancesearch.ErrTimeout
	}
	store := &searchStore{snapshots: map[string]database.StatsSnapshot{
		"searches/fastest-molten-core-clears": {PageKey: "searches/fastest-molten-core-clears", ProducerKey: "searches", Payload: []byte(`{"slug":"old"}`), SampleN: 7, MinSample: 1},
	}}
	out, err := newTestSearchesProducer([]curatedSearch{mc, bwl, naxx}, run).Compute(ctx, Tenant{Store: store, Flavor: flavor})
	require.NoError(t, err, "a failed search does not fail the run")

	require.Len(t, out, 2)
	require.Equal(t, "searches/fastest-molten-core-clears", out[0].Key)
	require.JSONEq(t, `{"slug":"old"}`, string(out[0].Payload.(json.RawMessage)), "the previous payload, unchanged")
	require.Equal(t, 7, out[0].SampleN)
	require.Equal(t, "searches/fastest-naxxramas-clears", out[1].Key, "Blackwing Lair failed with nothing stored: no page")
}

func TestSearchesIndexProducer(t *testing.T) {
	t.Parallel()
	store := &searchStore{snapshots: map[string]database.StatsSnapshot{
		"searches/fastest-naxxramas-clears":      {ProducerKey: "searches", SampleN: 12},
		"searches/fastest-molten-core-clears":    {ProducerKey: "searches", SampleN: 25},
		"searches/fastest-blackwing-lair-clears": {ProducerKey: "searches", SampleN: 0}, // empty: not listed
		"about":                                  {ProducerKey: "about", SampleN: 99},
	}}
	out, err := searchesIndexProducer{searches: curatedSearches}.Compute(context.Background(), Tenant{Store: store})
	require.NoError(t, err)
	require.Len(t, out, 1)
	require.Equal(t, "searches-index", out[0].Key)
	payload := out[0].Payload.(searchIndexPayload)
	var slugs []string
	for _, e := range payload.Entries {
		slugs = append(slugs, e.Slug)
	}
	require.Equal(t, []string{"fastest-molten-core-clears", "fastest-naxxramas-clears"}, slugs, "registry order, non-empty searches only")
	require.Equal(t, 2, out[0].SampleN)

	out, err = searchesIndexProducer{searches: curatedSearches}.Compute(context.Background(), Tenant{Store: &searchStore{}})
	require.NoError(t, err)
	require.Empty(t, out, "no searches with results, no index")
}
