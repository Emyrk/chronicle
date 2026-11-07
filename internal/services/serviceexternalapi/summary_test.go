package serviceexternalapi

import (
	"bytes"
	"compress/gzip"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"sort"
	"strconv"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/Emyrk/chronicle/api/chronicleproto"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/internal/aikey"
	"github.com/Emyrk/chronicle/internal/testutil"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/stretchr/testify/require"
	"google.golang.org/protobuf/encoding/protowire"
	"google.golang.org/protobuf/proto"
)

// The fixture is shared with the frontend parity test
// (agentSummaryParity.test.ts), which runs the same events through the
// Deaths and Consumables panel processors and checks the same expectations.
const summaryFixturePath = "../../../frontend/chronicle/src/pages/Instance/EventsPanels/agentSummaryParity.fixture.json"

type summaryFixture struct {
	Players map[string]struct {
		Name  string `json:"name"`
		Class string `json:"class"`
	} `json:"players"`
	Units      map[string]string `json:"units"`
	Encounters []struct {
		ID             uuid.UUID `json:"id"`
		Name           string    `json:"name"`
		Boss           bool      `json:"boss"`
		StartUnixMilli int64     `json:"startUnixMilli"`
		EndUnixMilli   int64     `json:"endUnixMilli"`
		KillType       string    `json:"killType"`
	} `json:"encounters"`
	Disambiguations []struct {
		EffectKind string `json:"effect_kind"`
		SpellID    int32  `json:"spell_id"`
		ItemID     int32  `json:"item_id"`
	} `json:"disambiguations"`
	Streams  map[string]map[string][]fixtureEvent `json:"streams"`
	Expected struct {
		Deaths      map[string][]fixtureDeath            `json:"deaths"`
		Consumables map[string]map[string]map[string]int `json:"consumables"`
	} `json:"expected"`
}

type fixtureEvent struct {
	Index       int32  `json:"index"`
	OffsetMilli int64  `json:"offsetMilli"`
	Target      string `json:"target"`
	Caster      string `json:"caster"`
	SourceName  string `json:"sourceName"`
	Amount      int32  `json:"amount"`
	Overkill    int32  `json:"overkill"`
	Overheal    int32  `json:"overheal"`
	SpellID     int32  `json:"spellId"`
	Tailers     []struct {
		Amount  uint32 `json:"amount"`
		HitType uint32 `json:"hitType"`
	} `json:"tailers"`
	Attribution *fixtureEvent `json:"attribution"`

	ConsumeID           string  `json:"consumeId"`
	EvidenceID          string  `json:"evidenceId"`
	Player              string  `json:"player"`
	ItemID              *int32  `json:"itemId"`
	ItemName            string  `json:"itemName"`
	CandidateItemIDs    []int32 `json:"candidateItemIds"`
	SpellName           string  `json:"spellName"`
	Kind                int32   `json:"kind"`
	Confidence          int32   `json:"confidence"`
	ObservedAtUnixMilli int64   `json:"observedAtUnixMilli"`
	IsProjection        bool    `json:"isProjection"`
}

type fixtureDeath struct {
	Player      string  `json:"player"`
	OffsetMilli int64   `json:"offsetMilli"`
	Killer      string  `json:"killer"`
	KillingBlow *string `json:"killingBlow"`
	Amount      int32   `json:"amount"`
	Recap       []struct {
		OffsetMilli int64  `json:"offsetMilli"`
		Type        string `json:"type"`
		Ability     string `json:"ability"`
		Amount      int32  `json:"amount"`
	} `json:"recap"`
}

func (e fixtureEvent) meta() *chronicleproto.EventMeta {
	return &chronicleproto.EventMeta{Index: e.Index, OffsetMilli: e.OffsetMilli}
}

func (e fixtureEvent) damage() *chronicleproto.Damage {
	damage := &chronicleproto.Damage{
		Meta: e.meta(), Caster: proto.String(e.Caster), SourceName: e.SourceName, Target: e.Target,
		Amount: e.Amount, Overkill: e.Overkill,
	}
	if e.SpellID != 0 {
		damage.SpellData = &chronicleproto.SpellData{Id: e.SpellID, Name: e.SourceName}
	}
	for _, tailer := range e.Tailers {
		damage.Tailers = append(damage.Tailers, &chronicleproto.Tailer{Amount: proto.Uint32(tailer.Amount), HitType: tailer.HitType})
	}
	return damage
}

