package chroniclebot

import (
	"io"
	"log/slog"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestDefaultCommandsAreGuildScoped(t *testing.T) {
	t.Parallel()

	bot := &Bot{
		config: Config{GuildID: "chronicle-guild"},
		logger: slog.New(slog.NewTextHandler(io.Discard, nil)),
	}
	commands := DefaultCommands(bot)

	require.Len(t, commands, 4)
	require.Equal(t, "ask", commands[0].Definition.Name)
	require.True(t, commands[0].Global)
	require.Equal(t, "search", commands[1].Definition.Name)
	require.Len(t, commands[1].Definition.Options, 1)
	require.Equal(t, "query", commands[1].Definition.Options[0].Name)
	require.True(t, commands[1].Definition.Options[0].Required)
	require.True(t, commands[1].Global)
	require.Equal(t, "chronicle", commands[2].Definition.Name)
	require.True(t, commands[2].Global)
	require.Equal(t, "ping", commands[3].Definition.Name)
	require.False(t, commands[3].Global)
	for _, command := range commands {
		require.NotNil(t, command.Handler)
	}
}

func TestAISetupErrorIsSafeToShow(t *testing.T) {
	t.Parallel()
	bot := &Bot{logger: slog.New(slog.NewTextHandler(io.Discard, nil))}
	require.Equal(t, "Link your Discord account.", bot.safeAIError(aiSetupError("Link your Discord account.")))
}

func TestDefaultCommandsDisabledWithoutGuild(t *testing.T) {
	t.Parallel()

	bot := &Bot{config: Config{}}
	commands := DefaultCommands(bot)
	require.Len(t, commands, 3)
	require.Equal(t, "ask", commands[0].Definition.Name)
	require.Equal(t, "search", commands[1].Definition.Name)
	require.Equal(t, "chronicle", commands[2].Definition.Name)
}
