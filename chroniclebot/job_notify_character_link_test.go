package chroniclebot

import (
	"context"
	"errors"
	"strings"
	"testing"

	"github.com/Emyrk/chronicle/chronicle/riverqueue/riverconst"
	"github.com/Emyrk/chronicle/internal/testutil"
	"github.com/riverqueue/river"
	"github.com/riverqueue/river/rivertype"
	"github.com/stretchr/testify/require"
)

type recordingCharacterLinkQueue struct {
	args  ArgsNotifyCharacterLinkDecision
	calls int
	err   error
}

func (q *recordingCharacterLinkQueue) Insert(_ context.Context, args river.JobArgs, _ *river.InsertOpts) (*rivertype.JobInsertResult, error) {
	q.calls++
	q.args = args.(ArgsNotifyCharacterLinkDecision)
	return nil, q.err
}

func TestEnqueueCharacterLinkDecision(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	bot, err := New(ctx, testutil.Logger(t), Config{Token: "test"})
	require.NoError(t, err)
	queue := &recordingCharacterLinkQueue{}
	args := ArgsNotifyCharacterLinkDecision{ProofID: "proof", DiscordID: "discord-user", Status: "rejected"}

	require.NoError(t, EnqueueCharacterLinkDecision(ctx, queue, bot, args))
	require.Equal(t, 1, queue.calls)
	require.Equal(t, args, queue.args)

	queue.err = errors.New("queue unavailable")
	require.ErrorIs(t, EnqueueCharacterLinkDecision(ctx, queue, bot, args), queue.err)
	require.Error(t, EnqueueCharacterLinkDecision(ctx, nil, bot, args))
	require.NoError(t, EnqueueCharacterLinkDecision(ctx, nil, bot, ArgsNotifyCharacterLinkDecision{}))
	require.NoError(t, EnqueueCharacterLinkDecision(ctx, nil, nil, args))
}

func TestCharacterLinkDecisionInsertOpts(t *testing.T) {
	t.Parallel()
	args := ArgsNotifyCharacterLinkDecision{}
	require.Equal(t, KindNotifyCharacterLinkDecision, args.Kind())
	opts := args.InsertOpts()
	require.Equal(t, riverconst.QueueDiscordAnnouncements, opts.Queue)
	require.Equal(t, 1, opts.MaxAttempts)
	require.True(t, opts.UniqueOpts.ByArgs)
	require.Contains(t, opts.UniqueOpts.ByState, rivertype.JobStatePending)
	require.Contains(t, opts.UniqueOpts.ByState, rivertype.JobStateRetryable)
	require.Contains(t, opts.UniqueOpts.ByState, rivertype.JobStateRunning)
}

func TestCharacterLinkDecisionMessage(t *testing.T) {
	t.Parallel()
	for _, tc := range []struct {
		status string
		title  string
		color  int
	}{
		{status: "approved", title: "Character link approved", color: 0x57F287},
		{status: "partial", title: "Character link partially approved", color: 0xFEE75C},
		{status: "rejected", title: "Character link rejected", color: 0xED4245},
	} {
		t.Run(tc.status, func(t *testing.T) {
			t.Parallel()
			message := characterLinkDecisionMessage(ArgsNotifyCharacterLinkDecision{
				Status:             tc.status,
				URL:                "https://chronicle.example/account/characters",
				TenantName:         "Turtle WoW",
				ApprovedCharacters: []string{"Approved (Realm)"},
				RejectedCharacters: []string{"Rejected (Realm)"},
				Response:           "  Reviewer note  ",
			})
			require.NotNil(t, message.AllowedMentions)
			require.Empty(t, message.AllowedMentions.Parse)
			require.Len(t, message.Embeds, 1)
			embed := message.Embeds[0]
			require.Equal(t, tc.title, embed.Title)
			require.Equal(t, tc.color, embed.Color)
			require.Equal(t, "https://chronicle.example/account/characters", embed.URL)
			require.Len(t, embed.Fields, 4)
			require.Equal(t, "Site", embed.Fields[0].Name)
			require.Equal(t, "Turtle WoW", embed.Fields[0].Value)
			require.Equal(t, "Approved (Realm)", embed.Fields[1].Value)
			require.Equal(t, "Rejected (Realm)", embed.Fields[2].Value)
			require.Equal(t, "Reviewer note", embed.Fields[3].Value)
		})
	}
}

func TestDiscordEmbedFieldValueTruncates(t *testing.T) {
	t.Parallel()
	value := discordEmbedFieldValue(strings.Repeat("é", 1025))
	require.Len(t, []rune(value), 1024)
	require.True(t, strings.HasSuffix(value, "..."))

	message := characterLinkDecisionMessage(ArgsNotifyCharacterLinkDecision{TenantName: strings.Repeat("é", 1025)})
	require.Len(t, []rune(message.Embeds[0].Fields[0].Value), 1024)
	require.True(t, strings.HasSuffix(message.Embeds[0].Fields[0].Value, "..."))
}