func (e fixtureEvent) message(stream string) proto.Message {
	switch stream {
	case "slain":
		slain := &chronicleproto.Slain{Meta: e.meta(), Target: e.Target, Caster: proto.String(e.Caster)}
		if e.Attribution != nil {
			slain.Attribution = e.Attribution.damage()
		}
		return slain
	case "damage":
		return e.damage()
	case "heal":
		return &chronicleproto.Heal{Meta: e.meta(), Caster: e.Caster, Target: e.Target, SourceName: e.SourceName, Amount: e.Amount, Overheal: e.Overheal}
	case "consume":
		consume := &chronicleproto.Consume{
			Meta: e.meta(), ConsumeId: e.ConsumeID, EvidenceId: e.EvidenceID, Player: e.Player, ItemId: e.ItemID,
			CandidateItemIds: e.CandidateItemIDs, SpellData: &chronicleproto.SpellData{Id: e.SpellID, Name: e.SpellName},
			Kind: chronicleproto.EvidenceKind(e.Kind), Confidence: chronicleproto.EvidenceConfidence(e.Confidence),
			ObservedAtUnixMilli: e.ObservedAtUnixMilli, IsProjection: e.IsProjection,
		}
		if e.ItemName != "" {
			consume.ItemName = proto.String(e.ItemName)
		}
		return consume
	}
	panic("unknown stream " + stream)
}

func loadSummaryFixture(t *testing.T) summaryFixture {
	t.Helper()
	data, err := os.ReadFile(summaryFixturePath)
	require.NoError(t, err)
	var fixture summaryFixture
	require.NoError(t, json.Unmarshal(data, &fixture))
	return fixture
}

// encodeFixtureStream writes events the way encounterevents.Builder does:
// per-encounter segments with a header, gzip-compressed.
func encodeFixtureStream(t *testing.T, fixture summaryFixture, stream string) []byte {
	t.Helper()
	var raw []byte
	for _, encounter := range fixture.Encounters {
		events, ok := fixture.Streams[stream][encounter.ID.String()]
		if !ok {
			continue
		}
		var body []byte
		for _, event := range events {
			message, err := proto.Marshal(event.message(stream))
			require.NoError(t, err)
			body = protowire.AppendBytes(body, message)
		}
		raw = protowire.AppendString(raw, encounter.ID.String())
		raw = protowire.AppendVarint(raw, uint64(encounter.StartUnixMilli))
		raw = protowire.AppendVarint(raw, uint64(len(events)))
		raw = protowire.AppendVarint(raw, uint64(len(body)))
		raw = append(raw, body...)
	}
	var compressed bytes.Buffer
	writer := gzip.NewWriter(&compressed)
	_, err := writer.Write(raw)
	require.NoError(t, err)
	require.NoError(t, writer.Close())
	return compressed.Bytes()
}

func newSummaryFixtureService(t *testing.T) (*Service, *fakeExternalAPIStore, summaryFixture) {
	t.Helper()
	fixture := loadSummaryFixture(t)
	instanceID := uuid.MustParse("bbbbbbbb-0000-0000-0000-000000000000")
	store := &fakeExternalAPIStore{
		instance: database.LogInstancesGuild{
			ID: instanceID, Name: "Molten Core", RealmName: "Nordanaar",
			HashedSlug: pgtype.Text{String: "fixture-run", Valid: true},
		},
		datasetResolution: database.ResolveDatasetByRealmRow{ServerDatasetID: uuid.NullUUID{UUID: uuid.New(), Valid: true}},
		rankingRecords:    []database.EncounterDpsRanking{{PlayerGuid: "0x0000000000000001", PlayerRole: "tank"}},
		events:            make(map[string][]byte),
	}
	for id, player := range fixture.Players {
		parsed, err := guid.FromString(id)
		require.NoError(t, err)
		store.players = append(store.players, database.LogInstancePlayer{UnitGuid: parsed, Name: player.Name, Class: database.WowPlayableClass(player.Class)})
	}
	for id, name := range fixture.Units {
		parsed, err := guid.FromString(id)
		require.NoError(t, err)
		store.units = append(store.units, database.LogInstanceUnit{UnitGuid: parsed, Name: name})
	}
	// Reverse the stored order to check that pulls are ordered by start time.
	for i := len(fixture.Encounters) - 1; i >= 0; i-- {
		encounter := fixture.Encounters[i]
		store.encounters = append(store.encounters, database.LogInstanceEncounter{
			ID: encounter.ID, InstanceID: instanceID, Name: encounter.Name, Boss: encounter.Boss,
			StartTime: pgtype.Timestamptz{Time: time.UnixMilli(encounter.StartUnixMilli), Valid: true},
			EndTime:   pgtype.Timestamptz{Time: time.UnixMilli(encounter.EndUnixMilli), Valid: true},
			KillType:  database.KillType(encounter.KillType),
		})
	}
	for _, row := range fixture.Disambiguations {
		store.disambiguations = append(store.disambiguations, database.ListConsumableDisambiguationsByDatasetRow{
			EffectKind: row.EffectKind, SpellID: row.SpellID, ItemID: pgtype.Int4{Int32: row.ItemID, Valid: true},
		})
	}
	for stream := range fixture.Streams {
		store.events[stream] = encodeFixtureStream(t, fixture, stream)
	}
	service := &Service{db: store}
	service.setupRoutes()
	return service, store, fixture
}

