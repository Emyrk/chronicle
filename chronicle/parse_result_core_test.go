package chronicle

import (
	"encoding/json"
	"testing"
	"time"

	"github.com/Emyrk/chronicle/chronicle/parseresult"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/dbtestutil"
	"github.com/Emyrk/chronicle/internal/testutil"
	"github.com/google/go-cmp/cmp"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/stretchr/testify/require"
)

func TestParsedCoreRowsMatchDirectWriterAfterJSONRoundTrip(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitLong)
	store, _ := dbtestutil.NewDB(t)
	at := time.Date(2026, 1, 2, 3, 4, 5, 0, time.UTC)
	owner, server, realm, group := uuid.New(), uuid.New(), uuid.New(), uuid.New()
	_, err := store.InsertUser(ctx, database.InsertUserParams{ID: owner, Username: "core-parity-" + owner.String()})
	require.NoError(t, err)
	_, err = store.InsertWoWServer(ctx, database.InsertWoWServerParams{ID: server, Name: "core-parity-" + server.String()})
	require.NoError(t, err)
	_, err = store.InsertWoWServerRealm(ctx, database.InsertWoWServerRealmParams{ID: realm, ServerID: server, Name: "Core Test Realm"})
	require.NoError(t, err)
	_, err = store.InsertWoWLogGroup(ctx, database.InsertWoWLogGroupParams{ID: group, Owner: owner, LogType: database.LogTypeV2, CreatedAt: database.Timestamptz(at), UpdatedAt: database.Timestamptz(at)})
	require.NoError(t, err)
	require.NoError(t, store.InsertParsedLogGroup(ctx, group))
	ids := [2]uuid.UUID{uuid.New(), uuid.New()}
	encounters := [2]uuid.UUID{uuid.New(), uuid.New()}
	phases := [2]uuid.UUID{uuid.New(), uuid.New()}
	hostile, err := guid.FromString("0xF130000001000001")
	require.NoError(t, err)
	complete := true
	result := parseresult.Result{SchemaVersion: 3, Format: database.LogFormat112aCcAddon, Name: "Core Test", Versions: map[string]string{"addon": "1.0"},
		Core:     parseresult.CoreInstance{Category: "raid", DifficultyName: "Normal", MaxPlayers: 40, Start: at, End: at.Add(time.Minute), Capabilities: []string{"events"}},
		Overview: parseresult.Overview{RequirementsComplete: &complete, PlayerDeaths: 2, WipeCount: 1, MetricsVersion: 1, TopIncomingDamageAbilities: []parseresult.IncomingDamageAbility{{Name: "Fire", Damage: 8, Hits: 2}}},
		Units:    []parseresult.UnitMetadata{{GUID: hostile.String(), Name: "Hostile", Entry: 1}},
	}
	result.Encounters = []parseresult.Encounter{{ID: encounters[1].String(), Name: "Boss", MapID: 1, KillType: "clean", Boss: true, Start: at, End: at.Add(time.Minute), Fights: []parseresult.Fight{{GUID: hostile.String(), Boss: true, Periods: []parseresult.FightPeriod{{Start: &parseresult.FightMoment{Timestamp: at, Reason: "engage", MessageType: "event", Message: json.RawMessage(`{"id":1}`)}, EndState: "slain"}}}}, Phases: []parseresult.Phase{{ID: phases[1].String(), Key: "one", Name: "Phase One", Order: 1, StartOffsetMs: 0, EndOffsetMs: 5000, KillType: "clean"}}}}
	result.RaidSnapshots = []parseresult.RaidSnapshot{{ObservedAt: at}}
	for g := range result.RaidSnapshots[0].Composition {
		for m := range result.RaidSnapshots[0].Composition[g] {
			result.RaidSnapshots[0].Composition[g][m] = guid.GUID(0).String()
		}
	}
	// Direct writer inputs mirror the legacy insert arguments on the first isolated row set.
	legacy, err := store.InsertInstance(ctx, database.InsertInstanceParams{ID: ids[0], RealmID: realm, LogGroupID: group, Name: result.Name, StartTime: database.Timestamptz(at), EndTime: database.Timestamptz(at.Add(time.Minute)), Capabilities: []string{"events"}, Versions: database.VersionsMap(result.Versions), ParserVersion: "test", DifficultyName: "Normal", MaxPlayers: 40, Category: pgtype.Text{String: "raid", Valid: true}})
	require.NoError(t, err)
	require.NoError(t, store.UpsertInstanceOverviewMetrics(ctx, database.UpsertInstanceOverviewMetricsParams{InstanceID: ids[0], RequirementsComplete: pgtype.Bool{Bool: true, Valid: true}, PlayerDeaths: 2, WipeCount: 1, MetricsVersion: 1, TopIncomingDamageAbilities: []database.OverviewIncomingDamageAbility{{Name: "Fire", Damage: 8, Hits: 2}}}))
	_, err = store.InsertEncounter(ctx, database.InsertEncounterParams{ID: encounters[0], InstanceID: ids[0], Name: "Boss", MapID: 1, KillType: database.KillType("clean"), Remaining: []guid.GUID{}, Boss: true, StartTime: database.Timestamptz(at), EndTime: database.Timestamptz(at.Add(time.Minute))})
	require.NoError(t, err)
	require.NoError(t, store.InsertEncounterCharacterFights(ctx, []database.InsertEncounterCharacterFightsParams{{ID: hostile, Boss: true, EncounterID: encounters[0], Periods: database.Periods{{Start: &database.PeriodMoment{Timestamp: at, Reason: "engage", MessageType: "event", Message: json.RawMessage(`{"id":1}`)}, EndState: database.EndStateSlain}}}}).Close())
	require.NoError(t, store.InsertEncounterPhase(ctx, database.InsertEncounterPhaseParams{ID: phases[0], EncounterID: encounters[0], Key: "one", Name: "Phase One", PhaseOrder: 1, EndOffsetMs: 5000, KillType: database.KillType("clean")}))
	// Direct snapshot composition is the all-zero GUID matrix, as in the DTO.
	require.NoError(t, store.InsertInstanceRaidGroupSnapshot(ctx, database.InsertInstanceRaidGroupSnapshotParams{InstanceID: ids[0], SnapshotType: database.RaidGroupSnapshotTypeFinal, ObservedAt: database.Timestamptz(at)}))
	require.NoError(t, store.InsertInstanceUnits(ctx, []database.InsertInstanceUnitsParams{{InstanceID: ids[0], UnitGuid: hostile, Name: "Hostile", Entry: 1}}).Close())
	encoded, err := json.Marshal(result)
	require.NoError(t, err)
	var decoded parseresult.Result
	require.NoError(t, json.Unmarshal(encoded, &decoded))
	decoded.Encounters[0].ID = encounters[1].String()
	decoded.Encounters[0].Phases[0].ID = phases[1].String()
	fresh, err := InsertParsedCore(ctx, store, decoded, ParsedCoreWrite{InstanceID: ids[1], RealmID: realm, LogGroupID: group, ParserVersion: "test"})
	require.NoError(t, err)
	legacy.ID, fresh.ID = uuid.Nil, uuid.Nil
	legacy.HashedSlug, fresh.HashedSlug = pgtype.Text{}, pgtype.Text{}
	legacy.UpdatedAt, fresh.UpdatedAt = pgtype.Timestamptz{}, pgtype.Timestamptz{}
	if diff := cmp.Diff(legacy, fresh); diff != "" {
		t.Fatalf("instance rows (-direct +adapter):\n%s", diff)
	}
	a, err := store.GetInstanceOverviewMetrics(ctx, database.GetInstanceOverviewMetricsParams{InstanceID: ids[0], MetricsVersion: 1})
	require.NoError(t, err)
	b, err := store.GetInstanceOverviewMetrics(ctx, database.GetInstanceOverviewMetricsParams{InstanceID: ids[1], MetricsVersion: 1})
	require.NoError(t, err)
	a.InstanceID, b.InstanceID = uuid.Nil, uuid.Nil
	a.CreatedAt, b.CreatedAt = pgtype.Timestamptz{}, pgtype.Timestamptz{}
	a.UpdatedAt, b.UpdatedAt = pgtype.Timestamptz{}, pgtype.Timestamptz{}
	if diff := cmp.Diff(a, b); diff != "" {
		t.Fatalf("overview rows (-direct +adapter):\n%s", diff)
	}
	oldFights, err := store.GetInstanceEncounterCharacterFights(ctx, ids[0])
	require.NoError(t, err)
	newFights, err := store.GetInstanceEncounterCharacterFights(ctx, ids[1])
	require.NoError(t, err)
	require.Len(t, oldFights, 1)
	require.Len(t, newFights, 1)
	oldFights[0].EncounterID, newFights[0].EncounterID = uuid.Nil, uuid.Nil
	if diff := cmp.Diff(oldFights, newFights); diff != "" {
		t.Fatalf("fight rows (-direct +adapter):\n%s", diff)
	}
	oldUnits, err := store.InstanceUnitsByInstanceID(ctx, ids[0])
	require.NoError(t, err)
	newUnits, err := store.InstanceUnitsByInstanceID(ctx, ids[1])
	require.NoError(t, err)
	require.Len(t, oldUnits, 1)
	require.Len(t, newUnits, 1)
	oldUnits[0].InstanceID, newUnits[0].InstanceID = uuid.Nil, uuid.Nil
	if diff := cmp.Diff(oldUnits, newUnits); diff != "" {
		t.Fatalf("unit rows (-direct +adapter):\n%s", diff)
	}
	oldSnapshots, err := store.InstanceRaidGroupSnapshots(ctx, ids[0])
	require.NoError(t, err)
	newSnapshots, err := store.InstanceRaidGroupSnapshots(ctx, ids[1])
	require.NoError(t, err)
	require.Len(t, oldSnapshots, 1)
	require.Len(t, newSnapshots, 1)
	oldSnapshots[0].ID, newSnapshots[0].ID = uuid.Nil, uuid.Nil
	oldSnapshots[0].InstanceID, newSnapshots[0].InstanceID = uuid.Nil, uuid.Nil
	if diff := cmp.Diff(oldSnapshots, newSnapshots); diff != "" {
		t.Fatalf("snapshot rows (-direct +adapter):\n%s", diff)
	}
	oldPhases, err := store.GetEncounterPhasesByInstanceID(ctx, ids[0])
	require.NoError(t, err)
	newPhases, err := store.GetEncounterPhasesByInstanceID(ctx, ids[1])
	require.NoError(t, err)
	require.Len(t, oldPhases, 1)
	require.Len(t, newPhases, 1)
	oldPhases[0].ID, newPhases[0].ID = uuid.Nil, uuid.Nil
	oldPhases[0].EncounterID, newPhases[0].EncounterID = uuid.Nil, uuid.Nil
	if diff := cmp.Diff(oldPhases, newPhases); diff != "" {
		t.Fatalf("phase rows (-direct +adapter):\n%s", diff)
	}
	oldEnc, err := store.GetEncounterSummariesByInstanceID(ctx, ids[0])
	require.NoError(t, err)
	newEnc, err := store.GetEncounterSummariesByInstanceID(ctx, ids[1])
	require.NoError(t, err)
	oldEnc[0].ID, newEnc[0].ID = uuid.Nil, uuid.Nil
	if diff := cmp.Diff(oldEnc, newEnc); diff != "" {
		t.Fatalf("encounter rows (-direct +adapter):\n%s", diff)
	}
}

func TestParsedCoreRejectsUnsupportedTransport(t *testing.T) {
	t.Parallel()
	_, err := InsertParsedCore(t.Context(), nil, parseresult.Result{SchemaVersion: 1}, ParsedCoreWrite{})
	require.ErrorContains(t, err, "unsupported core parse result")
}

func TestParsedCoreRejectsMissingPlayerFieldsBeforeWrites(t *testing.T) {
	t.Parallel()
	at := time.Date(2026, 1, 2, 3, 4, 5, 0, time.UTC)
	player, err := guid.FromString("0x0000000000000001")
	require.NoError(t, err)
	result := parseresult.Result{SchemaVersion: 3, Format: database.LogFormat112aCcAddon, Name: "test", Core: parseresult.CoreInstance{Start: at, End: at.Add(time.Minute)}, Units: []parseresult.UnitMetadata{{GUID: player.String(), Player: true, Participating: true}}}
	_, err = InsertParsedCore(t.Context(), nil, result, ParsedCoreWrite{InstanceID: uuid.New(), RealmID: uuid.New(), LogGroupID: uuid.New(), ParserVersion: "test"})
	require.ErrorContains(t, err, "participating player requires class/race/level")
}
