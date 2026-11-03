package chroniclebot

import (
	"context"
	"errors"
	"log/slog"
	"strings"
	"time"

	"github.com/Emyrk/chronicle/database"
	"github.com/bwmarrin/discordgo"
	"github.com/jackc/pgx/v5"
)

func DefaultCommands(bot *Bot) []Command {
	commands := make([]Command, 0, 2)
	if bot.ChronicleGuildID() != "" {
		commands = append(commands, pingCommand(bot))
	}
	if bot.config.Inference != nil {
		commands = append(commands, askCommand(bot))
	}
	return commands
}

func askCommand(bot *Bot) Command {
	contexts := []discordgo.InteractionContextType{discordgo.InteractionContextGuild, discordgo.InteractionContextBotDM}
	return Command{
		Global: true,
		Definition: &discordgo.ApplicationCommand{
			Name:        "ask",
			Description: "Ask Chronicle a question.",
			Contexts:    &contexts,
			Options: []*discordgo.ApplicationCommandOption{{
				Type:        discordgo.ApplicationCommandOptionString,
				Name:        "question",
				Description: "What would you like Chronicle to find or explain?",
				Required:    true,
				MaxLength:   6000,
			}},
		},
		Handler: func(s *discordgo.Session, i *discordgo.InteractionCreate) {
			directMessage := i.GuildID == ""
			if !directMessage && i.GuildID != bot.ChronicleGuildID() {
				_ = RespondEphemeral(s, i, "This command is only available in Chronicle's configured Discord server.")
				return
			}
			discordUser := i.User
			if i.Member != nil && i.Member.User != nil {
				discordUser = i.Member.User
			}
			if discordUser == nil || discordUser.Bot {
				_ = RespondEphemeral(s, i, "Could not identify your Discord account.")
				return
			}
			ctx, cancel := context.WithTimeout(context.Background(), 3*time.Minute)
			defer cancel()
			link, err := bot.config.DB.GetUserAuthByLinkedID(ctx, database.GetUserAuthByLinkedIDParams{LinkedID: discordUser.ID, Provider: "discord"})
			if errors.Is(err, pgx.ErrNoRows) {
				message := "Link your Discord account to Chronicle before using `/ask`."
				if bot.config.AccessURL != "" {
					message += " " + strings.TrimRight(bot.config.AccessURL, "/") + "/account/settings"
				}
				_ = RespondEphemeral(s, i, message)
				return
			}
			if err != nil {
				bot.logger.Error("failed to resolve Discord account link", slog.String("discord_user_id", discordUser.ID), slog.String("error", err.Error()))
				_ = RespondEphemeral(s, i, "Chronicle could not verify your linked account. Please try again.")
				return
			}
			if err := DeferResponse(s, i); err != nil {
				bot.logger.Error("failed to defer Discord ask command", slog.String("error", err.Error()))
				return
			}
			data := i.ApplicationCommandData()
			if len(data.Options) == 0 {
				_ = FollowupMessage(s, i, "A question is required.")
				return
			}
			answer, err := bot.config.Inference.AskDiscord(ctx, link.UserID, i.ID, data.Options[0].StringValue(), directMessage)
			if err != nil {
				bot.logger.Warn("Discord ask command failed", slog.String("discord_user_id", discordUser.ID), slog.String("error", err.Error()))
				message := "The Chronicle assistant could not answer that question. Please try again."
				if userError, ok := err.(interface{ UserMessage() string }); ok {
					message = userError.UserMessage()
				}
				_ = FollowupMessage(s, i, message)
				return
			}
			if err := FollowupMessages(s, i, answer); err != nil {
				bot.logger.Error("failed to send Discord ask response", slog.String("error", err.Error()))
			}
		},
	}
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