var summaryClientIPs atomic.Uint32

// getSummary sends each request from a fresh client IP so tests are not
// throttled by the summary routes' rate-limit cost.
func getSummary(t *testing.T, service *Service, path string) *httptest.ResponseRecorder {
	t.Helper()
	ip := summaryClientIPs.Add(1)
	return getSummaryFrom(t, service, path, fmt.Sprintf("10.%d.%d.%d", byte(ip>>16), byte(ip>>8), byte(ip)))
}

func getSummaryFrom(t *testing.T, service *Service, path, clientIP string) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest(http.MethodGet, path, nil)
	req.Host = "chronicle.example"
	req.Header.Set("X-Forwarded-Proto", "https")
	req.Header.Set("X-Forwarded-For", clientIP)
	rec := httptest.NewRecorder()
	service.ServeHTTP(rec, req)
	return rec
}

func TestInstanceDeathsMatchesFixture(t *testing.T) {
	t.Parallel()
	service, _, fixture := newSummaryFixtureService(t)

	rec := getSummary(t, service, "/raidlogs/instances/fixture-run/deaths")
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
	var response DeathsResponse
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &response))

	require.Equal(t, "https://chronicle.example/instances/fixture-run", response.Instance.URL)
	require.False(t, response.Truncated)
	// Trash pulls are excluded; boss pulls are in time order with attempts.
	require.Len(t, response.Pulls, 2)
	require.Equal(t, []string{"wipe", "kill"}, []string{response.Pulls[0].Outcome, response.Pulls[1].Outcome})
	require.Equal(t, []int{1, 2}, []int{response.Pulls[0].Attempt, response.Pulls[1].Attempt})
	require.Equal(t, int64(192000), response.Pulls[0].DurationMs)

	for _, pull := range response.Pulls {
		expected := fixture.Expected.Deaths[pull.EncounterID.String()]
		require.Equal(t, len(expected), pull.TotalDeaths)
		require.Len(t, pull.Deaths, len(expected))
		for i, want := range expected {
			got := pull.Deaths[i]
			require.Equal(t, want.Player, got.Player.Name)
			require.Equal(t, want.OffsetMilli, got.TimeIntoPullMs)
			require.Equal(t, want.Killer, got.Killer)
			if want.KillingBlow == nil {
				require.Nil(t, got.KillingBlow)
			} else {
				require.NotNil(t, got.KillingBlow)
				require.Equal(t, *want.KillingBlow, got.KillingBlow.Ability)
				require.Equal(t, want.Amount, got.KillingBlow.Amount)
			}
			require.Len(t, got.Recap, len(want.Recap))
			for j, entry := range want.Recap {
				require.Equal(t, entry.OffsetMilli, got.Recap[j].TimeIntoPullMs)
				require.Equal(t, entry.Type, got.Recap[j].Type)
				require.Equal(t, entry.Ability, got.Recap[j].Ability)
				require.Equal(t, entry.Amount, got.Recap[j].Amount)
			}
		}
	}

	first := response.Pulls[0]
	require.Equal(t, &FirstDeath{Player: "Healy", TimeIntoPullMs: 30000}, first.FirstDeath)
	healy := first.Deaths[0]
	require.Equal(t, "PRIEST", healy.Player.Class)
	require.Equal(t, "https://chronicle.example/armory/Nordanaar/Healy", healy.Player.URL)
	require.Equal(t, &KillingBlow{Ability: "Wrath of Ragnaros", SpellID: 20566, Source: "Ragnaros", Amount: 3000, Overkill: 500}, healy.KillingBlow)
	require.Equal(t, "tank", first.Deaths[1].Player.Role)
}

