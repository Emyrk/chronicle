package chroniclebot

import (
	"context"
	"io"
	"log/slog"
	"strings"
	"testing"

	"github.com/bwmarrin/discordgo"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

func TestDefaultCommandsAreGuildScoped(t *testing.T) {
	t.Parallel()

	bot := &Bot{
		config: Config{GuildID: "chronicle-guild"},
		logger: slog.New(slog.NewTextHandler(io.Discard, nil)),
	}
	commands := DefaultCommands(bot)

	require.Len(t, commands, 1)
	require.Equal(t, "ping", commands[0].Definition.Name)
	require.NotNil(t, commands[0].Handler)
}

type fakeDiscordInference struct{}

func (fakeDiscordInference) AskDiscord(context.Context, uuid.UUID, string, string, bool) (string, error) {
	return "answer", nil
}

func TestDefaultCommandsIncludesGlobalAsk(t *testing.T) {
	t.Parallel()

	bot := &Bot{config: Config{GuildID: "chronicle-guild", Inference: fakeDiscordInference{}}}
	commands := DefaultCommands(bot)
	require.Len(t, commands, 2)
	require.Equal(t, "ask", commands[1].Definition.Name)
	require.True(t, commands[1].Global)
	require.NotNil(t, commands[1].Definition.Contexts)
	require.ElementsMatch(t, []discordgo.InteractionContextType{discordgo.InteractionContextGuild, discordgo.InteractionContextBotDM}, *commands[1].Definition.Contexts)
}

func TestSplitDiscordMessage(t *testing.T) {
	t.Parallel()

	parts := splitDiscordMessage(strings.Repeat("word ", 20), 25)
	require.Greater(t, len(parts), 1)
	for _, part := range parts {
		require.LessOrEqual(t, len(part), 25)
		require.NotEmpty(t, part)
	}
	require.Equal(t, "The assistant returned an empty response.", splitDiscordMessage(" ", 25)[0])
}

func TestDefaultCommandsDisabledWithoutGuild(t *testing.T) {
	t.Parallel()

	bot := &Bot{config: Config{}}
	require.Empty(t, DefaultCommands(bot))
}
