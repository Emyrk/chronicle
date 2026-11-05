package chronicle

import (
	"bytes"
	"compress/gzip"
	"context"
	"io"
	"log/slog"
	"testing"
	"time"

	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/authz"
	"github.com/Emyrk/chronicle/database/authz/authztest"
	"github.com/Emyrk/chronicle/database/dbtestutil"
	"github.com/Emyrk/chronicle/database/gamedb"
	"github.com/Emyrk/chronicle/database/storage"
	"github.com/Emyrk/chronicle/internal/testutil"
	"github.com/google/uuid"
	"github.com/riverqueue/river"
	"github.com/riverqueue/river/rivertype"
	"github.com/stretchr/testify/require"
	"google.golang.org/protobuf/encoding/protowire"
)

// legacyWorkerFixture owns a fresh database and raw object for each invocation.
// Keep the input bytes available for a future independent parser path comparison.
type legacyWorkerFixture struct {
	store   database.Store
	worker  *WorkerLogParse
	logID   uuid.UUID
	realmID uuid.UUID
	rawLog  []byte
}

func newLegacyWorkerFixture(t *testing.T, ctx context.Context) legacyWorkerFixture {
	t.Helper()
	pool, _ := dbtestutil.NewPGXPool(t)
	store := database.New(pool)
	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	objects, err := storage.NewLocalStorageAt(t.TempDir())
	require.NoError(t, err)
	datasetID := uuid.New()
	wowDB, err := gamedb.New(ctx, gamedb.Options{DB: store, Pool: pool, DatasetID: datasetID})
	require.NoError(t, err)
	t.Cleanup(func() { require.NoError(t, wowDB.Close()) })
	// The worker writes armory relationships through AuthzTX.Write, which needs
	// a real SpiceDB client even when the relationship set is empty.
	grpcURL, key := authztest.NewSpiceDBWithAddress(t)
	zed, err := authz.New(ctx, authz.Options{GRPCURL: grpcURL, PreSharedKey: key, Logger: logger, DB: store})
	require.NoError(t, err)
	chron, err := New(ctx, logger, Options{
		Storage: objects, Zed: zed, WoWDB: wowDB,
		DefaultDatasetID: datasetID, DefaultFlavor: database.WoWFlavor{database.FlavorVanilla},
	})
	require.NoError(t, err)

	ownerID, serverID, realmID, logID, fileID := uuid.New(), uuid.New(), uuid.New(), uuid.New(), uuid.New()
	_, err = store.InsertUser(ctx, database.InsertUserParams{
		ID: ownerID, Username: "legacy-worker-" + ownerID.String(), Email: ownerID.String() + "@example.com",
	})
	require.NoError(t, err)
	_, err = store.InsertWoWServer(ctx, database.InsertWoWServerParams{ID: serverID, Name: "legacy-worker-" + serverID.String()})
	require.NoError(t, err)
	_, err = store.InsertWoWServerRealm(ctx, database.InsertWoWServerRealmParams{ID: realmID, ServerID: serverID, Name: "Legacy Worker Realm"})
	require.NoError(t, err)
	at := database.Timestamptz(time.Date(2026, 2, 20, 0, 0, 0, 0, time.UTC))
	_, err = store.InsertWoWLogGroup(ctx, database.InsertWoWLogGroupParams{
		ID: logID, Owner: ownerID, LogType: database.LogTypeV2, CreatedAt: at, UpdatedAt: at,
	})
	require.NoError(t, err)
	// Two swings separated by three seconds create one encounter with damage.
	rawLog := []byte("1771564196000|ZONE_INFO|Zul'Gurub||1|raid|0|309\n" +
		"1771564197000|SWING|0x000000000001C7AC|0xF1300039F2000001|194|2|1|1|0|0|0\n" +
		"1771564200000|SWING|0x000000000001C7AC|0xF1300039F2000001|194|2|1|1|0|0|0\n" +
		"1771564205000|ZONE_INFO|Stranglethorn Vale||0|none|0\n")
	_, err = store.InsertLogFile(ctx, database.InsertLogFileParams{
		ID: fileID, Owner: ownerID, Hash: uuid.NewString(), WowLogID: logID,
		SizeBytes: int64(len(rawLog)), MimeType: "text/plain;charset=UTF-8", CreatedAt: at, UpdatedAt: at,
	})
	require.NoError(t, err)
	_, err = objects.UploadFile(ctx, BucketRaidLogs, chron.logPath(fileID), bytes.NewReader(rawLog))
	require.NoError(t, err)
	return legacyWorkerFixture{store: store, worker: &WorkerLogParse{parent: chron}, logID: logID, realmID: realmID, rawLog: rawLog}
}

func TestLegacyWorkerPersistsSuccessfulParse(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitLong)
	fixture := newLegacyWorkerFixture(t, ctx)
	job := &river.Job[ArgsLogParse]{
		Args:   ArgsLogParse{LogID: fixture.logID, RealmID: fixture.realmID, ParseGeneration: 1},
		JobRow: &rivertype.JobRow{Attempt: 1, MaxAttempts: 2},
	}
	require.NoError(t, fixture.worker.Work(ctx, job))
	visible, err := fixture.store.IsParsedLogGroupVisible(ctx, fixture.logID)
	require.NoError(t, err)
	require.True(t, visible)
	parsed, err := fixture.store.GetParsedLogGroupByID(ctx, fixture.logID)
	require.NoError(t, err)
	require.Equal(t, int64(1), parsed.ParseGeneration)
	require.True(t, parsed.FinalizedAt.Valid)

	instances, err := fixture.store.GetInstancesByLogGroupID(ctx, fixture.logID)
	require.NoError(t, err)
	require.Len(t, instances, 1)
	instance := instances[0]
	require.Equal(t, fixture.realmID, instance.RealmID)
	require.Equal(t, "Zul'Gurub", instance.Name)
	encounters, err := fixture.store.EncountersByInstanceID(ctx, instance.ID)
	require.NoError(t, err)
	require.Len(t, encounters, 1)
	require.True(t, encounters[0].EndTime.Time.After(encounters[0].StartTime.Time))
	fights, err := fixture.store.GetInstanceEncounterCharacterFights(ctx, instance.ID)
	require.NoError(t, err)
	require.NotEmpty(t, fights)
	require.Equal(t, encounters[0].ID, fights[0].EncounterID)
	damage, err := fixture.store.InstanceEvent(ctx, database.InstanceEventParams{InstanceID: instance.ID, Type: string(database.LogInstanceEventTypeDamage)})
	require.NoError(t, err)
	gz, err := gzip.NewReader(bytes.NewReader(damage.Events))
	require.NoError(t, err)
	stream, err := io.ReadAll(gz)
	require.NoError(t, err)
	require.NoError(t, gz.Close())
	_, n := protowire.ConsumeString(stream) // encounter UUID header
	require.Positive(t, n)
	stream = stream[n:]
	_, n = protowire.ConsumeVarint(stream) // first event timestamp
	require.Positive(t, n)
	stream = stream[n:]
	count, n := protowire.ConsumeVarint(stream)
	require.Positive(t, n)
	require.Positive(t, count, "persisted damage stream must contain combat events")
}
