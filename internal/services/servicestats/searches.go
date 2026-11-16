package servicestats

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net/url"
	"strconv"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/Emyrk/chronicle/combatlog/parser/common/registry"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/internal/instancesearch"
)

// Curated searches: named instance searches (searches_registry.go) run nightly
// per tenant through the instance search engine and published as
// /stats/searches/{slug}, with an index at /stats/searches.
//
// A search runs exactly as the app runs one: compiled for the tenant in ctx,
// then executed in a read-only transaction under a statement timeout
// (instancesearch.DefaultStatementTimeout), so row-level security scopes it to
// the tenant and it only sees finalized, listed logs. The queries run one after
// another inside one job, so a tenant never has two in flight. The per-user token
// buckets and the HTTP concurrency slots belong to callers on behalf of users;
// this trusted background job instead keeps to the cost cap the registry test
// enforces (the anonymous budget) and to the timeouts here.

const (
	searchesKey = "searches"
	// searchesCadence is nightly: results move as raids are uploaded, not by the
	// hour, and each run costs up to one query per curated search.
	searchesCadence = 24 * time.Hour
	// searchesTimeout bounds one tenant's whole run: every curated search at its
	// full statement timeout, with headroom.
	searchesTimeout = 5 * time.Minute
	// searchesMinSample is the number of results below which a page is noindex:
	// an empty search has nothing to answer.
	searchesMinSample = 1

	searchesIndexKey     = "searches-index"
	searchesIndexCadence = time.Hour
)

// searchRow is one result run.
type searchRow struct {
	Rank       int       `json:"rank"`
	Guild      string    `json:"guild,omitempty"`
	Raid       string    `json:"raid"`
	Date       time.Time `json:"date"`
	Difficulty string    `json:"difficulty,omitempty"`
	MaxPlayers int32     `json:"max_players,omitempty"`
	Players    int64     `json:"players"`
	Bosses     int64     `json:"bosses"`
	Value      string    `json:"value,omitempty"`
	// RaidID is the SPA identifier of the raid: its hashed slug, else its ID.
	RaidID string `json:"raid_id"`
}

// searchPayload is everything a search page shows, so the page never depends on
// the registry staying the same between runs.
type searchPayload struct {
	Slug        string      `json:"slug"`
	Title       string      `json:"title"`
	Answer      string      `json:"answer"`
	About       string      `json:"about"`
	ValueHeader string      `json:"value_header,omitempty"`
	AsOf        time.Time   `json:"as_of"`
	SearchHref  string      `json:"search_href"`
	Results     []searchRow `json:"results"`
	// More is true when the search matches more runs than are listed.
	More bool `json:"more,omitempty"`
}

type searchesProducer struct {
	logger   *slog.Logger
	searches []curatedSearch
	run      func(context.Context, database.Store, instancesearch.Compiled, instancesearch.SearchOptions) (instancesearch.Page, error)
	now      func() time.Time
}

func newSearchesProducer() *searchesProducer {
	return &searchesProducer{logger: slog.Default(), searches: curatedSearches, run: instancesearch.Search, now: time.Now}
}

func (p *searchesProducer) SetLogger(l *slog.Logger) { p.logger = l }

func (*searchesProducer) Key() string            { return searchesKey }
func (*searchesProducer) Cadence() time.Duration { return searchesCadence }
func (*searchesProducer) Timeout() time.Duration { return searchesTimeout }

func (p *searchesProducer) Compute(ctx context.Context, tenant Tenant) ([]Output, error) {
	known := tenantInstanceNames(tenant.Flavor)
	var outputs []Output
	for _, s := range p.searches {
		if s.Requires != "" && !known[s.Requires] {
			continue // the server has no such raid: no query, no page
		}
		if err := ctx.Err(); err != nil {
			return nil, err
		}
		payload, err := p.runSearch(ctx, tenant, s)
		if err != nil {
			// Keep serving the last good page rather than dropping it.
			p.logger.WarnContext(ctx, "curated search failed, keeping its previous page",
				slog.String("slug", s.Slug), slog.String("tenant", tenant.ID.String()), slog.String("error", err.Error()))
			if prev, ok := p.previous(ctx, tenant, s.Slug); ok {
				outputs = append(outputs, prev)
			}
			continue
		}
		outputs = append(outputs, Output{
			Key:       PageKey(searchesKey, s.Slug),
			Payload:   payload,
			SampleN:   len(payload.Results),
			MinSample: searchesMinSample,
		})
	}
	return outputs, nil
}

