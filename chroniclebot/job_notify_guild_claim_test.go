package chroniclebot

import (
	"context"
	"errors"
	"testing"

	"github.com/Emyrk/chronicle/internal/testutil"
	"github.com/riverqueue/river"
	"github.com/riverqueue/river/rivertype"
	"github.com/stretchr/testify/require"
)

type recordingGuildClaimQueue struct {
	args  ArgsSendDiscordDM
	calls int
	err   error
}

func (q *recordingGuildClaimQueue) Insert(_ context.Context, args river.JobArgs, _ *river.InsertOpts) (*rivertype.JobInsertResult, error) {
	q.calls++
	q.args = args.(ArgsSendDiscordDM)
	return nil, q.err
}

func TestEnqueueGuildClaimDecision(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	bot, err := New(ctx, testutil.Logger(t), Config{Token: "test"})
	require.NoError(t, err)
	queue := &recordingGuildClaimQueue{}
	args := ArgsNotifyGuildClaimDecision{ProofID: "proof", DiscordID: "discord-user", Status: "approved", GuildName: "Guild"}
	require.NoError(t, EnqueueGuildClaimDecision(ctx, queue, bot, args))
	require.Equal(t, 1, queue.calls)
	require.Equal(t, "proof", queue.args.UniqueKey)
	require.Equal(t, "discord-user", queue.args.DiscordID)
	require.Len(t, queue.args.Message.Embeds, 1)
	require.Equal(t, "Guild page claimed", queue.args.Message.Embeds[0].Title)
	queue.err = errors.New("queue unavailable")
	require.ErrorIs(t, EnqueueGuildClaimDecision(ctx, queue, bot, args), queue.err)
	require.Error(t, EnqueueGuildClaimDecision(ctx, nil, bot, args))
	require.NoError(t, EnqueueGuildClaimDecision(ctx, nil, bot, ArgsNotifyGuildClaimDecision{}))
}

func TestGuildClaimDecisionMessage(t *testing.T) {
	t.Parallel()
	for _, tc := range []struct {
		status string
		title  string
		color  int
	}{
		{status: "approved", title: "Guild page claimed", color: 0x57F287},
		{status: "rejected", title: "Guild page claim rejected", color: 0xED4245},
	} {
		t.Run(tc.status, func(t *testing.T) {
			t.Parallel()
			args := ArgsNotifyGuildClaimDecision{
				Status: tc.status, URL: "https://chronicle.example/g/guild", TenantName: "Turtle WoW",
				GuildName: "Claimed Guild", RealmName: "Realm", Response: "  Reviewer note  ",
			}
			message := guildClaimDecisionMessage(args)
			require.NotNil(t, message.AllowedMentions)
			require.Empty(t, message.AllowedMentions.Parse)
			require.Len(t, message.Embeds, 1)
			embed := message.Embeds[0]
			require.Equal(t, tc.title, embed.Title)
			require.Equal(t, tc.color, embed.Color)
			require.Equal(t, args.URL, embed.URL)
			require.Len(t, embed.Fields, 3)
			require.Equal(t, "Claimed Guild (Realm)", embed.Fields[0].Value)
			require.Equal(t, "Turtle WoW", embed.Fields[1].Value)
			require.Equal(t, "Reviewer note", embed.Fields[2].Value)
		})
	}
}
