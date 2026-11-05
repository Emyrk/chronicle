package chronicle

import (
	"bytes"
	"encoding/json"
	"testing"

	"github.com/Emyrk/chronicle/chronicle/parseresult"
	"github.com/Emyrk/chronicle/combatlog/parser/common/parsectx"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/internal/testutil"
	"github.com/google/go-cmp/cmp"
	"github.com/riverqueue/river"
	"github.com/riverqueue/river/rivertype"
	"github.com/stretchr/testify/require"
	"google.golang.org/protobuf/proto"
)

// The primary core adapter only accepts v2; these two real-worker fixtures
// anchor persistence while comparing the independent data-only CLEU projection
// to the legacy parse entrypoint. They are not persisted adapter parity tests.
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
			t.Parallel()
			ctx := testutil.Context(t, testutil.WaitLong)
			log := []byte("8/8 18:43:42.478  SWING_DAMAGE,0x0000000000000001,\"Raider\",0x511,0xF1300043490001E0,\"Nightbane\",0x10a48," + tc.suffix + "\n" +
				"8/8 18:43:44.478  SWING_DAMAGE,0x0000000000000001,\"Raider\",0x511,0xF1300043490001E0,\"Nightbane\",0x10a48," + tc.suffix + "\n")
			const logType = database.LogTypeAzerothcoreClientside
			legacy := newLegacyWorkerFixtureForFormat(t, ctx, log, logType, tc.format, tc.flavor)
			fresh := newLegacyWorkerFixtureForFormat(t, ctx, log, logType, tc.format, tc.flavor, false)
			require.Equal(t, legacy.rawLog, fresh.rawLog)
			require.NoError(t, legacy.worker.Work(ctx, &river.Job[ArgsLogParse]{
				Args:   ArgsLogParse{LogID: legacy.logID, RealmID: legacy.realmID, ParseGeneration: 1},
				JobRow: &rivertype.JobRow{Attempt: 1, MaxAttempts: 2},
			}))
			visible, err := legacy.store.IsParsedLogGroupVisible(ctx, legacy.logID)
			require.NoError(t, err)
			require.True(t, visible)
			instances, err := legacy.store.GetInstancesByLogGroupID(ctx, legacy.logID)
			require.NoError(t, err)
			require.Len(t, instances, 1)
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
}