func (p *searchesProducer) runSearch(ctx context.Context, tenant Tenant, s curatedSearch) (searchPayload, error) {
	compiled, err := instancesearch.CompileForContext(ctx, s.Query, instancesearch.Options{})
	if err != nil {
		return searchPayload{}, fmt.Errorf("compile: %w", err)
	}
	page, err := p.run(ctx, tenant.Store, compiled, instancesearch.SearchOptions{})
	if err != nil {
		return searchPayload{}, fmt.Errorf("search: %w", err)
	}
	return buildSearchPayload(s, page, p.now()), nil
}

// previous re-emits the last stored page for slug, unchanged.
func (p *searchesProducer) previous(ctx context.Context, tenant Tenant, slug string) (Output, bool) {
	key := PageKey(searchesKey, slug)
	row, err := tenant.Store.GetStatsSnapshot(ctx, database.GetStatsSnapshotParams{TenantID: tenant.ID, PageKey: key})
	if err != nil {
		if !errors.Is(err, pgx.ErrNoRows) {
			p.logger.WarnContext(ctx, "read previous curated search page", slog.String("slug", slug), slog.String("error", err.Error()))
		}
		return Output{}, false
	}
	return Output{Key: key, Payload: json.RawMessage(row.Payload), SampleN: int(row.SampleN), MinSample: int(row.MinSample)}, true
}

// tenantInstanceNames is every instance (and derived) name the tenant's flavor registers.
func tenantInstanceNames(flavor database.WoWFlavor) map[string]bool {
	known := map[string]bool{}
	for _, d := range registry.RegistryForFlavor(slog.New(slog.DiscardHandler), flavor).AllInstanceDetails() {
		known[d.Name] = true
		for _, derived := range d.DerivedNames {
			known[derived] = true
		}
	}
	return known
}

func buildSearchPayload(s curatedSearch, page instancesearch.Page, asOf time.Time) searchPayload {
	payload := searchPayload{
		Slug: s.Slug, Title: s.Title, Answer: s.Answer, About: s.About, ValueHeader: s.ValueHeader,
		AsOf: asOf.UTC(), SearchHref: searchHref(s.Query), Results: []searchRow{}, More: page.Next != nil,
	}
	for i, r := range page.Results {
		if i >= searchesShown {
			payload.More = true
			break
		}
		raid := r.ID.String()
		if r.Slug != "" {
			raid = r.Slug
		}
		payload.Results = append(payload.Results, searchRow{
			Rank: i + 1, Guild: r.GuildName, Raid: r.Name, Date: r.StartedAt.UTC(),
			Difficulty: r.DifficultyName, MaxPlayers: r.MaxPlayers,
			Players: r.PlayerCount, Bosses: r.BossesKilled,
			Value: searchValue(s, r), RaidID: raid,
		})
	}
	return payload
}

// searchValue is the sort property's value for the value column: a duration
// for the time sorts, else the number as is. "" when the search has no value column.
func searchValue(s curatedSearch, r instancesearch.Result) string {
	if s.ValueHeader == "" {
		return ""
	}
	var ms int64
	switch {
	case r.SortValue != nil:
		n, err := strconv.ParseInt(*r.SortValue, 10, 64)
		if err != nil {
			return *r.SortValue
		}
		ms = n
	case r.ClearTimeMS != nil:
		ms = *r.ClearTimeMS
	default:
		return ""
	}
	if s.Query.Sort != nil {
		switch s.Query.Sort.Field {
		case instancesearch.SortClearTime, instancesearch.SortKillTime, instancesearch.SortIdleTime, instancesearch.SortBossTime:
		default:
			return strconv.FormatInt(ms, 10)
		}
	}
	return searchClock(ms)
}

