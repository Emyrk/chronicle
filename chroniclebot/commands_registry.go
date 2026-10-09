package chroniclebot

import (
	"log/slog"

	"github.com/bwmarrin/discordgo"
)

func DefaultCommands(bot *Bot) []Command {
	// Commands must never be registered globally. Guild commands are available
	// immediately and cannot be invoked from another Discord server.
	if bot.ChronicleGuildID() == "" {
		return nil
	}

	return []Command{pingCommand(bot)}
}

func pingCommand(bot *Bot) Command {
	return Command{
		Definition: &discordgo.ApplicationCommand{
			Name:        "ping",
			Description: "Check whether Chronicle's Discord gateway is connected.",
		},
		Handler: func(s *discordgo.Session, i *discordgo.InteractionCreate) {
			if i.GuildID != bot.ChronicleGuildID() {
				bot.logger.Warn("rejected Discord command from unexpected guild",
					slog.String("command", "ping"),
					slog.String("guild_id", i.GuildID),
				)
				if err := RespondEphemeral(s, i, "This command is not available in this server."); err != nil {
					bot.logger.Error("failed to respond to rejected Discord command", slog.String("error", err.Error()))
				}
				return
			}

			if err := RespondEphemeral(s, i, "Pong! Chronicle's Discord gateway is connected."); err != nil {
				bot.logger.Error("failed to respond to Discord ping command", slog.String("error", err.Error()))
			}
		},
	}
}