func consumableKey(count ConsumableCount) string {
	switch {
	case count.ItemID != nil:
		return fmt.Sprintf("item:%d", *count.ItemID)
	case len(count.CandidateItemIDs) > 0:
		parts := make([]string, len(count.CandidateItemIDs))
		for i, id := range count.CandidateItemIDs {
			parts[i] = strconv.Itoa(int(id))
		}
		return "candidates:" + strings.Join(parts, ",")
	default:
		return "unknown-item"
	}
}

func consumablesByPlayer(players []PlayerConsumables) map[string]map[string]int {
	out := make(map[string]map[string]int, len(players))
	for _, player := range players {
		counts := make(map[string]int)
		total := 0
		for _, count := range player.Consumables {
			counts[consumableKey(count)] = count.Count
			total += count.Count
		}
		if total != player.Total {
			panic("player total does not match consumable counts")
		}
		out[player.Player.Name] = counts
	}
	return out
}

func TestInstanceConsumablesMatchesFixture(t *testing.T) {
	t.Parallel()
	service, _, fixture := newSummaryFixtureService(t)

	rec := getSummary(t, service, "/raidlogs/instances/fixture-run/consumables")
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
	var response ConsumablesResponse
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &response))

	require.Equal(t, fixture.Expected.Consumables["all"], consumablesByPlayer(response.Players))
	require.Len(t, response.Pulls, 2)
	for _, pull := range response.Pulls {
		require.Equal(t, fixture.Expected.Consumables[pull.EncounterID.String()], consumablesByPlayer(pull.Players), pull.EncounterID)
	}

	names := make([]string, 0, len(response.Players))
	for _, player := range response.Players {
		names = append(names, player.Player.Name)
	}
	require.True(t, sort.StringsAreSorted(names))

	// On the wipe, the flask was only seen as a buff active at the pull.
	tanky := response.Pulls[0].Players[2]
	require.Equal(t, "Tanky", tanky.Player.Name)
	require.Equal(t, "https://chronicle.example/armory/Nordanaar/Tanky", tanky.Player.URL)
	require.Equal(t, []ConsumableCount{{Name: "Flask of the Titans", ItemID: int32Pointer(13510), Count: 1, ActiveAtPull: 1}}, stripConsumableKeys(tanky.Consumables))
	// Ambiguous uses sort after identified items.
	hunty := response.Pulls[0].Players[1]
	require.Equal(t, []string{"Juju Power", "Free Action"}, []string{hunty.Consumables[0].Name, hunty.Consumables[1].Name})
	require.Equal(t, 1, hunty.Consumables[0].PreCombat)
}

func stripConsumableKeys(counts []ConsumableCount) []ConsumableCount {
	out := make([]ConsumableCount, len(counts))
	for i, count := range counts {
		count.key = ""
		out[i] = count
	}
	return out
}

func TestInstanceSummariesAreCached(t *testing.T) {
	t.Parallel()
	service, store, _ := newSummaryFixtureService(t)

	for range 3 {
		require.Equal(t, http.StatusOK, getSummary(t, service, "/raidlogs/instances/fixture-run/deaths").Code)
		require.Equal(t, http.StatusOK, getSummary(t, service, "/raidlogs/instances/fixture-run/deaths?encounter=Ragnaros&format=md").Code)
		require.Equal(t, http.StatusOK, getSummary(t, service, "/raidlogs/instances/fixture-run/consumables?attempt=2").Code)
	}
	// Each stream was decoded exactly once despite nine requests.
	require.Equal(t, map[string]int{"slain": 1, "damage": 1, "heal": 1, "consume": 1}, store.eventCalls)
}

