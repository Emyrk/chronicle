package serviceexternalapi

import (
	"bytes"
	"compress/gzip"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"sort"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/Emyrk/chronicle/api/chronicleproto"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/database"
	"github.com/google/uuid"
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

func getSummary(t *testing.T, service *Service, path string) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest(http.MethodGet, path, nil)
	req.Host = "chronicle.example"
	req.Header.Set("X-Forwarded-Proto", "https")
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

	pull := DeathPull{SummaryPull: SummaryPull{Encounter: "Ragnaros", Attempt: 1}, Deaths: make([]PlayerDeath, maxDeathsPerResponse-1)}
	pull.TotalDeaths = len(pull.Deaths)
	second := DeathPull{SummaryPull: SummaryPull{Encounter: "Ragnaros", Attempt: 2}, Deaths: make([]PlayerDeath, 2), TotalDeaths: 2}
	response := renderDeaths(&deathSummary{pulls: []DeathPull{pull, second}}, summaryFilter{}, summaryLinks{}).(DeathsResponse)

	require.True(t, response.Truncated)
	require.Len(t, response.Pulls[0].Deaths, maxDeathsPerResponse-1)
	require.Empty(t, response.Pulls[1].Deaths)
	require.Equal(t, 2, response.Pulls[1].TotalDeaths)
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
		require.Equal(t, []string{"instance_id", "encounter", "attempt", "format"}, names)
	}
}
