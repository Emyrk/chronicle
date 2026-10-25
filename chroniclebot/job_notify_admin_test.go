package chroniclebot

import (
	"context"
	"errors"
	"testing"

	"github.com/Emyrk/chronicle/chronicle/riverqueue/riverconst"
	"github.com/Emyrk/chronicle/internal/testutil"
	"github.com/riverqueue/river"
	"github.com/riverqueue/river/rivertype"
	"github.com/stretchr/testify/require"
)

type recordingAdminQueue struct {
	args  ArgsNotifyAdmin
	calls int
	err   error
}

func (q *recordingAdminQueue) Insert(_ context.Context, args river.JobArgs, _ *river.InsertOpts) (*rivertype.JobInsertResult, error) {
	q.calls++
	q.args = args.(ArgsNotifyAdmin)
	return nil, q.err
}

func TestEnqueueAdminNotification(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	bot, err := New(ctx, testutil.Logger(t), Config{Token: "test", AdminNotificationsChannelID: "admin-channel"})
	require.NoError(t, err)
	queue := &recordingAdminQueue{}
	args := ArgsNotifyAdmin{Title: "New review", ChannelID: "untrusted-channel"}
	require.NoError(t, EnqueueAdminNotification(ctx, queue, bot, args))
	require.Equal(t, "admin-channel", queue.args.ChannelID)
	require.Equal(t, 1, queue.calls)
	queue.err = errors.New("queue unavailable")
	require.ErrorIs(t, EnqueueAdminNotification(ctx, queue, bot, args), queue.err)
	require.Error(t, EnqueueAdminNotification(ctx, nil, bot, args))
	require.NoError(t, EnqueueAdminNotification(ctx, nil, nil, args))
}

func TestAdminNotificationMessage(t *testing.T) {
	t.Parallel()
	args := ArgsNotifyAdmin{
		Title: "New moderation request", URL: "https://chronicle.example/admin/reviews", ChannelID: "admin-channel",
		Fields: []AdminNotificationField{
			{Name: "Applicant", Value: "Player (account-id)", Inline: true},
			{Name: "Subject", Value: "Example Realm"},
		},
	}
	require.Equal(t, KindNotifyAdmin, args.Kind())
	require.Equal(t, riverconst.QueueDiscordAnnouncements, args.InsertOpts().Queue)
	message := adminNotificationMessage(args)
	require.Empty(t, message.Content)
	require.Empty(t, message.Files)
	require.NotNil(t, message.AllowedMentions)
	require.Empty(t, message.AllowedMentions.Parse)
	require.Len(t, message.Embeds, 1)
	embed := message.Embeds[0]
	require.Equal(t, args.Title, embed.Title)
	require.Equal(t, args.URL, embed.URL)
	require.Equal(t, "Applicant", embed.Fields[0].Name)
	require.Equal(t, "Player (account-id)", embed.Fields[0].Value)
	require.True(t, embed.Fields[0].Inline)
	require.Equal(t, "Example Realm", embed.Fields[1].Value)
}
