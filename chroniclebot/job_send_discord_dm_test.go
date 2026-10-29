package chroniclebot

import (
	"context"
	"errors"
	"testing"

	"github.com/Emyrk/chronicle/chronicle/riverqueue/riverconst"
	"github.com/Emyrk/chronicle/internal/testutil"
	"github.com/bwmarrin/discordgo"
	"github.com/riverqueue/river"
	"github.com/riverqueue/river/rivertype"
	"github.com/stretchr/testify/require"
)

type recordingDiscordDMQueue struct {
	args  ArgsSendDiscordDM
	calls int
	err   error
}

func (q *recordingDiscordDMQueue) Insert(_ context.Context, args river.JobArgs, _ *river.InsertOpts) (*rivertype.JobInsertResult, error) {
	q.calls++
	q.args = args.(ArgsSendDiscordDM)
	return nil, q.err
}

func TestEnqueueDiscordDM(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	bot, err := New(ctx, testutil.Logger(t), Config{Token: "test"})
	require.NoError(t, err)
	queue := &recordingDiscordDMQueue{}
	args := ArgsSendDiscordDM{
		DiscordID: "discord-user",
		Message: DiscordDirectMessage{
			Content: "hello",
			Embeds:  []*discordgo.MessageEmbed{{Title: "Title"}},
		},
		UniqueKey: "event-id",
	}

	require.NoError(t, EnqueueDiscordDM(ctx, queue, bot, args))
	require.Equal(t, 1, queue.calls)
	require.Equal(t, args, queue.args)

	queue.err = errors.New("queue unavailable")
	require.ErrorIs(t, EnqueueDiscordDM(ctx, queue, bot, args), queue.err)
	require.Error(t, EnqueueDiscordDM(ctx, nil, bot, args))
	require.NoError(t, EnqueueDiscordDM(ctx, nil, bot, ArgsSendDiscordDM{}))
	require.NoError(t, EnqueueDiscordDM(ctx, nil, nil, args))
}

func TestSendDiscordDMInsertOpts(t *testing.T) {
	t.Parallel()
	args := ArgsSendDiscordDM{}
	require.Equal(t, KindSendDiscordDM, args.Kind())
	opts := args.InsertOpts()
	require.Equal(t, riverconst.QueueDiscordAnnouncements, opts.Queue)
	require.Equal(t, 1, opts.MaxAttempts)
	require.False(t, opts.UniqueOpts.ByArgs)

	opts = ArgsSendDiscordDM{UniqueKey: "event-id"}.InsertOpts()
	require.True(t, opts.UniqueOpts.ByArgs)
	require.Contains(t, opts.UniqueOpts.ByState, rivertype.JobStatePending)
	require.Contains(t, opts.UniqueOpts.ByState, rivertype.JobStateRetryable)
	require.Contains(t, opts.UniqueOpts.ByState, rivertype.JobStateRunning)
}

func TestDiscordDirectMessage(t *testing.T) {
	t.Parallel()
	embed := &discordgo.MessageEmbed{Title: "Title"}
	message := discordDirectMessage(DiscordDirectMessage{
		Content: "hello",
		Embeds:  []*discordgo.MessageEmbed{embed},
	})
	require.Equal(t, "hello", message.Content)
	require.Equal(t, []*discordgo.MessageEmbed{embed}, message.Embeds)
	require.NotNil(t, message.AllowedMentions)
	require.Empty(t, message.AllowedMentions.Parse)
}