// searchClock formats a duration in milliseconds as m:ss, or h:mm:ss from an hour.
func searchClock(ms int64) string {
	secs := ms / 1000
	if secs >= 3600 {
		return fmt.Sprintf("%d:%02d:%02d", secs/3600, secs/60%60, secs%60)
	}
	return fmt.Sprintf("%d:%02d", secs/60, secs%60)
}

// searchHref is the SPA's search page for q: `?q=` is the base64url JSON of the
// where tree (the SPA's encodeQuery) and `sort`, `order` and `sort_boss` carry a
// non-default sort, as the SPA writes them. With no tree it opens the empty search.
func searchHref(q instancesearch.Query) string {
	params := url.Values{}
	if q.Where != nil {
		raw, err := json.Marshal(q.Where)
		if err == nil {
			params.Set("q", base64.RawURLEncoding.EncodeToString(raw))
		}
	}
	if q.Sort != nil && q.Sort.Field != instancesearch.SortStartedAt {
		params.Set("sort", string(q.Sort.Field))
		direction := q.Sort.Direction
		if direction == "" {
			direction = instancesearch.SortAsc
		}
		params.Set("order", string(direction))
		if q.Sort.Field == instancesearch.SortKillTime && q.Sort.Boss != "" {
			params.Set("sort_boss", q.Sort.Boss)
		}
	}
	if len(params) == 0 {
		return "/search"
	}
	return "/search?" + params.Encode()
}

func searchesFamily() Family {
	return Family{Pattern: "/stats/searches/{slug}", Producer: newSearchesProducer(), Render: renderSearch}
}

func renderSearch(site Site, _ Page, snap Snapshot) (Content, error) {
	p, err := Decode[searchPayload](snap)
	if err != nil {
		return Content{}, err
	}
	label := site.Label()
	title := strings.ReplaceAll(p.Title, "{server}", label)
	asOf := FormatDate(p.AsOf)

	var lead string
	if len(p.Results) == 0 {
		lead = fmt.Sprintf("As of %s, no run on %s matches this search yet.", asOf, label)
	} else {
		top := p.Results[0]
		by := "in a pickup raid"
		if top.Guild != "" {
			by = "by " + top.Guild
		}
		answer := strings.NewReplacer(
			"{server}", label, "{value}", top.Value, "{by}", by, "{date}", FormatDate(top.Date),
		).Replace(p.Answer)
		shown := fmt.Sprintf("it lists %s", searchRuns(len(p.Results)))
		if p.More {
			shown = fmt.Sprintf("it lists the first %s of more matches", searchRuns(len(p.Results)))
		}
		lead = fmt.Sprintf("%s As of %s, %s.", answer, asOf, shown)
	}
	lead += " These are runs from combat logs uploaded to Chronicle, not every raid on the server."

	content := Content{
		Title:       title,
		Description: lead,
		Lead:        lead,
		SampleLabel: "runs",
		Window:      "all time",
		Sections: []Section{{
			Heading:    "About this search",
			Paragraphs: []string{p.About + " Only listed logs count, and a raid uploaded by several players is one run."},
		}},
		Links: []Link{
			{Text: "Open this search in Chronicle", Href: p.SearchHref},
			{Text: "All curated searches", Href: "/stats/searches"},
			{Text: "How search works", Href: "/search/guide"},
		},
	}
	if len(p.Results) > 0 {
		headers := []string{"Rank", "Guild", "Raid", "Date", "Players"}
		if p.ValueHeader != "" {
			headers = append(headers, p.ValueHeader)
		}
		headers = append(headers, "Log")
		table := &Table{Caption: title, Headers: headers}
		for _, r := range p.Results {
			guild := r.Guild
			if guild == "" {
				guild = "Pickup raid"
			}
			raid := r.Raid
			if size := searchBoardSize(r); size != "" {
				raid += " (" + size + ")"
			}
			cells := []Cell{{Text: strconv.Itoa(r.Rank)}, {Text: guild}, {Text: raid}, {Text: FormatDate(r.Date)}, {Text: FormatInt(r.Players)}}
			if p.ValueHeader != "" {
				cells = append(cells, Cell{Text: r.Value})
			}
			cells = append(cells, Cell{Text: "View raid", Href: "/instances/" + r.RaidID})
			table.Rows = append(table.Rows, cells)
		}
		content.Table = table
	}
	return content, nil
}

