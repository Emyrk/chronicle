package chronicle

import (
	"bytes"
	"encoding/json"
	"testing"

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
	"google.golang.org/protobuf/proto"
)

// This compares the persisted subset supported by the data-only adapters, not
// a whole-DB parse. Guild/armory, ranking, parse-report and job side effects
// belong to the worker and are deliberately absent on the adapter side.
func TestLegacyWorkerPersistedCoreMatchesDataOnlyParse(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitLong)
	legacy := newLegacyWorkerFixture(t, ctx)
	fresh := newLegacyWorkerFixture(t, ctx, false) // separate DB, same fixture input and empty game-data catalog
	require.Equal(t, legacy.rawLog, fresh.rawLog)
	require.NoError(t, legacy.worker.Work(ctx, &river.Job[ArgsLogParse]{
		Args:   ArgsLogParse{LogID: legacy.logID, RealmID: legacy.realmID, ParseGeneration: 1},
		JobRow: &rivertype.JobRow{Attempt: 1, MaxAttempts: 2},
	}))
	oldRows, err := legacy.store.GetInstancesByLogGroupID(ctx, legacy.logID)
	require.NoError(t, err)
	require.Len(t, oldRows, 1)
	old, err := legacy.store.GetLogInstanceForDiscordAnnouncement(ctx, oldRows[0].ID)
	require.NoError(t, err)

	freshChron := fresh.worker.parent
	results, err := parseresult.Parse(ctx, bytes.NewReader(fresh.rawLog), freshChron.WoWDB.ForDataset(freshChron.defaultDatasetID), freshChron.Registry(), freshChron.logger)
	require.NoError(t, err)
	require.Len(t, results, 1)
	encoded, err := json.Marshal(results[0])
	require.NoError(t, err)
	var decoded parseresult.Result
	require.NoError(t, json.Unmarshal(encoded, &decoded))
	require.Len(t, decoded.Encounters, 1)

	// The FK from log_instances points to the staged parsed group, not the raw
	// log group. Leave it unfinalized so the adapter's omitted finalization is visible.
	require.NoError(t, fresh.store.InsertStagedParsedLogGroup(ctx, database.InsertStagedParsedLogGroupParams{ID: fresh.logID, ParseGeneration: 1}))
	newID := uuid.New()
	var newRow database.LogInstance
	require.NoError(t, fresh.store.InTx(ctx, func(tx database.Store) error {
		var insertErr error
		newRow, insertErr = InsertParsedCore(ctx, tx, decoded, ParsedCoreWrite{
			InstanceID: newID, RealmID: fresh.realmID, LogGroupID: fresh.logID,
			ParserVersion: version.ExactParserVersion(),
		})
		if insertErr != nil {
			return insertErr
		}
		if insertErr = InsertParsedEventStreams(ctx, tx, newID, decoded.Events); insertErr != nil {
			return insertErr
		}
		if len(decoded.Loot) > 0 {
			return InsertParsedLoot(ctx, tx, newID, fresh.realmID, decoded.Loot)
		}
		return nil
	}, nil))

	// Per-database identities and trigger timestamps differ; compare stored
	// content after explicitly removing only these generated identifiers.
	old.ID, newRow.ID = uuid.Nil, uuid.Nil
	old.RealmID, newRow.RealmID = uuid.Nil, uuid.Nil
	old.LogGroupID, newRow.LogGroupID = uuid.Nil, uuid.Nil
	old.HashedSlug, newRow.HashedSlug = pgtype.Text{}, pgtype.Text{}
	old.UpdatedAt, newRow.UpdatedAt = pgtype.Timestamptz{}, pgtype.Timestamptz{}
	assertPersistedParity(t, "instance", old, newRow)

	oldOverview, err := legacy.store.GetInstanceOverviewMetrics(ctx, database.GetInstanceOverviewMetricsParams{InstanceID: oldRows[0].ID, MetricsVersion: decoded.Overview.MetricsVersion})
	require.NoError(t, err)
	newOverview, err := fresh.store.GetInstanceOverviewMetrics(ctx, database.GetInstanceOverviewMetricsParams{InstanceID: newID, MetricsVersion: decoded.Overview.MetricsVersion})
	require.NoError(t, err)
	oldOverview.InstanceID, newOverview.InstanceID = uuid.Nil, uuid.Nil
	oldOverview.CreatedAt, newOverview.CreatedAt = pgtype.Timestamptz{}, pgtype.Timestamptz{}
	oldOverview.UpdatedAt, newOverview.UpdatedAt = pgtype.Timestamptz{}, pgtype.Timestamptz{}
	assertPersistedParity(t, "overview", oldOverview, newOverview)

	oldEnc, err := legacy.store.EncountersByInstanceID(ctx, oldRows[0].ID)
	require.NoError(t, err)
	newEnc, err := fresh.store.EncountersByInstanceID(ctx, newID)
	require.NoError(t, err)
	require.Len(t, oldEnc, 1)
	require.Len(t, newEnc, 1)
	oldEncID, newEncID := oldEnc[0].ID, newEnc[0].ID
	oldEnc[0].ID, newEnc[0].ID = uuid.Nil, uuid.Nil
	oldEnc[0].InstanceID, newEnc[0].InstanceID = uuid.Nil, uuid.Nil
	assertPersistedParity(t, "encounter", oldEnc, newEnc)

	oldFights, err := legacy.store.GetInstanceEncounterCharacterFights(ctx, oldRows[0].ID)
	require.NoError(t, err)
	newFights, err := fresh.store.GetInstanceEncounterCharacterFights(ctx, newID)
	require.NoError(t, err)
	require.NotEmpty(t, oldFights)
	require.Len(t, newFights, len(oldFights))
	for i := range oldFights {
		oldFights[i].EncounterID, newFights[i].EncounterID = uuid.Nil, uuid.Nil
	}
	assertPersistedParity(t, "hostile fights", oldFights, newFights)

	oldPhases, err := legacy.store.GetEncounterPhasesByInstanceID(ctx, oldRows[0].ID)
	require.NoError(t, err)
	newPhases, err := fresh.store.GetEncounterPhasesByInstanceID(ctx, newID)
	require.NoError(t, err)
	// This short swing-only log has no phase transitions; richer fixtures are
	// needed before phase-content parity can be claimed.
	require.Empty(t, oldPhases)
	require.Len(t, newPhases, len(oldPhases))
	for i := range oldPhases {
		oldPhases[i].ID, newPhases[i].ID = uuid.Nil, uuid.Nil
		oldPhases[i].EncounterID, newPhases[i].EncounterID = uuid.Nil, uuid.Nil
	}
	assertPersistedParity(t, "phases", oldPhases, newPhases)

	oldUnits, err := legacy.store.InstanceUnitsByInstanceID(ctx, oldRows[0].ID)
	require.NoError(t, err)
	newUnits, err := fresh.store.InstanceUnitsByInstanceID(ctx, newID)
	require.NoError(t, err)
	require.NotEmpty(t, oldUnits)
	require.Len(t, newUnits, len(oldUnits))
	for i := range oldUnits {
		oldUnits[i].InstanceID, newUnits[i].InstanceID = uuid.Nil, uuid.Nil
	}
	assertPersistedParity(t, "units", oldUnits, newUnits)

	oldPlayers, err := legacy.store.InstancePlayersByInstanceID(ctx, oldRows[0].ID)
	require.NoError(t, err)
	newPlayers, err := fresh.store.InstancePlayersByInstanceID(ctx, newID)
	require.NoError(t, err)
	// The source GUID has no combatant/guild metadata, so player insertion is
	// unexercised here; this still detects an unexpected player row on either side.
	require.Empty(t, oldPlayers)
	require.Len(t, newPlayers, len(oldPlayers))
	for i := range oldPlayers {
		oldPlayers[i].InstanceID, newPlayers[i].InstanceID = uuid.Nil, uuid.Nil
	}
	assertPersistedParity(t, "players", oldPlayers, newPlayers)

	for _, kind := range database.AllLogInstanceEventTypeValues() {
		oldEvent, err := legacy.store.InstanceEvent(ctx, database.InstanceEventParams{InstanceID: oldRows[0].ID, Type: string(kind)})
		require.NoError(t, err, "legacy %s", kind)
		newEvent, err := fresh.store.InstanceEvent(ctx, database.InstanceEventParams{InstanceID: newID, Type: string(kind)})
		require.NoError(t, err, "data-only %s", kind)
		left := unzipEventRow(t, oldEvent.Events)
		right := unzipEventRow(t, newEvent.Events)
		require.True(t, bytes.Contains(left, []byte("$"+oldEncID.String())), "legacy %s header", kind)
		require.True(t, bytes.Contains(right, []byte("$"+newEncID.String())), "data-only %s header", kind)
		left = bytes.Replace(left, []byte("$"+oldEncID.String()), []byte("$"+uuid.Nil.String()), 1)
		right = bytes.Replace(right, []byte("$"+newEncID.String()), []byte("$"+uuid.Nil.String()), 1)
		if kind == database.LogInstanceEventTypeUnitClassification {
			oldRecords, err := classificationEvents(left)
			require.NoError(t, err)
			newRecords, err := classificationEvents(right)
			require.NoError(t, err)
			assertPersistedParity(t, "event "+string(kind), oldRecords, newRecords, cmp.Comparer(proto.Equal))
			continue
		}
		assertPersistedParity(t, "event "+string(kind), left, right)
	}
	// No loot or guild identities are present in this small log. The adapter
	// writes neither guild/armory/ranking side effects nor a parse job/report;
	// unlike the worker, it also does not finalize its staged log group.
	require.Empty(t, decoded.Loot)
	require.False(t, old.GuildID.Valid)
	require.False(t, newRow.GuildID.Valid)
	visible, err := fresh.store.IsParsedLogGroupVisible(ctx, fresh.logID)
	require.NoError(t, err)
	require.False(t, visible)
}

func assertPersistedParity[T any](t *testing.T, label string, old, fresh T, opts ...cmp.Option) {
	t.Helper()
	if diff := cmp.Diff(old, fresh, opts...); diff != "" {
		t.Fatalf("persisted %s mismatch (-legacy +data-only):\n%s", label, diff)
	}
}
