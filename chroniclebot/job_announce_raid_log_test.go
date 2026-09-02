package chroniclebot

import (
	"testing"
	"time"

	"github.com/Emyrk/chronicle/chronicle/riverqueue/riverconst"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/dbtestutil"
	"github.com/Emyrk/chronicle/internal/testutil"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/riverqueue/river/rivertype"
	"github.com/stretchr/testify/require"
)

func TestReconcileReparseAndDuplicateMerge(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitShort)
	store, _ := dbtestutil.NewDB(t)

	userID := uuid.New()
	_, err := store.InsertUser(ctx, database.InsertUserParams{ID: userID, Username: "discord-announcement-" + uuid.NewString()[:8]})
	require.NoError(t, err)
	realmID := uuid.MustParse("bcf173a7-c94a-49fe-8930-27435d722fb7")
	guild, err := store.UpsertGuild(ctx, database.UpsertGuildParams{RealmID: realmID, Name: "Test Guild " + uuid.NewString()[:8], CreatedAt: database.Timestamptz(time.Now())})
	require.NoError(t, err)

	worker := &WorkerAnnounceRaidLog{bot: &Bot{config: Config{DB: store}, logger: testutil.Logger(t)}}
	makeInstance := func(logGroupID uuid.UUID, slug string, start time.Time) database.LogInstance {
		t.Helper()
		_, err := store.InsertWoWLogGroup(ctx, database.InsertWoWLogGroupParams{
			ID: logGroupID, Owner: userID, LogType: database.LogTypeV1,
			CreatedAt: database.Timestamptz(start), UpdatedAt: database.Timestamptz(start),
		})
		require.NoError(t, err)
		require.NoError(t, store.InsertParsedLogGroup(ctx, logGroupID))
		instance, err := store.InsertInstance(ctx, database.InsertInstanceParams{
			ID: uuid.New(), RealmID: realmID, LogGroupID: logGroupID, Name: "Molten Core",
			HashedSlug: pgtype.Text{String: slug, Valid: true}, GuildID: uuid.NullUUID{UUID: guild.ID, Valid: true},
			StartTime: database.Timestamptz(start), EndTime: database.Timestamptz(start.Add(time.Hour)),
			Capabilities: []string{}, Category: pgtype.Text{String: "raid", Valid: true},
		})
		require.NoError(t, err)
		return instance
	}

	logA, logB := uuid.New(), uuid.New()
	instanceA := makeInstance(logA, "slug-a", time.Now().Add(-2*time.Hour))
	instanceB := makeInstance(logB, "slug-b", time.Now().Add(-time.Hour))

	annA, err := worker.reconcile(ctx, instanceA, 0, "channel")
	require.NoError(t, err)
	annB, err := worker.reconcile(ctx, instanceB, 0, "channel")
	require.NoError(t, err)
	require.NotEqual(t, annA.announcement.ID, annB.announcement.ID)

	require.NoError(t, store.SetDuplicateGroupIDs(ctx, database.SetDuplicateGroupIDsParams{
		DuplicateGroupID: uuid.NullUUID{UUID: instanceA.ID, Valid: true}, Ids: []uuid.UUID{instanceA.ID, instanceB.ID},
	}))
	instanceB, err = store.GetLogInstanceForDiscordAnnouncement(ctx, instanceB.ID)
	require.NoError(t, err)
	merged, err := worker.reconcile(ctx, instanceB, 0, "channel")
	require.NoError(t, err)
	require.Equal(t, annA.announcement.ID, merged.announcement.ID)
	require.Equal(t, annB.announcement.ID, merged.obsolete.ID)
	sources, err := store.ListDiscordAnnouncementSources(ctx, merged.announcement.ID)
	require.NoError(t, err)
	require.Len(t, sources, 2)

	require.NoError(t, store.DeleteAllParsedLogsByGroupID(ctx, logA))
	require.NoError(t, store.InsertParsedLogGroup(ctx, logA))
	reparsed, err := store.InsertInstance(ctx, database.InsertInstanceParams{
		ID: uuid.New(), RealmID: realmID, LogGroupID: logA, Name: "Molten Core",
		HashedSlug: pgtype.Text{String: "slug-a", Valid: true}, GuildID: uuid.NullUUID{UUID: guild.ID, Valid: true},
		StartTime: database.Timestamptz(time.Now()), EndTime: database.Timestamptz(time.Now().Add(time.Hour)),
		Capabilities: []string{}, Category: pgtype.Text{String: "raid", Valid: true},
	})
	require.NoError(t, err)
	reconciled, err := worker.reconcile(ctx, reparsed, 0, "channel")
	require.NoError(t, err)
	require.Equal(t, merged.announcement.ID, reconciled.announcement.ID)
}

func TestArgsAnnounceRaidLogInsertOpts(t *testing.T) {
	t.Parallel()

	opts := (ArgsAnnounceRaidLog{}).InsertOpts()
	require.Equal(t, riverconst.QueueDiscordAnnouncements, opts.Queue)
	require.Equal(t, 1, opts.MaxAttempts)
	require.True(t, opts.UniqueOpts.ByArgs)
	require.Contains(t, opts.UniqueOpts.ByState, rivertype.JobStatePending)
	require.Contains(t, opts.UniqueOpts.ByState, rivertype.JobStateRetryable)
	require.NotContains(t, opts.UniqueOpts.ByState, rivertype.JobStateRunning)
}

func TestAnnouncementScopeMatches(t *testing.T) {
	t.Parallel()

	tests := []struct {
		scope, category string
		want            bool
	}{
		{scope: "all", category: "raid", want: true},
		{scope: "all", category: "dungeon", want: true},
		{scope: "raids_only", category: "raid", want: true},
		{scope: "raids_only", category: "dungeon", want: false},
		{scope: "dungeons_only", category: "dungeon", want: true},
		{scope: "dungeons_only", category: "raid", want: false},
		{scope: "invalid", category: "raid", want: false},
	}
	for _, test := range tests {
		require.Equal(t, test.want, announcementScopeMatches(test.scope, test.category))
	}
}

func TestEffectiveRunID(t *testing.T) {
	t.Parallel()

	instanceID := uuid.New()
	duplicateID := uuid.New()
	require.Equal(t, instanceID, effectiveRunID(database.LogInstance{ID: instanceID}))
	require.Equal(t, duplicateID, effectiveRunID(database.LogInstance{
		ID:               instanceID,
		DuplicateGroupID: uuid.NullUUID{UUID: duplicateID, Valid: true},
	}))
}

func TestInstanceURL(t *testing.T) {
	t.Parallel()

	id := uuid.New()
	worker := &WorkerAnnounceRaidLog{bot: &Bot{config: Config{AccessURL: "https://chronicle.example/"}}}
	require.Equal(t, "https://chronicle.example/instances/durable-slug", worker.instanceURL(id, pgtype.Text{String: "durable-slug", Valid: true}))
	require.Equal(t, "https://chronicle.example/instances/"+id.String(), worker.instanceURL(id, pgtype.Text{}))
}