func TestInstanceSummaryFilters(t *testing.T) {
	t.Parallel()
	service, _, _ := newSummaryFixtureService(t)

	cases := []struct {
		name     string
		path     string
		status   int
		attempts []int
	}{
		{name: "all", path: "/raidlogs/instances/fixture-run/deaths", status: http.StatusOK, attempts: []int{1, 2}},
		{name: "encounter is case-insensitive", path: "/raidlogs/instances/fixture-run/deaths?encounter=ragnaros", status: http.StatusOK, attempts: []int{1, 2}},
		{name: "attempt", path: "/raidlogs/instances/fixture-run/deaths?encounter=Ragnaros&attempt=2", status: http.StatusOK, attempts: []int{2}},
		{name: "encounter id", path: "/raidlogs/instances/fixture-run/deaths?encounter=aaaaaaaa-0000-0000-0000-000000000001", status: http.StatusOK, attempts: []int{1}},
		{name: "encounter id in any case", path: "/raidlogs/instances/fixture-run/deaths?encounter=AAAAAAAA-0000-0000-0000-000000000002", status: http.StatusOK, attempts: []int{2}},
		{name: "no match", path: "/raidlogs/instances/fixture-run/deaths?encounter=Onyxia", status: http.StatusOK, attempts: []int{}},
		{name: "consumables attempt", path: "/raidlogs/instances/fixture-run/consumables?attempt=1", status: http.StatusOK, attempts: []int{1}},
		{name: "bad attempt", path: "/raidlogs/instances/fixture-run/deaths?attempt=0", status: http.StatusBadRequest},
		{name: "bad format", path: "/raidlogs/instances/fixture-run/consumables?format=xml", status: http.StatusBadRequest},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			rec := getSummary(t, service, tc.path)
			require.Equal(t, tc.status, rec.Code, rec.Body.String())
			if tc.status != http.StatusOK {
				return
			}
			var response struct {
				Pulls []SummaryPull `json:"pulls"`
			}
			require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &response))
			attempts := []int{}
			for _, pull := range response.Pulls {
				attempts = append(attempts, pull.Attempt)
			}
			require.Equal(t, tc.attempts, attempts)
		})
	}
}

func TestInstanceSummaryMarkdown(t *testing.T) {
	t.Parallel()
	service, _, _ := newSummaryFixtureService(t)

	rec := getSummary(t, service, "/raidlogs/instances/fixture-run/deaths?format=md&attempt=1")
	require.Equal(t, http.StatusOK, rec.Code)
	require.Equal(t, "text/markdown; charset=utf-8", rec.Header().Get("Content-Type"))
	body := rec.Body.String()
	require.Contains(t, body, "# Deaths: [Molten Core](https://chronicle.example/instances/fixture-run)")
	require.Contains(t, body, "## Ragnaros, attempt 1 (wipe, 3:12)")
	require.Contains(t, body, "2 deaths. First: Healy at 0:30.")
	require.Contains(t, body, "| 0:30 | [Healy](https://chronicle.example/armory/Nordanaar/Healy) | PRIEST | - | Wrath of Ragnaros 3000 by Ragnaros (overkill 500) |")
	require.NotContains(t, body, "attempt 2")

	rec = getSummary(t, service, "/raidlogs/instances/fixture-run/consumables?format=md&attempt=2")
	require.Equal(t, http.StatusOK, rec.Code)
	body = rec.Body.String()
	require.Contains(t, body, "## Ragnaros, attempt 2 (kill)")
	require.Contains(t, body, "| [Healy](https://chronicle.example/armory/Nordanaar/Healy) | PRIEST | 2 | Major Mana Potion x2 |")
	require.Contains(t, body, "| [Tanky](https://chronicle.example/armory/Nordanaar/Tanky) | WARRIOR | 2 | Mighty Rage Potion, Flask of the Titans (pre-pull) |")
	require.Contains(t, body, "## Whole instance")
}

func TestDeathsResponseIsBounded(t *testing.T) {
	t.Parallel()

	pull := func(attempt, deaths int) DeathPull {
		out := DeathPull{SummaryPull: SummaryPull{Encounter: "Ragnaros", Attempt: attempt}, Deaths: make([]PlayerDeath, deaths), TotalDeaths: deaths}
		if deaths > 0 {
			out.FirstDeath = &FirstDeath{Player: "Tanky"}
		}
		return out
	}
	summary := &deathSummary{pulls: []DeathPull{pull(1, maxDeathsPerResponse-1), pull(2, 2), pull(3, 1), pull(4, 0)}}
	response := renderDeaths(summary, summaryFilter{}, summaryLinks{}).(DeathsResponse)

	require.True(t, response.Truncated)
	require.Len(t, response.Pulls, 4)
	require.Len(t, response.Pulls[0].Deaths, maxDeathsPerResponse-1)
	require.False(t, response.Pulls[0].Omitted)
	// The pull that does not fit and every later pull omit their deaths, even
	// one small enough to fit, so the included deaths are a complete prefix.
	for _, omitted := range response.Pulls[1:3] {
		require.Empty(t, omitted.Deaths)
		require.True(t, omitted.Omitted)
	}
	require.Equal(t, 2, response.Pulls[1].TotalDeaths)
	require.False(t, response.Pulls[3].Omitted, "pulls without deaths have nothing to omit")
	require.Contains(t, deathsMarkdown(response), "Individual deaths omitted to bound the response")
}

