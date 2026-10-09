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

	require.Len(t, commands, 1)
	require.Equal(t, "ping", commands[0].Definition.Name)
	require.NotNil(t, commands[0].Handler)
}

func TestDefaultCommandsDisabledWithoutGuild(t *testing.T) {
	t.Parallel()

	bot := &Bot{config: Config{}}
	require.Empty(t, DefaultCommands(bot))
}
