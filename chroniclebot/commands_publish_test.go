package chroniclebot

import (
	"io"
	"log/slog"
	"net/http"
	"strings"
	"testing"

	"github.com/bwmarrin/discordgo"
	"github.com/stretchr/testify/require"
)

func publishClick() *discordgo.InteractionCreate {
	return &discordgo.InteractionCreate{Interaction: &discordgo.Interaction{
		Type: discordgo.InteractionMessageComponent, AppID: "bot", GuildID: "guild", ChannelID: "channel",
		Member:  &discordgo.Member{User: &discordgo.User{ID: "owner"}},
		Data:    discordgo.MessageComponentInteractionData{ComponentType: discordgo.ButtonComponent, CustomID: publishButtonPrefix + "owner"},
		Message: &discordgo.Message{ID: "message", ChannelID: "channel", Author: &discordgo.User{ID: "bot"}, Flags: discordgo.MessageFlagsEphemeral, Content: "The answer"},
	}}
}

func TestPublishRequiresOriginalOwnerAndPrivateResult(t *testing.T) {
	t.Parallel()
	click := publishClick()
	answer, ok := publishResult(click)
	require.True(t, ok)
	require.Equal(t, "The answer", answer)

	cases := map[string]func(*discordgo.InteractionCreate){
		"other user": func(i *discordgo.InteractionCreate) { i.Member.User.ID = "other" },
		"wrong button": func(i *discordgo.InteractionCreate) {
			i.Data = discordgo.MessageComponentInteractionData{ComponentType: discordgo.ButtonComponent, CustomID: "other:owner"}
		},
		"other owner": func(i *discordgo.InteractionCreate) {
			i.Data = discordgo.MessageComponentInteractionData{ComponentType: discordgo.ButtonComponent, CustomID: publishButtonPrefix + "other"}
		},
		"public message":    func(i *discordgo.InteractionCreate) { i.Message.Flags = 0 },
		"other application": func(i *discordgo.InteractionCreate) { i.Message.Author.ID = "other-bot" },
		"other channel":     func(i *discordgo.InteractionCreate) { i.Message.ChannelID = "other" },
		"dm":                func(i *discordgo.InteractionCreate) { i.GuildID = "" },
		"empty answer":      func(i *discordgo.InteractionCreate) { i.Message.Content = "  " },
	}
	for name, mutate := range cases {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			click := publishClick()
			mutate(click)
			_, ok := publishResult(click)
			require.False(t, ok)
		})
	}
}

func TestPublishOnlyOnSuccessfulGuildResult(t *testing.T) {
	t.Parallel()
	i := &discordgo.InteractionCreate{Interaction: &discordgo.Interaction{GuildID: "guild"}}
	require.Equal(t, "owner", publishOwner(i, "owner", nil))
	require.Empty(t, publishOwner(i, "owner", aiSetupError("not linked")))
	i.GuildID = ""
	require.Empty(t, publishOwner(i, "owner", nil))
}

func TestPrivateAnswerButtonHasNoMentions(t *testing.T) {
	t.Parallel()
	params := aiFollowupParams("<@123> "+strings.Repeat("a", 2000), "owner")
	require.Equal(t, discordgo.MessageFlagsEphemeral, params.Flags)
	require.LessOrEqual(t, len([]rune(params.Content)), 1901)
	require.Empty(t, params.AllowedMentions.Parse)
	require.Len(t, params.Components, 1)
	row := params.Components[0].(discordgo.ActionsRow)
	require.Equal(t, publishButtonPrefix+"owner", row.Components[0].(discordgo.Button).CustomID)
	require.Empty(t, aiFollowupParams("setup error", "").Components)
}

// The click acknowledges privately, posts via the channel endpoint, then
// removes the button from the original ephemeral answer. A repeat click may
// not produce another channel message.
func TestPublishPostsOnceAndRemovesButton(t *testing.T) {
	t.Parallel()
	var requests []struct{ method, path, body string }
	session, err := discordgo.New("Bot test-token")
	require.NoError(t, err)
	session.Client.Transport = roundTripFunc(func(r *http.Request) (*http.Response, error) {
		body, err := io.ReadAll(r.Body)
		require.NoError(t, err)
		requests = append(requests, struct{ method, path, body string }{r.Method, r.URL.Path, string(body)})
		return &http.Response{StatusCode: http.StatusOK, Body: io.NopCloser(strings.NewReader(`{"id":"sent"}`)), Header: make(http.Header)}, nil
	})
	bot := &Bot{logger: slog.New(slog.NewTextHandler(io.Discard, nil))}
	click := publishClick()
	click.ID, click.Token = "click", "interaction-token"
	bot.handlePublish(session, click)
	require.Len(t, requests, 3)
	require.Equal(t, "POST", requests[0].method)
	require.Contains(t, requests[0].path, "/interactions/click/interaction-token/callback")
	require.Contains(t, requests[0].body, `"type":6`)
	require.Equal(t, "POST", requests[1].method)
	require.Contains(t, requests[1].path, "/channels/channel/messages")
	require.Contains(t, requests[1].body, `"content":"The answer"`)
	require.Contains(t, requests[1].body, `"parse":[]`)
	require.Equal(t, "PATCH", requests[2].method)
	require.Contains(t, requests[2].path, "/webhooks/bot/interaction-token/messages/@original")
	require.Contains(t, requests[2].body, `"components":[]`)

	bot.handlePublish(session, click)
	require.Len(t, requests, 4)
	require.NotContains(t, requests[3].path, "/channels/channel/messages")
}