func TestConsumablesResponseIsBounded(t *testing.T) {
	t.Parallel()

	pull := func(attempt, rows int) ConsumablePull {
		return ConsumablePull{
			SummaryPull: SummaryPull{Encounter: "Ragnaros", Attempt: attempt},
			Players:     []PlayerConsumables{{Player: SummaryPlayer{Name: "Tanky"}, Total: rows, Consumables: make([]ConsumableCount, rows)}},
		}
	}
	summary := &consumablesSummary{
		pulls:   []ConsumablePull{pull(1, maxConsumableRowsPerResponse-1), pull(2, 2), pull(3, 1)},
		players: []PlayerConsumables{{Player: SummaryPlayer{Name: "Tanky"}, Total: 1}},
	}
	response := renderConsumables(summary, summaryFilter{}, summaryLinks{}).(ConsumablesResponse)

	require.True(t, response.Truncated)
	require.Len(t, response.Pulls[0].Players, 1)
	for _, omitted := range response.Pulls[1:] {
		require.Empty(t, omitted.Players)
		require.True(t, omitted.Omitted)
	}
	require.Len(t, response.Players, 1, "whole-instance totals are always included")
	require.Contains(t, consumablesMarkdown(response), "Players omitted to bound the response")
}

func TestSummaryRateLimitCost(t *testing.T) {
	t.Parallel()
	service, _, _ := newSummaryFixtureService(t)

	// The burst is 20 standard requests and a summary costs 5, so the fifth
	// request from one client in a burst is throttled.
	for range 4 {
		require.Equal(t, http.StatusOK, getSummaryFrom(t, service, "/raidlogs/instances/fixture-run/deaths", "192.0.2.10").Code)
	}
	require.Equal(t, http.StatusTooManyRequests, getSummaryFrom(t, service, "/raidlogs/instances/fixture-run/consumables", "192.0.2.10").Code)
}

func TestSummaryBusyReturns503(t *testing.T) {
	t.Parallel()
	service, store, _ := newSummaryFixtureService(t)

	// Occupy every computation slot; a cache miss must not queue.
	slots := service.deathCache.slots
	for range cap(slots) {
		slots <- struct{}{}
	}
	rec := getSummary(t, service, "/raidlogs/instances/fixture-run/consumables")
	require.Equal(t, http.StatusServiceUnavailable, rec.Code, rec.Body.String())
	require.Equal(t, "1", rec.Header().Get("Retry-After"))
	require.Zero(t, store.eventCalls["consume"], "busy requests must not load streams")

	// Busy is not cached as a failure: once a slot frees, the request works.
	<-slots
	require.Equal(t, http.StatusOK, getSummary(t, service, "/raidlogs/instances/fixture-run/consumables").Code)
}

func TestSummaryFailuresAreCachedBriefly(t *testing.T) {
	t.Parallel()
	service, store, _ := newSummaryFixtureService(t)
	store.events["slain"] = []byte("not gzip")

	for range 3 {
		require.Equal(t, http.StatusInternalServerError, getSummary(t, service, "/raidlogs/instances/fixture-run/deaths").Code)
	}
	require.Equal(t, 1, store.eventCalls["slain"], "a bad stream is decoded once, not on every request")
}

func TestSummaryComputeIsDetachedAndBounded(t *testing.T) {
	t.Parallel()
	cache := newSummaryCache[int](make(chan struct{}, 1))
	ctx, cancel := context.WithCancel(context.Background())
	cancel() // the requesting client already went away

	value, err := cache.get(ctx, uuid.New(), func(ctx context.Context) (int, error) {
		require.NoError(t, ctx.Err(), "computation must survive the client disconnecting")
		deadline, ok := ctx.Deadline()
		require.True(t, ok)
		require.WithinDuration(t, time.Now().Add(summaryComputeTimeout), deadline, 5*time.Second)
		return 7, nil
	})
	require.NoError(t, err)
	require.Equal(t, 7, value)
}

