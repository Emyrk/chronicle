package chronicle

import (
	"bytes"
	"encoding/json"
	"testing"

	"github.com/Emyrk/chronicle/chronicle/parseresult"
	"github.com/Emyrk/chronicle/combatlog/parser/common/parsectx"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/internal/testutil"
	"github.com/Emyrk/chronicle/internal/version"
	"github.com/google/go-cmp/cmp"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/riverqueue/river"
	"github.com/riverqueue/river/rivertype"
	"github.com/stretchr/testify/require"
	"google.golang.org/protobuf/proto"
)

// TBC and Wrath fixtures compare initial and replacement worker parses with
// independently decoded CLEU core and event rows, plus the complete in-memory
// legacy projection. They do not establish whole-DB parse parity.
func TestLegacyWorkerCLEUProjectionMatchesDataOnlyParse(t *testing.T) {
	for _, tc := range []struct {
		name   string
		format database.LogFormat
		flavor database.WoWFlavor
		suffix string
	}{
		{name: "TBC", format: database.LogFormat243CcAddon, flavor: database.WoWFlavor{database.FlavorTBC}, suffix: "250,1,5,0,10,1,nil,nil"},
		{name: "Wrath", format: database.LogFormat335aCcAddon, flavor: database.WoWFlavor{database.FlavorWrath}, suffix: "250,0,1,0,0,0,nil,nil,nil"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			for _, replacement := range []bool{false, true} {
				name := "initial"
				if replacement {
					name = "replacement"
				}
				t.Run(name, func(t *testing.T) {
					ctx := testutil.Context(t, testutil.WaitLong)
					log := []byte("8/8 18:43:42.478  SWING_DAMAGE,0x0000000000000001,\"Raider\",0x511,0xF1300043490001E0,\"Nightbane\",0x10a48," + tc.suffix + "\n" +
						"8/8 18:43:44.478  SWING_DAMAGE,0x0000000000000001,\"Raider\",0x511,0xF1300043490001E0,\"Nightbane\",0x10a48," + tc.suffix + "\n")
					const logType = database.LogTypeAzerothcoreClientside
					legacy := newLegacyWorkerFixtureForFormat(t, ctx, log, logType, tc.format, tc.flavor)
					fresh := newLegacyWorkerFixtureForFormat(t, ctx, log, logType, tc.format, tc.flavor, replacement)
					require.Equal(t, legacy.rawLog, fresh.rawLog)
					generation := int64(1)
					previous := make(map[uuid.UUID]uuid.UUID)
					if replacement {
						// Both databases start from successful generation-one worker output.
						for _, fixture := range []legacyWorkerFixture{legacy, fresh} {
							require.NoError(t, fixture.worker.Work(ctx, &river.Job[ArgsLogParse]{
								Args:   ArgsLogParse{LogID: fixture.logID, RealmID: fixture.realmID, ParseGeneration: 1},
								JobRow: &rivertype.JobRow{Attempt: 1, MaxAttempts: 2},
							}))
							initial, err := fixture.store.GetInstancesByLogGroupID(ctx, fixture.logID)
							require.NoError(t, err)
							require.Len(t, initial, 1)
							previous[fixture.logID] = initial[0].ID
							advanced, err := advanceParseGeneration(ctx, fixture.store, fixture.logID, true)
							require.NoError(t, err)
							require.Equal(t, int64(2), advanced)
						}
						generation = 2
					}
					require.NoError(t, legacy.worker.Work(ctx, &river.Job[ArgsLogParse]{
						Args:   ArgsLogParse{LogID: legacy.logID, RealmID: legacy.realmID, ParseGeneration: generation, Replacement: replacement},
						JobRow: &rivertype.JobRow{Attempt: 1, MaxAttempts: 2},
					}))
					parsedGroup, err := legacy.store.GetParsedLogGroupByID(ctx, legacy.logID)
					require.NoError(t, err)
					require.Equal(t, generation, parsedGroup.ParseGeneration)
					require.True(t, parsedGroup.FinalizedAt.Valid)
					visible, err := legacy.store.IsParsedLogGroupVisible(ctx, legacy.logID)
					require.NoError(t, err)
					require.True(t, visible)
					instances, err := legacy.store.GetInstancesByLogGroupID(ctx, legacy.logID)
					require.NoError(t, err)
					require.Len(t, instances, 1)
					if replacement {
						require.NotEqual(t, previous[legacy.logID], instances[0].ID, "replacement must create a new instance")
					}
					require.Equal(t, legacy.realmID, instances[0].RealmID)
					encounters, err := legacy.store.EncountersByInstanceID(ctx, instances[0].ID)
					require.NoError(t, err)
					require.NotEmpty(t, encounters)
					damage, err := legacy.store.InstanceEvent(ctx, database.InstanceEventParams{InstanceID: instances[0].ID, Type: string(database.LogInstanceEventTypeDamage)})
					require.NoError(t, err)
					require.NotEmpty(t, unzipEventRow(t, damage.Events))

					legacyChron, freshChron := legacy.worker.parent, fresh.worker.parent
					parseContext := parsectx.With(ctx, parsectx.Context{Type: logType, Format: tc.format, Flavor: tc.flavor, DatasetID: freshChron.defaultDatasetID})
					freshResults, err := parseresult.Parse(parseContext, bytes.NewReader(fresh.rawLog), freshChron.WoWDB.ForDataset(freshChron.defaultDatasetID), freshChron.Registry(), freshChron.logger)
					require.NoError(t, err)
					require.Len(t, freshResults, 1)
					require.Equal(t, tc.format, freshResults[0].Format)
					require.NotEmpty(t, freshResults[0].Encounters)
					require.NotEmpty(t, freshResults[0].Events.Damage)
					// Anchor the independent projection to rows written by Work, not just
					// another in-memory invocation of the legacy parser.
					require.Equal(t, freshResults[0].Name, instances[0].Name)
					require.Equal(t, freshResults[0].Core.Capabilities, instances[0].Capabilities)
					require.True(t, instances[0].StartTime.Valid && freshResults[0].Core.Start.Equal(instances[0].StartTime.Time), "instance start instant differs: projected=%v persisted=%v", freshResults[0].Core.Start, instances[0].StartTime.Time)
					require.True(t, instances[0].EndTime.Valid && freshResults[0].Core.End.Equal(instances[0].EndTime.Time), "instance end instant differs: projected=%v persisted=%v", freshResults[0].Core.End, instances[0].EndTime.Time)
					require.Len(t, encounters, len(freshResults[0].Encounters))
					require.Equal(t, freshResults[0].Encounters[0].Name, encounters[0].Name)
					require.True(t, encounters[0].StartTime.Valid && freshResults[0].Encounters[0].Start.Equal(encounters[0].StartTime.Time), "encounter start instant differs: projected=%v persisted=%v", freshResults[0].Encounters[0].Start, encounters[0].StartTime.Time)
					require.True(t, encounters[0].EndTime.Valid && freshResults[0].Encounters[0].End.Equal(encounters[0].EndTime.Time), "encounter end instant differs: projected=%v persisted=%v", freshResults[0].Encounters[0].End, encounters[0].EndTime.Time)
					persistedDamage := unzipEventRow(t, damage.Events)
					require.Contains(t, string(persistedDamage), "$"+encounters[0].ID.String())
					require.Contains(t, string(freshResults[0].Events.Damage), "$"+freshResults[0].Encounters[0].ID)
					persistedDamage = bytes.Replace(persistedDamage, []byte("$"+encounters[0].ID.String()), []byte("$<encounter>"), 1)
					projectedDamage := bytes.Replace(freshResults[0].Events.Damage, []byte("$"+freshResults[0].Encounters[0].ID), []byte("$<encounter>"), 1)
					assertPersistedParity(t, "CLEU persisted damage event", persistedDamage, projectedDamage)
					encoded, err := json.Marshal(freshResults)
					require.NoError(t, err)
					var decoded []parseresult.Result
					require.NoError(t, json.Unmarshal(encoded, &decoded))
					assertPersistedParity(t, "CLEU JSON result", freshResults, decoded)

					// Persist the decoded result independently, in its own DB. Only
					// primary core and event adapters are exercised here.
					require.NoError(t, fresh.store.InsertStagedParsedLogGroup(ctx, database.InsertStagedParsedLogGroupParams{ID: fresh.logID, ParseGeneration: generation}))
					newID := uuid.New()
					require.NoError(t, fresh.store.InTx(ctx, func(tx database.Store) error {
						_, err := InsertParsedCore(ctx, tx, decoded[0], ParsedCoreWrite{
							InstanceID: newID, RealmID: fresh.realmID, LogGroupID: fresh.logID,
							ParserVersion: version.ExactParserVersion(),
						})
						if err != nil {
							return err
						}
						return InsertParsedEventStreams(ctx, tx, newID, decoded[0].Events)
					}, nil))
					if replacement {
						require.NotEqual(t, previous[fresh.logID], newID, "adapter replacement must create a new instance")
					}
					staged, err := fresh.store.GetParsedLogGroupByID(ctx, fresh.logID)
					require.NoError(t, err)
					require.Equal(t, generation, staged.ParseGeneration)
					require.False(t, staged.FinalizedAt.Valid)
					compareCLEUPersistedRows(t, legacy.store, fresh.store, instances[0].ID, newID, decoded[0].Overview.MetricsVersion)

					legacyContext := parsectx.With(ctx, parsectx.Context{Type: logType, Format: tc.format, Flavor: tc.flavor, DatasetID: legacyChron.defaultDatasetID})
					parsed, err := legacy.worker.parseCombatLog(legacyContext, tc.format, []database.LogFile{{}}, nil,
						legacyChron.WoWDB.ForDataset(legacyChron.defaultDatasetID), legacyChron.Registry(), false, legacy.rawLog, "")
					require.NoError(t, err)
					require.Len(t, parsed.encountersState.Instances, 1)
					inst := parsed.encountersState.Instances[0]
					finalized, err := inst.Finalize(legacyContext)
					require.NoError(t, err)
					require.NotNil(t, finalized)
					projected, err := parseresult.Build(parseresult.Input{
						Format: tc.format, Name: inst.Name(), Finalized: finalized, Events: inst.Events(),
						Units: parsed.encountersState.Units, IdentifyUnit: inst.IdentifyUnit,
						Category: string(inst.Category), DifficultyName: inst.CurrentZone.DifficultyName,
						MaxPlayers: int32(inst.CurrentZone.MaxPlayers), DynamicDifficulty: int32(inst.CurrentZone.DynamicDifficulty),
						Capabilities: parsed.logCapabilities, Armory: finalized.Guilds,
					})
					require.NoError(t, err)
					old := []parseresult.Result{*projected}
					require.NoError(t, normalizeGeneratedEncounterIDs(old))
					require.NoError(t, normalizeGeneratedEncounterIDs(decoded))
					oldClassification, err := classificationEvents(old[0].Events.UnitClassification)
					require.NoError(t, err)
					newClassification, err := classificationEvents(decoded[0].Events.UnitClassification)
					require.NoError(t, err)
					assertPersistedParity(t, "CLEU classification", oldClassification, newClassification, cmp.Comparer(proto.Equal))
					old[0].Events.UnitClassification, decoded[0].Events.UnitClassification = nil, nil
					assertPersistedParity(t, "CLEU projection", old, decoded)
				})
			}
		})
	}
}

