package chroniclebot

import (
	"fmt"
	"log/slog"
	"strings"

	"github.com/bwmarrin/discordgo"
)

// Command represents a slash command with its handler.
type Command struct {
	// Definition is the slash command definition sent to Discord.
	Definition *discordgo.ApplicationCommand
	// Global registers this command globally so it can be used in bot DMs.
	// Guild invocations still need to be rejected unless they target ChronicleGuildID.
	Global bool
	// Handler is called when the command is invoked.
	Handler func(s *discordgo.Session, i *discordgo.InteractionCreate)
}

// RegisterCommands registers slash commands with Discord.
// If guildID is empty, commands are registered globally (takes up to 1 hour to propagate).
// If guildID is set, commands are registered instantly for that guild only.
func (b *Bot) RegisterCommands(commands []Command) error {
	b.commandMu.Lock()
	defer b.commandMu.Unlock()

	// Resolve the application (bot user) ID. State.User is populated by the
	// Ready event; if the gateway hasn't delivered it yet, fall back to "" so
	// discordgo uses the default application ID from the token.
	appID := ""
	if b.session.State != nil && b.session.State.User != nil {
		appID = b.session.State.User.ID
	}

	// Replace the command-handler registry used by the dispatcher installed at
	// construction time. This avoids accumulating handlers when a process loses
	// and later regains gateway leadership.
	b.mu.Lock()
	b.commandHandlers = make(map[string]func(s *discordgo.Session, i *discordgo.InteractionCreate), len(commands))
	for _, cmd := range commands {
		b.commandHandlers[cmd.Definition.Name] = cmd.Handler
	}
	b.mu.Unlock()

	registeredByScope := map[string]map[string]bool{}
	for _, cmd := range commands {
		guildID := b.config.GuildID
		if cmd.Global {
			guildID = ""
		}
		if registeredByScope[guildID] == nil {
			registeredByScope[guildID] = map[string]bool{}
		}
		registeredByScope[guildID][cmd.Definition.Name] = true
		if _, err := b.session.ApplicationCommandCreate(appID, guildID, cmd.Definition); err != nil {
			return fmt.Errorf("register command %s: %w", cmd.Definition.Name, err)
		}
		b.logger.Info("registered command", slog.String("name", cmd.Definition.Name), slog.String("guild_id", guildID))
	}

	// Clean stale commands in every scope Chronicle manages. The global scope is
	// always included because /ask may have been configured in an earlier run.
	if registeredByScope[""] == nil {
		registeredByScope[""] = map[string]bool{}
	}
	if b.config.GuildID != "" && registeredByScope[b.config.GuildID] == nil {
		registeredByScope[b.config.GuildID] = map[string]bool{}
	}
	for guildID, registeredNames := range registeredByScope {
		existing, err := b.session.ApplicationCommands(appID, guildID)
		if err != nil {
			b.logger.Warn("failed to list existing commands for cleanup", slog.String("guild_id", guildID), slog.String("error", err.Error()))
			continue
		}
		for _, existingCommand := range existing {
			if registeredNames[existingCommand.Name] {
				continue
			}
			if err := b.session.ApplicationCommandDelete(appID, guildID, existingCommand.ID); err != nil {
				b.logger.Error("failed to delete stale command", slog.String("name", existingCommand.Name), slog.String("error", err.Error()))
			} else {
				b.logger.Info("deleted stale command", slog.String("name", existingCommand.Name))
			}
		}
	}

	return nil
}

// RespondWithMessage sends a simple text response to an interaction.
func RespondWithMessage(s *discordgo.Session, i *discordgo.InteractionCreate, content string) error {
	return s.InteractionRespond(i.Interaction, &discordgo.InteractionResponse{
		Type: discordgo.InteractionResponseChannelMessageWithSource,
		Data: &discordgo.InteractionResponseData{
			Content: content,
		},
	})
}

// RespondWithEmbed sends an embed response to an interaction.
func RespondWithEmbed(s *discordgo.Session, i *discordgo.InteractionCreate, embed *discordgo.MessageEmbed) error {
	return s.InteractionRespond(i.Interaction, &discordgo.InteractionResponse{
		Type: discordgo.InteractionResponseChannelMessageWithSource,
		Data: &discordgo.InteractionResponseData{
			Embeds: []*discordgo.MessageEmbed{embed},
		},
	})
}

// RespondEphemeral sends a message only visible to the user who invoked the command.
func RespondEphemeral(s *discordgo.Session, i *discordgo.InteractionCreate, content string) error {
	return s.InteractionRespond(i.Interaction, &discordgo.InteractionResponse{
		Type: discordgo.InteractionResponseChannelMessageWithSource,
		Data: &discordgo.InteractionResponseData{
			Content: content,
			Flags:   discordgo.MessageFlagsEphemeral,
		},
	})
}

// DeferResponse sends a "thinking..." response for commands that take time.
// Follow up with FollowupMessage.
func DeferResponse(s *discordgo.Session, i *discordgo.InteractionCreate) error {
	return s.InteractionRespond(i.Interaction, &discordgo.InteractionResponse{
		Type: discordgo.InteractionResponseDeferredChannelMessageWithSource,
	})
}

// FollowupMessage sends a follow-up message after DeferResponse.
func FollowupMessage(s *discordgo.Session, i *discordgo.InteractionCreate, content string) error {
	_, err := s.FollowupMessageCreate(i.Interaction, true, &discordgo.WebhookParams{
		Content:         content,
		AllowedMentions: &discordgo.MessageAllowedMentions{Parse: []discordgo.AllowedMentionType{}},
	})
	return err
}

func FollowupMessages(s *discordgo.Session, i *discordgo.InteractionCreate, content string) error {
	for _, part := range splitDiscordMessage(content, 1900) {
		if err := FollowupMessage(s, i, part); err != nil {
			return err
		}
	}
	return nil
}

func splitDiscordMessage(content string, limit int) []string {
	if limit <= 0 {
		return nil
	}
	content = strings.TrimSpace(content)
	if content == "" {
		return []string{"The assistant returned an empty response."}
	}
	parts := make([]string, 0, len(content)/limit+1)
	for len(content) > limit {
		cut := strings.LastIndex(content[:limit+1], "\n")
		if cut < limit/2 {
			cut = strings.LastIndex(content[:limit+1], " ")
		}
		if cut < limit/2 {
			cut = limit
		}
		parts = append(parts, strings.TrimSpace(content[:cut]))
		content = strings.TrimSpace(content[cut:])
	}
	if content != "" {
		parts = append(parts, content)
	}
	return parts
}
