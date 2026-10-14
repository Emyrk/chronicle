package chroniclebot

import (
	"context"
	"errors"
	"strings"
	"testing"
	"time"

	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/dbtestutil"
	"github.com/Emyrk/chronicle/internal/testutil"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/riverqueue/river"
	"github.com/riverqueue/river/rivertype"
	"github.com/stretchr/testify/require"
)

type recordingJobInserter struct {
	args river.JobArgs
}

func (q *recordingJobInserter) Insert(_ context.Context, args river.JobArgs, _ *river.InsertOpts) (*rivertype.JobInsertResult, error) {
	q.args = args
	return nil, nil
}

func (*recordingJobInserter) InsertManyTx(context.Context, pgx.Tx, []river.InsertManyParams) ([]*rivertype.JobInsertResult, error) {
	return nil, nil
}

func TestLoginEnqueuesDiscordSyncUser(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitShort)
	db, _ := dbtestutil.NewDB(t)

	userID := uuid.New()
	_, err := db.InsertUser(ctx, database.InsertUserParams{
		ID:       userID,
		Username: "discord-login-sync-" + uuid.NewString()[:8],
		Email:    uuid.NewString() + "@example.com",
	})
	require.NoError(t, err)

	queue := &recordingJobInserter{}
	bot := &Bot{config: Config{DB: db}, queue: queue}
	require.NoError(t, bot.ReactivateMembershipGrantCheckOnLogin(ctx, userID))

	args, ok := queue.args.(ArgsSyncDiscordUser)
	require.True(t, ok)
	require.Equal(t, userID, args.UserID)
	require.NotEqual(t, uuid.Nil, args.ClaimToken)
}

func TestDiscordMembershipJitter(t *testing.T) {
	t.Parallel()

	userID := uuid.MustParse("9eabcb3c-e592-42eb-a0bc-c8b0368ff7d0")
	dueAt := time.Date(2026, time.July, 31, 12, 0, 0, 0, time.UTC)
	first := discordMembershipJitter(userID, dueAt)
	second := discordMembershipJitter(userID, dueAt)

	require.Equal(t, first, second)
	require.GreaterOrEqual(t, first, time.Duration(0))
	require.Less(t, first, 55*time.Minute)
}

func TestDiscordMembershipJobOptions(t *testing.T) {
	t.Parallel()

	opts := ArgsCheckDiscordMembershipGrant{}.InsertOpts()
	require.Equal(t, 1, opts.MaxAttempts)
	require.True(t, opts.UniqueOpts.ByArgs)
	require.Contains(t, opts.UniqueOpts.ByState, rivertype.JobStateRetryable)
}

func TestDiscordSyncJobOptions(t *testing.T) {
	t.Parallel()

	opts := ArgsSyncDiscordUser{}.InsertOpts()
	require.Equal(t, 3, opts.MaxAttempts)
	require.True(t, opts.UniqueOpts.ByArgs)
	require.Contains(t, opts.UniqueOpts.ByState, rivertype.JobStateRetryable)
}

func TestMembershipGrantClaimLimit(t *testing.T) {
	t.Parallel()

	require.Equal(t, int32(100), (&Bot{}).membershipGrantClaimLimit())
	require.Equal(t, int32(25), (&Bot{config: Config{MembershipGrantChecksPerHour: 25}}).membershipGrantClaimLimit())
	require.Equal(t, int32(500), (&Bot{config: Config{MembershipGrantChecksPerHour: 1000}}).membershipGrantClaimLimit())
}

func TestSanitizeMembershipError(t *testing.T) {
	t.Parallel()

	message := "  " + strings.Repeat("x", discordMembershipErrorLimit+100) + "  "
	sanitized := sanitizeMembershipError(errors.New(message))
	require.Len(t, sanitized, discordMembershipErrorLimit)
	require.NotContains(t, sanitized, "  ")
}
