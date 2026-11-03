package chroniclebot

import (
	"context"
	"errors"
	"log/slog"
	"strings"
	"time"

	"github.com/Emyrk/chronicle/database"
	"github.com/bwmarrin/discordgo"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

func DefaultCommands(bot *Bot) []Command {
	commands := make([]Command, 0, 4)
	if bot.ChronicleGuildID() != "" {
		commands = append(commands, pingCommand(bot))
	}
	if bot.config.Inference != nil {
		commands = append(commands, askCommand(bot), setCommand(bot), getCommand(bot))
	}
	return commands
}

func commandAllowed(bot *Bot, s *discordgo.Session, i *discordgo.InteractionCreate) bool {
	if i.GuildID == "" || i.GuildID == bot.ChronicleGuildID() {
		return true
	}
	_ = RespondEphemeral(s, i, "This command is only available in Chronicle's configured Discord server.")
	return false
}

func commandDiscordUser(i *discordgo.InteractionCreate) *discordgo.User {
	if i.Member != nil && i.Member.User != nil {
		return i.Member.User
	}
	return i.User
}

func linkedChronicleUser(ctx context.Context, bot *Bot, s *discordgo.Session, i *discordgo.InteractionCreate) (uuid.UUID, bool) {
	discordUser := commandDiscordUser(i)
	if discordUser == nil || discordUser.Bot {
		_ = RespondEphemeral(s, i, "Could not identify your Discord account.")
		return uuid.Nil, false
	}
	link, err := bot.config.DB.GetUserAuthByLinkedID(ctx, database.GetUserAuthByLinkedIDParams{LinkedID: discordUser.ID, Provider: "discord"})
	if errors.Is(err, pgx.ErrNoRows) {
		message := "Link your Discord account to Chronicle before using AI commands."
		if bot.config.AccessURL != "" {
			message += " " + strings.TrimRight(bot.config.AccessURL, "/") + "/account/settings"
		}
		_ = RespondEphemeral(s, i, message)
		return uuid.Nil, false
	}
	if err != nil {
		bot.logger.Error("failed to resolve Discord account link", slog.String("discord_user_id", discordUser.ID), slog.String("error", err.Error()))
		_ = RespondEphemeral(s, i, "Chronicle could not verify your linked account. Please try again.")
		return uuid.Nil, false
	}
	return link.UserID, true
}

func commandStringOption(data discordgo.ApplicationCommandInteractionData, name string) string {
	for _, option := range data.Options {
		if option.Name == name {
			return strings.TrimSpace(option.StringValue())
		}
	}
	return ""
}

func askCommand(bot *Bot) Command {
	contexts := []discordgo.InteractionContextType{discordgo.InteractionContextGuild, discordgo.InteractionContextBotDM}
	return Command{
		Global: true,
		Definition: &discordgo.ApplicationCommand{
			Name:        "ask",
			Description: "Ask Chronicle a question.",
			Contexts:    &contexts,
			Options: []*discordgo.ApplicationCommandOption{
				{Type: discordgo.ApplicationCommandOptionString, Name: "question", Description: "What would you like Chronicle to find or explain?", Required: true, MaxLength: 6000},
				{Type: discordgo.ApplicationCommandOptionString, Name: "tenant", Description: "Override your saved Chronicle tenant for this question.", MaxLength: 100},
			},
		},
		Handler: func(s *discordgo.Session, i *discordgo.InteractionCreate) {
			if !commandAllowed(bot, s, i) {
				return
			}
			ctx, cancel := context.WithTimeout(context.Background(), 3*time.Minute)
			defer cancel()
			userID, ok := linkedChronicleUser(ctx, bot, s, i)
			if !ok {
				return
			}
			data := i.ApplicationCommandData()
			question := commandStringOption(data, "question")
			if question == "" {
				_ = RespondEphemeral(s, i, "A question is required.")
				return
			}
			if err := DeferResponse(s, i); err != nil {
				bot.logger.Error("failed to defer Discord ask command", slog.String("error", err.Error()))
				return
			}
			answer, err := bot.config.Inference.AskDiscord(ctx, userID, i.ID, question, commandStringOption(data, "tenant"), i.GuildID == "")
			if err != nil {
				bot.logger.Warn("Discord ask command failed", slog.String("user_id", userID.String()), slog.String("error", err.Error()))
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

func setCommand(bot *Bot) Command {
	contexts := []discordgo.InteractionContextType{discordgo.InteractionContextGuild, discordgo.InteractionContextBotDM}
	return Command{
		Global: true,
		Definition: &discordgo.ApplicationCommand{
			Name:        "set",
			Description: "Set a Chronicle Discord preference.",
			Contexts:    &contexts,
			Options: []*discordgo.ApplicationCommandOption{{
				Type:        discordgo.ApplicationCommandOptionSubCommand,
				Name:        "default-tenant",
				Description: "Set the Chronicle tenant used by /ask.",
				Options: []*discordgo.ApplicationCommandOption{{
					Type: discordgo.ApplicationCommandOptionString, Name: "slug", Description: "Chronicle tenant slug.", Required: true, MaxLength: 100,
				}},
			}},
		},
		Handler: func(s *discordgo.Session, i *discordgo.InteractionCreate) {
			if !commandAllowed(bot, s, i) {
				return
			}
			ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
			defer cancel()
			userID, ok := linkedChronicleUser(ctx, bot, s, i)
			if !ok {
				return
			}
			data := i.ApplicationCommandData()
			if len(data.Options) != 1 || data.Options[0].Name != "default-tenant" || len(data.Options[0].Options) != 1 {
				_ = RespondEphemeral(s, i, "A default tenant slug is required.")
				return
			}
			slug := strings.TrimSpace(data.Options[0].Options[0].StringValue())
			if err := bot.config.Inference.SetDiscordDefaultTenant(ctx, userID, slug); err != nil {
				message := "Chronicle could not save that tenant. Please try again."
				if userError, ok := err.(interface{ UserMessage() string }); ok {
					message = userError.UserMessage()
				}
				_ = RespondEphemeral(s, i, message)
				return
			}
			savedSlug, err := bot.config.Inference.GetDiscordDefaultTenant(ctx, userID)
			if err != nil {
				bot.logger.Error("failed to read saved Discord default tenant", slog.String("user_id", userID.String()), slog.String("error", err.Error()))
				_ = RespondEphemeral(s, i, "Your tenant was saved, but Chronicle could not confirm it. Use `/get default-tenant` to check.")
				return
			}
			_ = RespondEphemeral(s, i, "Your default Chronicle tenant is now `"+savedSlug+"`.")
		},
	}
}

func getCommand(bot *Bot) Command {
	contexts := []discordgo.InteractionContextType{discordgo.InteractionContextGuild, discordgo.InteractionContextBotDM}
	return Command{
		Global: true,
		Definition: &discordgo.ApplicationCommand{
			Name:        "get",
			Description: "Get a Chronicle Discord preference.",
			Contexts:    &contexts,
			Options: []*discordgo.ApplicationCommandOption{{
				Type: discordgo.ApplicationCommandOptionSubCommand, Name: "default-tenant", Description: "Show the Chronicle tenant used by /ask.",
			}},
		},
		Handler: func(s *discordgo.Session, i *discordgo.InteractionCreate) {
			if !commandAllowed(bot, s, i) {
				return
			}
			ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
			defer cancel()
			userID, ok := linkedChronicleUser(ctx, bot, s, i)
			if !ok {
				return
			}
			slug, err := bot.config.Inference.GetDiscordDefaultTenant(ctx, userID)
			if err != nil {
				bot.logger.Error("failed to read Discord default tenant", slog.String("user_id", userID.String()), slog.String("error", err.Error()))
				_ = RespondEphemeral(s, i, "Chronicle could not read your default tenant. Please try again.")
				return
			}
			if slug == "" {
				_ = RespondEphemeral(s, i, "You have not set a default tenant. Use `/set default-tenant` before asking a question.")
				return
			}
			_ = RespondEphemeral(s, i, "Your default Chronicle tenant is `"+slug+"`.")
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
