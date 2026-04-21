package chroniclebot

import (
	"fmt"
	"log/slog"

	"github.com/bwmarrin/discordgo"
)

// Command represents a slash command with its handler.
type Command struct {
	// Definition is the slash command definition sent to Discord.
	Definition *discordgo.ApplicationCommand
	// Handler is called when the command is invoked.
	Handler func(s *discordgo.Session, i *discordgo.InteractionCreate)
}

// RegisterCommands registers slash commands with Discord.
// If guildID is empty, commands are registered globally (takes up to 1 hour to propagate).
// If guildID is set, commands are registered instantly for that guild only.
func (b *Bot) RegisterCommands(commands []Command) error {
	b.mu.Lock()
	defer b.mu.Unlock()

	// Resolve the application (bot user) ID. State.User is populated by the
	// Ready event; if the gateway hasn't delivered it yet, fall back to "" so
	// discordgo uses the default application ID from the token.
	appID := ""
	if b.session.State != nil && b.session.State.User != nil {
		appID = b.session.State.User.ID
	}

	// Create a map of command handlers
	handlers := make(map[string]func(s *discordgo.Session, i *discordgo.InteractionCreate))
	for _, cmd := range commands {
		handlers[cmd.Definition.Name] = cmd.Handler
	}

	// Add interaction handler
	b.session.AddHandler(func(s *discordgo.Session, i *discordgo.InteractionCreate) {
		if i.Type != discordgo.InteractionApplicationCommand {
			return
		}

		if handler, ok := handlers[i.ApplicationCommandData().Name]; ok {
			handler(s, i)
		}
	})

	// Register commands with Discord
	for _, cmd := range commands {
		_, err := b.session.ApplicationCommandCreate(
			appID,
			b.config.GuildID, // Empty string = global
			cmd.Definition,
		)
		if err != nil {
			return fmt.Errorf("register command %s: %w", cmd.Definition.Name, err)
		}
		b.logger.Info("registered command",
			slog.String("name", cmd.Definition.Name),
			slog.String("guild_id", b.config.GuildID),
		)
	}

	// Clean up stale commands that are registered with Discord but no
	// longer present in our command set.
	registeredNames := make(map[string]bool, len(commands))
	for _, cmd := range commands {
		registeredNames[cmd.Definition.Name] = true
	}
	existing, err := b.session.ApplicationCommands(appID, b.config.GuildID)
	if err != nil {
		b.logger.Warn("failed to list existing commands for cleanup",
			slog.String("error", err.Error()),
		)
	} else {
		for _, cmd := range existing {
			if !registeredNames[cmd.Name] {
				if err := b.session.ApplicationCommandDelete(appID, b.config.GuildID, cmd.ID); err != nil {
					b.logger.Error("failed to delete stale command",
						slog.String("name", cmd.Name),
						slog.String("error", err.Error()),
					)
				} else {
					b.logger.Info("deleted stale command",
						slog.String("name", cmd.Name),
					)
				}
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
		Content: content,
	})
	return err
}