func gzipBytes(t *testing.T, raw []byte) []byte {
	t.Helper()
	var compressed bytes.Buffer
	writer := gzip.NewWriter(&compressed)
	_, err := writer.Write(raw)
	require.NoError(t, err)
	require.NoError(t, writer.Close())
	return compressed.Bytes()
}

func TestDecodeEventSegmentsLimits(t *testing.T) {
	t.Parallel()

	segment := func(messages ...[]byte) []byte {
		var body []byte
		for _, message := range messages {
			body = protowire.AppendBytes(body, message)
		}
		raw := protowire.AppendString(nil, "aaaaaaaa-0000-0000-0000-000000000001")
		raw = protowire.AppendVarint(raw, 1767225600000)
		raw = protowire.AppendVarint(raw, uint64(len(messages)))
		raw = protowire.AppendVarint(raw, uint64(len(body)))
		return append(raw, body...)
	}
	stream := gzipBytes(t, append(segment([]byte("one"), []byte("two")), segment(bytes.Repeat([]byte("x"), 100))...))
	ctx := context.Background()
	count := func(limits streamLimits) (int, error) {
		n := 0
		err := decodeEventSegments(ctx, stream, limits, func(string, time.Time, []byte) error {
			n++
			return nil
		})
		return n, err
	}

	n, err := count(defaultStreamLimits)
	require.NoError(t, err)
	require.Equal(t, 3, n)

	_, err = count(streamLimits{totalBytes: 1 << 20, messageBytes: 50})
	require.ErrorIs(t, err, errEventStreamTooLong, "a message over the per-message cap")

	_, err = count(streamLimits{totalBytes: 100, messageBytes: 1 << 20})
	require.ErrorIs(t, err, errEventStreamTooLong, "a stream over the decompressed cap")

	truncated := gzipBytes(t, segment([]byte("one"), []byte("two"))[:60])
	err = decodeEventSegments(ctx, truncated, defaultStreamLimits, func(string, time.Time, []byte) error { return nil })
	require.ErrorIs(t, err, io.ErrUnexpectedEOF)

	cancelled, cancel := context.WithCancel(ctx)
	cancel()
	err = decodeEventSegments(cancelled, stream, defaultStreamLimits, func(string, time.Time, []byte) error { return nil })
	require.ErrorIs(t, err, context.Canceled)
}

func TestSummaryMarkdownEscapesHostileNames(t *testing.T) {
	t.Parallel()
	hostile := "Evil|Name\\]x\n<b>"
	player := SummaryPlayer{Name: hostile, Class: "WARRIOR", URL: "https://chronicle.example/armory/R/E(v)il"}
	deaths := DeathsResponse{
		Instance: SummaryInstance{Name: "Molten | Core", URL: "https://chronicle.example/instances/x"},
		Pulls: []DeathPull{{
			SummaryPull: SummaryPull{Encounter: hostile, Attempt: 1, Outcome: "wipe"},
			TotalDeaths: 1, FirstDeath: &FirstDeath{Player: hostile},
			Deaths: []PlayerDeath{{
				Player: player, Killer: hostile,
				KillingBlow: &KillingBlow{Ability: hostile, Source: hostile, Amount: 1},
				Recap:       []DeathRecapEntry{{Type: "damage", Ability: hostile, Source: hostile, Amount: 1}},
			}},
		}},
	}
	consumables := ConsumablesResponse{
		Instance: deaths.Instance,
		Players:  []PlayerConsumables{{Player: player, Total: 1, Consumables: []ConsumableCount{{Name: hostile, Count: 1}}}},
	}

	for name, body := range map[string]string{"deaths": deathsMarkdown(deaths), "consumables": consumablesMarkdown(consumables)} {
		t.Run(name, func(t *testing.T) {
			require.NotContains(t, body, "<b>", "HTML must be escaped")
			require.Contains(t, body, `Evil\|Name\\\]x \<b\>`)
			require.Contains(t, body, "(https://chronicle.example/armory/R/E%28v%29il)", "parentheses must not close the link")
			for _, line := range strings.Split(body, "\n") {
				if strings.HasPrefix(line, "| ") && !strings.HasPrefix(line, "| Time") && !strings.HasPrefix(line, "| Player") {
					// Every data row keeps its column count: escaped pipes do not split cells.
					cells := strings.Count(strings.ReplaceAll(line, `\|`, ""), "|")
					want := 7
					if name == "consumables" {
						want = 5
					}
					require.Equal(t, want, cells, line)
				}
			}
		})
	}
}

