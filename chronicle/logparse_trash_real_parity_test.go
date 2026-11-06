package chronicle

import (
	"bytes"
	"encoding/json"
	"testing"
	"time"

	"github.com/Emyrk/chronicle/chronicle/parseresult"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/internal/testutil"
	"github.com/Emyrk/chronicle/internal/version"
	"github.com/google/go-cmp/cmp"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/riverqueue/river"
	"github.com/riverqueue/river/rivertype"
	"github.com/stretchr/testify/require"
)

// This compares the independent WorkerLogParse persistence path against the
// transported DTO's core/event/trash adapters. It intentionally does not use
// the rich boss fixture or compare unrelated write-time ranking side effects.
func TestLegacyAndDataOnlyParsePersistSameTrashRankings(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitLong)
	raw := []byte("1771564196000|ZONE_INFO|Zul'Gurub||1|raid|0|309\n" +
		"1771564196050|UNIT_INFO|0xF130002C4B000001|0|Hakkari Shadow Hunter|0|||0||100000\n" +
		"1771564196100|UNIT_INFO|0x000000000001C80A|1|PriestOne|1|||60||3117\n" +
		"1771564196200|COMBATANT_INFO|0x000000000001C80A|PriestOne|PRIEST|Human|3|||1|123456:0:0:0||nil|nil\n" +
		"1771564197000|SWING|0x000000000001C80A|0xF130002C4B000001|194|2|1|1|0|0|0\n" +
		"1771564201000|SWING|0x000000000001C80A|0xF130002C4B000001|194|2|1|1|0|0|0\n" +
		"1771564201100|DEATH|0xF130002C4B000001\n" +
		"1771564205000|ZONE_INFO|Stranglethorn Vale||0|none|0\n")
	legacy := newLegacyWorkerFixtureWithLog(t, ctx, raw)
	fresh := newLegacyWorkerFixtureWithLog(t, ctx, raw, false)
	require.NoError(t, legacy.worker.Work(ctx, &river.Job[ArgsLogParse]{
		Args:   ArgsLogParse{LogID: legacy.logID, RealmID: legacy.realmID, ParseGeneration: 1},
		JobRow: &rivertype.JobRow{Attempt: 1, MaxAttempts: 2},
	}))
	oldInstances, err := legacy.store.GetInstancesByLogGroupID(ctx, legacy.logID)
	require.NoError(t, err)
	require.Len(t, oldInstances, 1)
	chron := fresh.worker.parent
	projected, err := parseresult.Parse(ctx, bytes.NewReader(raw), chron.WoWDB.ForDataset(chron.defaultDatasetID), chron.Registry(), chron.logger)
	require.NoError(t, err)
	require.Len(t, projected, 1)
	encoded, err := json.Marshal(projected[0])
	require.NoError(t, err)
	var decoded parseresult.Result
	require.NoError(t, json.Unmarshal(encoded, &decoded))
	// JSON loses time.Location identity, not the instant. Compare exact instants
	// and all other DTO fields rather than accepting a time-zone-dependent diff.
	if diff := cmp.Diff(projected[0].TrashRankings, decoded.TrashRankings,
		cmp.Comparer(func(a, b time.Time) bool { return a.Equal(b) })); diff != "" {
		t.Fatalf("trash DTO changed in transport (-parsed +decoded):\n%s", diff)
	}
	require.True(t, decoded.BossRankings.HasRules, "fixture must have ranking rules")
	require.True(t, decoded.BossRankings.HasDPS, "fixture must have DPS tracking")
	require.True(t, decoded.BossRankings.LevelEligible, "fixture must pass level eligibility")
	require.NotEmpty(t, decoded.TrashRankings.Encounters, "fixture must contain a clean non-boss encounter")
	require.GreaterOrEqual(t, decoded.TrashRankings.Encounters[0].DurationSecs, float64(MinimumCombatTimeForRankings))
	require.NotEmpty(t, decoded.TrashRankings.Encounters[0].Units)
	var observedPlayerDamage int64
	for _, unit := range decoded.TrashRankings.Encounters[0].Units {
		if unit.Player && unit.Name == "PriestOne" {
			observedPlayerDamage += unit.DamageDone
		}
	}
	require.Positive(t, observedPlayerDamage, "fixture must attribute trash damage to the player caster")
	require.NoError(t, fresh.store.InsertStagedParsedLogGroup(ctx, database.InsertStagedParsedLogGroupParams{ID: fresh.logID, ParseGeneration: 1}))
	instanceID := uuid.New()
	var newInstance database.LogInstance
	require.NoError(t, fresh.store.InTx(ctx, func(tx database.Store) error {
		var insertErr error
		newInstance, insertErr = InsertParsedCore(ctx, tx, decoded, ParsedCoreWrite{
			InstanceID: instanceID, RealmID: fresh.realmID, LogGroupID: fresh.logID, ParserVersion: version.ExactParserVersion(),
		})
		if insertErr != nil {
			return insertErr
		}
		return InsertParsedEventStreams(ctx, tx, instanceID, decoded.Events)
	}, nil))
	require.NoError(t, fresh.store.InTx(ctx, func(tx database.Store) error {
		return InsertParsedTrashRankings(ctx, tx, decoded, ParsedBossRankingWrite{
			Instance: newInstance, RealmName: "Legacy Worker Realm", DatasetID: chron.defaultDatasetID, Rankable: true,
		})
	}, nil))
	oldRows, err := legacy.store.InstanceRankingRecords(ctx, oldInstances[0].ID)
	require.NoError(t, err)
	newRows, err := fresh.store.InstanceRankingRecords(ctx, newInstance.ID)
	require.NoError(t, err)
	require.NotEmpty(t, oldRows, "legacy WorkerLogParse must persist a trash ranking; parsed trash=%+v", decoded.TrashRankings)
	require.NotEmpty(t, newRows, "primary adapter must persist transported trash rankings")
	require.Equal(t, len(oldRows), len(newRows))
	for i := range oldRows {
		require.False(t, oldRows[i].EncounterID.Valid, "legacy rank %d must be trash", i)
		require.False(t, newRows[i].EncounterID.Valid, "transport rank %d must be trash", i)
		oldRows[i].ID, newRows[i].ID = uuid.Nil, uuid.Nil
		oldRows[i].InstanceID, newRows[i].InstanceID = uuid.Nil, uuid.Nil
		oldRows[i].RealmID, newRows[i].RealmID = uuid.Nil, uuid.Nil
		oldRows[i].LogHashedSlug, newRows[i].LogHashedSlug = "", ""
		oldRows[i].CreatedAt, newRows[i].CreatedAt = pgtype.Timestamptz{}, pgtype.Timestamptz{}
		// Suppress only database-generated identity, never measured metrics.
	}
	if diff := cmp.Diff(oldRows, newRows); diff != "" {
		t.Fatalf("real worker trash rows differ (-legacy +transported):\n%s", diff)
	}
}
