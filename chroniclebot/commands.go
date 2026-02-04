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
	registeredCommands := make([]*discordgo.ApplicationCommand, 0, len(commands))
	for _, cmd := range commands {
		registered, err := b.session.ApplicationCommandCreate(
			b.session.State.User.ID,
			b.config.GuildID, // Empty string = global
			cmd.Definition,
		)
		if err != nil {
			return fmt.Errorf("register command %s: %w", cmd.Definition.Name, err)
		}
		registeredCommands = append(registeredCommands, registered)
		b.logger.Info("registered command",
			slog.String("name", cmd.Definition.Name),
			slog.String("guild_id", b.config.GuildID),
		)
	}

	// Store cleanup function to remove commands on shutdown
	b.handlers = append(b.handlers, func() {
		for _, cmd := range registeredCommands {
			err := b.session.ApplicationCommandDelete(b.session.State.User.ID, b.config.GuildID, cmd.ID)
			if err != nil {
				b.logger.Error("failed to delete command",
					slog.String("name", cmd.Name),
					slog.String("error", err.Error()),
				)
			}
		}
	})

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