func TestSummaryRoutesInOpenAPI(t *testing.T) {
	t.Parallel()
	service := &Service{db: &fakeExternalAPIStore{}}
	service.setupRoutes()

	for _, path := range []string{"/raidlogs/instances/{instance_id}/deaths", "/raidlogs/instances/{instance_id}/consumables"} {
		operation, ok := service.openapi.Paths[path]["get"]
		require.True(t, ok, path)
		require.Contains(t, operation.Responses["200"].Content, "text/markdown")
		names := make([]string, 0, len(operation.Parameters))
		for _, parameter := range operation.Parameters {
			names = append(names, parameter.Name)
		}
		require.Equal(t, []string{"instance_id", "encounter", "attempt", "format", "ai_key"}, names)
	}
}

// keyStore is an aikey.Store with one key and buckets that never run out.
type keyStore struct{ row database.AiKey }

func (keyStore) TakeRateLimitTokens(context.Context, database.TakeRateLimitTokensParams) (database.TakeRateLimitTokensRow, error) {
	return database.TakeRateLimitTokensRow{Allowed: true, Tokens: 1}, nil
}

func (keyStore) ForceTakeRateLimitTokens(context.Context, database.ForceTakeRateLimitTokensParams) (float64, error) {
	return 1, nil
}

func (keyStore) PeekRateLimitTokens(_ context.Context, arg database.PeekRateLimitTokensParams) (float64, error) {
	return arg.Burst, nil
}

func (s keyStore) GetAIKeyByHashedSecret(_ context.Context, hashed []byte) (database.AiKey, error) {
	if !bytes.Equal(hashed, s.row.HashedSecret) {
		return database.AiKey{}, pgx.ErrNoRows
	}
	return s.row, nil
}

func (keyStore) TouchAIKey(context.Context, database.TouchAIKeyParams) error { return nil }

func TestSummaryRoutesWithAIKey(t *testing.T) {
	t.Parallel()
	_, store, _ := newSummaryFixtureService(t)
	secret, err := aikey.Generate()
	require.NoError(t, err)
	keys := keyStore{row: database.AiKey{
		ID: uuid.New(), UserID: uuid.New(), TenantScopeID: aikey.TenantScope(uuid.Nil),
		HashedSecret: aikey.Hash(secret),
		CreatedAt:    database.Timestamptz(time.Now()), ExpiresAt: database.Timestamptz(time.Now().Add(time.Hour)),
	}}
	service := &Service{db: store}
	service.aiKeys = aikey.NewAuthenticator(testutil.Logger(t), keys, func(context.Context, uuid.UUID) (string, error) { return "free", nil })
	service.setupRoutes()

	for _, route := range []string{"deaths", "consumables"} {
		// One client IP well past the anonymous summary burst: keyed requests
		// use the key's view buckets, not the IP bucket.
		for i := range 6 {
			rec := getSummaryFrom(t, service, "/raidlogs/instances/fixture-run/"+route+"?format=md&ai_key="+secret, "192.0.2.40")
			require.Equal(t, http.StatusOK, rec.Code, "%s %d: %s", route, i, rec.Body.String())
			require.Equal(t, "no-store", rec.Header().Get("Cache-Control"), route)
			require.Equal(t, "no-referrer", rec.Header().Get("Referrer-Policy"), route)
			require.Equal(t, "noindex", rec.Header().Get("X-Robots-Tag"), route)
			require.NotEmpty(t, rec.Header().Get(aikey.ViewsRemainingTodayHeader), route)
			require.Contains(t, rec.Body.String(), "https://chronicle.example/instances/fixture-run?ai_key="+secret, route)
			require.Contains(t, rec.Body.String(), "https://chronicle.example/armory/Nordanaar/Healy?ai_key="+secret, route)
		}
		rec := getSummaryFrom(t, service, "/raidlogs/instances/fixture-run/"+route+"?ai_key=ck_wrong", "192.0.2.41")
		require.Equal(t, http.StatusUnauthorized, rec.Code, route)
	}

	// Without a key, links stay plain.
	rec := getSummary(t, service, "/raidlogs/instances/fixture-run/deaths?format=md")
	require.Equal(t, http.StatusOK, rec.Code)
	require.NotContains(t, rec.Body.String(), "ai_key")
}
