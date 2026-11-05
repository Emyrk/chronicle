package chroniclebot

import (
	"context"
	"errors"
	"log/slog"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/Emyrk/chronicle/database"
	"github.com/bwmarrin/discordgo"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

type aiSetupError string

func (e aiSetupError) Error() string       { return string(e) }
func (e aiSetupError) UserMessage() string { return string(e) }

type DiscordAI interface {
	AskDiscord(context.Context, uuid.UUID, string, string, string) (string, error)
	SearchDiscord(context.Context, uuid.UUID, string, string, string) (string, error)
	SetDiscordTenant(context.Context, uuid.UUID, string, string) (string, error)
	GetDiscordTenant(context.Context, uuid.UUID, string) (string, error)
}

func aiCommands(bot *Bot) []Command {
	question := &discordgo.ApplicationCommandOption{Type: discordgo.ApplicationCommandOptionString, Name: "question", Description: "Your question for Chronicle", Required: true}
	ask := Command{Global: true, Definition: &discordgo.ApplicationCommand{Name: "ask", Description: "Ask Chronicle a question", Options: []*discordgo.ApplicationCommandOption{question}}}
	ask.Handler = func(s *discordgo.Session, i *discordgo.InteractionCreate) {
		bot.handleAsk(s, i, i.ApplicationCommandData().Options)
	}
	query := &discordgo.ApplicationCommandOption{Type: discordgo.ApplicationCommandOptionString, Name: "query", Description: "Describe the Chronicle logs to find", Required: true}
	search := Command{Global: true, Definition: &discordgo.ApplicationCommand{Name: "search", Description: "Search Chronicle logs and explain the matches", Options: []*discordgo.ApplicationCommandOption{query}}}
	search.Handler = func(s *discordgo.Session, i *discordgo.InteractionCreate) {
		bot.handleSearch(s, i, i.ApplicationCommandData().Options)
	}
	chronicle := Command{Global: true, Definition: &discordgo.ApplicationCommand{Name: "chronicle", Description: "Chronicle AI and tenant settings", Options: []*discordgo.ApplicationCommandOption{
		{Type: discordgo.ApplicationCommandOptionSubCommand, Name: "ask", Description: "Ask Chronicle a question", Options: []*discordgo.ApplicationCommandOption{question}},
		{Type: discordgo.ApplicationCommandOptionSubCommandGroup, Name: "set", Description: "Set Chronicle preferences", Options: []*discordgo.ApplicationCommandOption{{Type: discordgo.ApplicationCommandOptionSubCommand, Name: "tenant", Description: "Set your default Chronicle tenant", Options: []*discordgo.ApplicationCommandOption{{Type: discordgo.ApplicationCommandOptionString, Name: "slug", Description: "Tenant subdomain slug", Required: true}}}}},
		{Type: discordgo.ApplicationCommandOptionSubCommandGroup, Name: "get", Description: "Read Chronicle preferences", Options: []*discordgo.ApplicationCommandOption{{Type: discordgo.ApplicationCommandOptionSubCommand, Name: "tenant", Description: "Show your default Chronicle tenant"}}},
	}}}
	chronicle.Handler = func(s *discordgo.Session, i *discordgo.InteractionCreate) {
		options := i.ApplicationCommandData().Options
		if len(options) == 0 {
			_ = RespondEphemeral(s, i, "Choose ask, set tenant, or get tenant.")
			return
		}
		switch options[0].Name {
		case "ask":
			bot.handleAsk(s, i, options[0].Options)
		case "set", "get":
			if len(options[0].Options) != 1 || options[0].Options[0].Name != "tenant" {
				_ = RespondEphemeral(s, i, "Choose tenant.")
				return
			}
			bot.handleTenant(s, i, options[0].Name, options[0].Options[0].Options)
		default:
			_ = RespondEphemeral(s, i, "Unknown Chronicle command.")
		}
	}
	return []Command{ask, search, chronicle}
}

func (b *Bot) linkedAIUser(ctx context.Context, i *discordgo.InteractionCreate) (uuid.UUID, string, error) {
	discordID := ""
	if i.Member != nil && i.Member.User != nil {
		discordID = i.Member.User.ID
	} else if i.User != nil {
		discordID = i.User.ID
	}
	if discordID == "" {
		return uuid.Nil, "", aiSetupError("Chronicle could not identify your Discord account.")
	}
	link, err := b.config.DB.GetUserAuthByLinkedID(ctx, database.GetUserAuthByLinkedIDParams{LinkedID: discordID, Provider: "discord"})
	if errors.Is(err, pgx.ErrNoRows) {
		message := "Link your Discord account in Chronicle settings before using AI."
		if b.config.AccessURL != "" {
			message += " " + strings.TrimRight(b.config.AccessURL, "/") + "/account/settings"
		}
		return uuid.Nil, "", aiSetupError(message)
	}
	if err != nil {
		return uuid.Nil, "", err
	}
	return link.UserID, discordID, nil
}

func (b *Bot) handleAsk(s *discordgo.Session, i *discordgo.InteractionCreate, options []*discordgo.ApplicationCommandInteractionDataOption) {
	if b.config.DiscordAI == nil {
		_ = RespondEphemeral(s, i, "Chronicle AI is unavailable.")
		return
	}
	if len(options) != 1 || options[0].Name != "question" {
		_ = RespondEphemeral(s, i, "Provide a question.")
		return
	}
	question := strings.TrimSpace(options[0].StringValue())
	if question == "" || len(question) > 32<<10 {
		_ = RespondEphemeral(s, i, "Ask a question of at most 32768 characters.")
		return
	}
	if err := s.InteractionRespond(i.Interaction, &discordgo.InteractionResponse{Type: discordgo.InteractionResponseDeferredChannelMessageWithSource, Data: &discordgo.InteractionResponseData{Flags: discordgo.MessageFlagsEphemeral}}); err != nil {
		b.logger.Error("defer Discord AI response", slog.String("error", err.Error()))
		return
	}
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancel()
	user, discordID, err := b.linkedAIUser(ctx, i)
	var answer string
	if err == nil {
		answer, err = b.config.DiscordAI.AskDiscord(ctx, user, discordID, i.ID, question)
	}
	if err != nil {
		answer = b.safeAIError(err)
	}
	b.aiFollowup(s, i, answer)
}

func (b *Bot) handleSearch(s *discordgo.Session, i *discordgo.InteractionCreate, options []*discordgo.ApplicationCommandInteractionDataOption) {
	if b.config.DiscordAI == nil {
		_ = RespondEphemeral(s, i, "Chronicle AI is unavailable.")
		return
	}
	if len(options) != 1 || options[0].Name != "query" {
		_ = RespondEphemeral(s, i, "Provide a search query.")
		return
	}
	query := strings.TrimSpace(options[0].StringValue())
	if query == "" || len(query) > 32<<10 {
		_ = RespondEphemeral(s, i, "Describe a search in at most 32768 characters.")
		return
	}
	if err := s.InteractionRespond(i.Interaction, &discordgo.InteractionResponse{Type: discordgo.InteractionResponseDeferredChannelMessageWithSource, Data: &discordgo.InteractionResponseData{Flags: discordgo.MessageFlagsEphemeral}}); err != nil {
		b.logger.Error("defer Discord search response", slog.String("error", err.Error()))
		return
	}
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancel()
	user, discordID, err := b.linkedAIUser(ctx, i)
	var answer string
	if err == nil {
		answer, err = b.config.DiscordAI.SearchDiscord(ctx, user, discordID, i.ID, query)
	}
	if err != nil {
		answer = b.safeAIError(err)
	}
	b.aiFollowup(s, i, answer)
}

func (b *Bot) handleTenant(s *discordgo.Session, i *discordgo.InteractionCreate, action string, options []*discordgo.ApplicationCommandInteractionDataOption) {
	if b.config.DiscordAI == nil {
		_ = RespondEphemeral(s, i, "Chronicle AI is unavailable.")
		return
	}
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	user, discordID, err := b.linkedAIUser(ctx, i)
	if err != nil {
		_ = RespondEphemeral(s, i, b.safeAIError(err))
		return
	}
	var slug string
	if action == "set" {
		if len(options) != 1 || options[0].Name != "slug" {
			_ = RespondEphemeral(s, i, "Provide a tenant slug.")
			return
		}
		slug, err = b.config.DiscordAI.SetDiscordTenant(ctx, user, discordID, strings.TrimSpace(options[0].StringValue()))
	} else {
		slug, err = b.config.DiscordAI.GetDiscordTenant(ctx, user, discordID)
	}
	if err != nil {
		_ = RespondEphemeral(s, i, b.safeAIError(err))
		return
	}
	if slug == "" {
		_ = RespondEphemeral(s, i, "No default tenant set. Use /chronicle set tenant.")
		return
	}
	_ = RespondEphemeral(s, i, "Your default Chronicle tenant: "+slug)
}

func (b *Bot) safeAIError(err error) string {
	var userError interface{ UserMessage() string }
	if errors.As(err, &userError) {
		return userError.UserMessage()
	}
	// Only errors from the inference boundary may be displayed to end users.
	var aiError interface{ IsDiscordUserError() bool }
	if errors.As(err, &aiError) && aiError.IsDiscordUserError() {
		return err.Error()
	}
	b.logger.Error("Discord AI command failed", slog.String("error", err.Error()))
	return "Chronicle could not complete that request. Please try again later."
}

func (b *Bot) aiFollowup(s *discordgo.Session, i *discordgo.InteractionCreate, text string) {
	text = strings.TrimSpace(text)
	if text == "" {
		text = "Chronicle returned no answer."
	}
	if utf8.RuneCountInString(text) > 1900 {
		text = string([]rune(text)[:1900]) + "…"
	}
	if _, err := s.FollowupMessageCreate(i.Interaction, true, &discordgo.WebhookParams{Content: text, Flags: discordgo.MessageFlagsEphemeral, AllowedMentions: &discordgo.MessageAllowedMentions{Parse: []discordgo.AllowedMentionType{}}}); err != nil {
		b.logger.Error("send Discord AI followup", slog.String("error", err.Error()))
	}
}
