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

func (fakeDiscordInference) AskDiscord(context.Context, uuid.UUID, string, string, string, bool) (string, error) {
	return "answer", nil
}
func (fakeDiscordInference) SetDiscordDefaultTenant(context.Context, uuid.UUID, string) error {
	return nil
}
func (fakeDiscordInference) GetDiscordDefaultTenant(context.Context, uuid.UUID) (string, error) {
	return "turtle", nil
}

func TestDefaultCommandsIncludesGlobalAsk(t *testing.T) {
	t.Parallel()

	bot := &Bot{config: Config{GuildID: "chronicle-guild", Inference: fakeDiscordInference{}}}
	commands := DefaultCommands(bot)
	require.Len(t, commands, 4)
	for index, name := range []string{"ask", "set", "get"} {
		command := commands[index+1]
		require.Equal(t, name, command.Definition.Name)
		require.True(t, command.Global)
		require.NotNil(t, command.Definition.Contexts)
		require.ElementsMatch(t, []discordgo.InteractionContextType{discordgo.InteractionContextGuild, discordgo.InteractionContextBotDM}, *command.Definition.Contexts)
	}
	require.Equal(t, "tenant", commands[1].Definition.Options[1].Name)
	require.False(t, commands[1].Definition.Options[1].Required)
	require.Equal(t, "default-tenant", commands[2].Definition.Options[0].Name)
	require.Equal(t, "default-tenant", commands[3].Definition.Options[0].Name)
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