func searchRuns(n int) string {
	if n == 1 {
		return "1 run"
	}
	return FormatInt(int64(n)) + " runs"
}

// searchBoardSize labels a run's difficulty and raid size, without repeating
// the size when the difficulty already carries it ("25 Player").
func searchBoardSize(r searchRow) string {
	size := ""
	if r.MaxPlayers > 0 {
		size = strconv.Itoa(int(r.MaxPlayers))
	}
	switch {
	case r.Difficulty != "" && (size == "" || strings.Contains(r.Difficulty, size)):
		return r.Difficulty
	case r.Difficulty != "" && size != "":
		return r.Difficulty + ", " + size + " players"
	case size != "":
		return size + " players"
	}
	return ""
}

// --- index ---

type searchIndexEntry struct {
	Slug  string `json:"slug"`
	Title string `json:"title"`
	About string `json:"about"`
	Runs  int    `json:"runs"`
}

type searchIndexPayload struct {
	Entries []searchIndexEntry `json:"entries"`
}

// searchesIndexProducer lists the curated searches that have results for the
// tenant. It reads the other family's snapshot metadata, never the search
// engine, so it is cheap to run every hour; a new search appears within the
// hour after its first run.
type searchesIndexProducer struct{ searches []curatedSearch }

func (searchesIndexProducer) Key() string            { return searchesIndexKey }
func (searchesIndexProducer) Cadence() time.Duration { return searchesIndexCadence }
func (searchesIndexProducer) Timeout() time.Duration { return 0 }

func (p searchesIndexProducer) Compute(ctx context.Context, tenant Tenant) ([]Output, error) {
	meta, err := tenant.Store.ListStatsSnapshotMeta(ctx, tenant.ID)
	if err != nil {
		return nil, fmt.Errorf("list stats snapshots: %w", err)
	}
	runs := map[string]int{}
	for _, m := range meta {
		if m.ProducerKey == searchesKey && m.SampleN > 0 {
			runs[m.PageKey] = int(m.SampleN)
		}
	}
	var payload searchIndexPayload
	for _, s := range p.searches {
		if n := runs[PageKey(searchesKey, s.Slug)]; n > 0 {
			payload.Entries = append(payload.Entries, searchIndexEntry{Slug: s.Slug, Title: s.Title, About: s.About, Runs: n})
		}
	}
	if len(payload.Entries) == 0 {
		return nil, nil
	}
	return []Output{{Key: searchesIndexKey, Payload: payload, SampleN: len(payload.Entries), MinSample: 1}}, nil
}

func searchesIndexFamily() Family {
	return Family{Pattern: "/stats/searches", Producer: searchesIndexProducer{searches: curatedSearches}, Render: renderSearchIndex}
}

func renderSearchIndex(site Site, _ Page, snap Snapshot) (Content, error) {
	p, err := Decode[searchIndexPayload](snap)
	if err != nil {
		return Content{}, err
	}
	label := site.Label()
	lead := fmt.Sprintf("As of %s, Chronicle publishes %d curated searches of %s raid logs, such as %s. Each page lists the matching runs with a link to open the same search in Chronicle. These are runs from uploaded combat logs, not every raid on the server.",
		FormatDate(snap.ComputedAt), len(p.Entries), label, strings.ReplaceAll(p.Entries[0].Title, "{server}", label))
	table := &Table{Caption: "Curated searches", Headers: []string{"Search", "What it finds", "Runs listed"}}
	for _, e := range p.Entries {
		table.Rows = append(table.Rows, []Cell{
			{Text: strings.ReplaceAll(e.Title, "{server}", label), Href: "/stats/searches/" + e.Slug},
			{Text: e.About},
			{Text: FormatInt(int64(e.Runs))},
		})
	}
	return Content{
		Title:       fmt.Sprintf("Which raid searches does Chronicle publish for %s?", label),
		Description: lead,
		Lead:        lead,
		SampleLabel: "searches",
		Window:      "all time",
		Table:       table,
		Links: []Link{
			{Text: "Search raid logs", Href: "/search"},
			{Text: "How search works", Href: "/search/guide"},
		},
	}, nil
}