func compareCLEUPersistedRows(t *testing.T, oldStore, freshStore database.Store, oldID, freshID uuid.UUID, metricsVersion int32) {
	t.Helper()
	ctx := t.Context()
	old, err := oldStore.GetLogInstanceForDiscordAnnouncement(ctx, oldID)
	require.NoError(t, err)
	fresh, err := freshStore.GetLogInstanceForDiscordAnnouncement(ctx, freshID)
	require.NoError(t, err)
	old.ID, fresh.ID = uuid.Nil, uuid.Nil
	old.RealmID, fresh.RealmID = uuid.Nil, uuid.Nil
	old.LogGroupID, fresh.LogGroupID = uuid.Nil, uuid.Nil
	old.HashedSlug, fresh.HashedSlug = pgtype.Text{}, pgtype.Text{}
	old.UpdatedAt, fresh.UpdatedAt = pgtype.Timestamptz{}, pgtype.Timestamptz{}
	assertPersistedParity(t, "CLEU persisted instance", old, fresh)

	oldOverview, err := oldStore.GetInstanceOverviewMetrics(ctx, database.GetInstanceOverviewMetricsParams{InstanceID: oldID, MetricsVersion: metricsVersion})
	require.NoError(t, err)
	freshOverview, err := freshStore.GetInstanceOverviewMetrics(ctx, database.GetInstanceOverviewMetricsParams{InstanceID: freshID, MetricsVersion: metricsVersion})
	require.NoError(t, err)
	oldOverview.InstanceID, freshOverview.InstanceID = uuid.Nil, uuid.Nil
	oldOverview.CreatedAt, freshOverview.CreatedAt = pgtype.Timestamptz{}, pgtype.Timestamptz{}
	oldOverview.UpdatedAt, freshOverview.UpdatedAt = pgtype.Timestamptz{}, pgtype.Timestamptz{}
	assertPersistedParity(t, "CLEU persisted overview", oldOverview, freshOverview)

	oldEncounters, err := oldStore.EncountersByInstanceID(ctx, oldID)
	require.NoError(t, err)
	freshEncounters, err := freshStore.EncountersByInstanceID(ctx, freshID)
	require.NoError(t, err)
	require.Len(t, oldEncounters, 1)
	require.Len(t, freshEncounters, 1)
	oldEncounterID, freshEncounterID := oldEncounters[0].ID, freshEncounters[0].ID
	oldEncounters[0].ID, freshEncounters[0].ID = uuid.Nil, uuid.Nil
	oldEncounters[0].InstanceID, freshEncounters[0].InstanceID = uuid.Nil, uuid.Nil
	assertPersistedParity(t, "CLEU persisted encounter", oldEncounters, freshEncounters)

	for _, kind := range database.AllLogInstanceEventTypeValues() {
		oldEvent, err := oldStore.InstanceEvent(ctx, database.InstanceEventParams{InstanceID: oldID, Type: string(kind)})
		require.NoError(t, err, "legacy %s", kind)
		freshEvent, err := freshStore.InstanceEvent(ctx, database.InstanceEventParams{InstanceID: freshID, Type: string(kind)})
		require.NoError(t, err, "adapter %s", kind)
		oldBytes, freshBytes := unzipEventRow(t, oldEvent.Events), unzipEventRow(t, freshEvent.Events)
		require.True(t, bytes.Contains(oldBytes, []byte("$"+oldEncounterID.String())), "legacy %s header", kind)
		require.True(t, bytes.Contains(freshBytes, []byte("$"+freshEncounterID.String())), "adapter %s header", kind)
		oldBytes = bytes.Replace(oldBytes, []byte("$"+oldEncounterID.String()), []byte("$"+uuid.Nil.String()), 1)
		freshBytes = bytes.Replace(freshBytes, []byte("$"+freshEncounterID.String()), []byte("$"+uuid.Nil.String()), 1)
		if kind == database.LogInstanceEventTypeUnitClassification {
			oldRecords, err := classificationEvents(oldBytes)
			require.NoError(t, err)
			freshRecords, err := classificationEvents(freshBytes)
			require.NoError(t, err)
			assertPersistedParity(t, "CLEU persisted event "+string(kind), oldRecords, freshRecords, cmp.Comparer(proto.Equal))
			continue
		}
		assertPersistedParity(t, "CLEU persisted event "+string(kind), oldBytes, freshBytes)
	}
}
