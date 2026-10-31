package chroniclebot

import (
	"context"
	"testing"
	"time"

	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/dbtestutil"
	"github.com/Emyrk/chronicle/internal/testutil"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/riverqueue/river"
	"github.com/riverqueue/river/rivertype"
	"github.com/stretchr/testify/require"
)

type recordingJobInserter struct {
	recordingDiscordDMQueue
}

func (*recordingJobInserter) InsertManyTx(context.Context, pgx.Tx, []river.InsertManyParams) ([]*rivertype.JobInsertResult, error) {
	return nil, nil
}

func insertDiscordUser(ctx context.Context, t *testing.T, store database.Store, discordID string) uuid.UUID {
	t.Helper()
	userID := uuid.New()
	_, err := store.InsertUser(ctx, database.InsertUserParams{ID: userID, Username: "notify-" + uuid.NewString()[:8]})
	require.NoError(t, err)
	_, err = store.InsertUserAuth(ctx, database.InsertUserAuthParams{
		ID: uuid.New(), LinkedID: discordID, UserID: userID, Provider: "discord",
		CreatedAt: database.Timestamptz(time.Now()), UpdatedAt: database.Timestamptz(time.Now()),
	})
	require.NoError(t, err)
	return userID
}

func enableDiscordNotification(ctx context.Context, t *testing.T, store database.Store, userID uuid.UUID, event chroniclesdk.NotificationEvent) {
	t.Helper()
	_, err := store.UpsertUserNotificationSetting(ctx, database.UpsertUserNotificationSettingParams{
		UserID: userID, Channel: string(chroniclesdk.NotificationChannelDiscord), Event: string(event), Enabled: true,
	})
	require.NoError(t, err)
}

func TestNotifySidekickUploadAccepted(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitShort)
	store, _ := dbtestutil.NewDB(t)

	queue := &recordingJobInserter{}
	bot := &Bot{config: Config{DB: store, AccessURL: "https://chronicle.example", PrimaryDomain: "chronicle.example"}, queue: queue}
	userID := insertDiscordUser(ctx, t, store, "discord-sidekick")
	logGroupID := uuid.New()
	tenant := pgtype.Text{String: "capy", Valid: true}

	// Not opted in.
	require.NoError(t, bot.NotifySidekickUploadAccepted(ctx, userID, logGroupID, tenant))
	require.Zero(t, queue.calls)

	enableDiscordNotification(ctx, t, store, userID, chroniclesdk.NotificationEventSidekickUploadAccepted)
	require.NoError(t, bot.NotifySidekickUploadAccepted(ctx, userID, logGroupID, tenant))
	require.Equal(t, 1, queue.calls)
	require.Equal(t, "discord-sidekick", queue.args.DiscordID)
	require.Len(t, queue.args.Message.Embeds, 1)
	require.Equal(t, "Upload accepted", queue.args.Message.Embeds[0].Title)
	require.Equal(t, "Your combat log was received and is being processed.", queue.args.Message.Embeds[0].Description)
	require.Equal(t, "https://capy.chronicle.example/logs/"+logGroupID.String(), queue.args.Message.Embeds[0].URL)
	require.Equal(t, "sidekick-upload-accepted:"+logGroupID.String(), queue.args.UniqueKey)
}

func TestNotifySidekickAppendAccepted(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitShort)
	store, _ := dbtestutil.NewDB(t)

	queue := &recordingJobInserter{}
	bot := &Bot{config: Config{DB: store, AccessURL: "https://chronicle.example", PrimaryDomain: "chronicle.example"}, queue: queue}
	userID := insertDiscordUser(ctx, t, store, "discord-sidekick-append")
	logGroupID := uuid.New()
	uploadID := uuid.New()
	tenant := pgtype.Text{String: "capy", Valid: true}

	// The new-log setting does not opt the user into append notifications.
	enableDiscordNotification(ctx, t, store, userID, chroniclesdk.NotificationEventSidekickUploadAccepted)
	require.NoError(t, bot.NotifySidekickAppendAccepted(ctx, userID, logGroupID, uploadID, tenant))
	require.Zero(t, queue.calls)

	enableDiscordNotification(ctx, t, store, userID, chroniclesdk.NotificationEventSidekickAppendAccepted)
	require.NoError(t, bot.NotifySidekickAppendAccepted(ctx, userID, logGroupID, uploadID, tenant))
	require.Equal(t, 1, queue.calls)
	require.Equal(t, "discord-sidekick-append", queue.args.DiscordID)
	require.Len(t, queue.args.Message.Embeds, 1)
	require.Equal(t, "Log update accepted", queue.args.Message.Embeds[0].Title)
	require.Equal(t, "Your new combat log data was received. The previous log will automatically be updated.", queue.args.Message.Embeds[0].Description)
	require.Equal(t, "https://capy.chronicle.example/logs/"+logGroupID.String(), queue.args.Message.Embeds[0].URL)
	require.Equal(t, "sidekick-append-accepted:"+uploadID.String(), queue.args.UniqueKey)
}

func TestNotifyUploadProcessed(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitShort)
	store, _ := dbtestutil.NewDB(t)

	queue := &recordingJobInserter{}
	bot := &Bot{config: Config{DB: store, AccessURL: "https://chronicle.example"}, logger: testutil.Logger(t), queue: queue}
	worker := &WorkerNotifyUploadProcessed{bot: bot}
	userID := insertDiscordUser(ctx, t, store, "discord-processed")
	realmID := uuid.MustParse("bcf173a7-c94a-49fe-8930-27435d722fb7")

	startedAt := time.Date(2026, time.August, 14, 19, 0, 0, 0, time.UTC)
	logGroupID := uuid.New()
	_, err := store.InsertWoWLogGroup(ctx, database.InsertWoWLogGroupParams{
		ID: logGroupID, Owner: userID, LogType: database.LogTypeV1,
		CreatedAt: database.Timestamptz(startedAt), UpdatedAt: database.Timestamptz(startedAt),
	})
	require.NoError(t, err)
	require.NoError(t, store.InsertParsedLogGroup(ctx, logGroupID))
	for _, category := range []pgtype.Text{{String: "raid", Valid: true}, {}} {
		_, err = store.InsertInstance(ctx, database.InsertInstanceParams{
			ID: uuid.New(), RealmID: realmID, LogGroupID: logGroupID, Name: "Molten Core",
			StartTime: database.Timestamptz(startedAt), EndTime: database.Timestamptz(startedAt.Add(time.Hour)),
			Capabilities: []string{}, Category: category,
		})
		require.NoError(t, err)
	}
	job := &river.Job[ArgsNotifyUploadProcessed]{Args: ArgsNotifyUploadProcessed{LogGroupID: logGroupID}}

	// Not opted in.
	require.NoError(t, worker.Work(ctx, job))
	require.Zero(t, queue.calls)

	enableDiscordNotification(ctx, t, store, userID, chroniclesdk.NotificationEventUploadProcessed)
	require.NoError(t, worker.Work(ctx, job))
	require.Equal(t, 1, queue.calls)
	require.Equal(t, "discord-processed", queue.args.DiscordID)
	// Only the categorized instance is announced, in the guild announcement format.
	require.Len(t, queue.args.Message.Embeds, 1)
	require.Equal(t, "RAID UPLOAD", queue.args.Message.Embeds[0].Author.Name)
}
