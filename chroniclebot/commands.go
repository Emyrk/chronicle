package chroniclebot

import (
	"context"
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
	// Global commands are available in DMs as well as guilds.
	Global bool
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

	requestOption := discordRequestOption(context.Background(), "command_registration")

	// Register commands with Discord
	for _, cmd := range commands {
		guildID := b.config.GuildID
		if cmd.Global {
			guildID = ""
		}
		_, err := b.session.ApplicationCommandCreate(
			appID,
			guildID,
			cmd.Definition,
			requestOption,
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
		if !cmd.Global {
			registeredNames[cmd.Definition.Name] = true
		}
	}
	// Only clean guild-scoped commands. Global command registration may be shared
	// with other bot features, and deleting them here would remove unrelated commands.
	if b.config.GuildID == "" {
		return nil
	}
	existing, err := b.session.ApplicationCommands(appID, b.config.GuildID, requestOption)
	if err != nil {
		b.logger.Warn("failed to list existing commands for cleanup",
			slog.String("error", err.Error()),
		)
	} else {
		for _, cmd := range existing {
			if !registeredNames[cmd.Name] {
				if err := b.session.ApplicationCommandDelete(appID, b.config.GuildID, cmd.ID, requestOption); err != nil {
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
	}, discordRequestOption(context.Background(), "interaction_command"))
}

// RespondWithEmbed sends an embed response to an interaction.
func RespondWithEmbed(s *discordgo.Session, i *discordgo.InteractionCreate, embed *discordgo.MessageEmbed) error {
	return s.InteractionRespond(i.Interaction, &discordgo.InteractionResponse{
		Type: discordgo.InteractionResponseChannelMessageWithSource,
		Data: &discordgo.InteractionResponseData{
			Embeds: []*discordgo.MessageEmbed{embed},
		},
	}, discordRequestOption(context.Background(), "interaction_command"))
}

// RespondEphemeral sends a message only visible to the user who invoked the command.
func RespondEphemeral(s *discordgo.Session, i *discordgo.InteractionCreate, content string) error {
	return s.InteractionRespond(i.Interaction, &discordgo.InteractionResponse{
		Type: discordgo.InteractionResponseChannelMessageWithSource,
		Data: &discordgo.InteractionResponseData{
			Content: content,
			Flags:   discordgo.MessageFlagsEphemeral,
		},
	}, discordRequestOption(context.Background(), "interaction_command"))
}

// DeferResponse sends a "thinking..." response for commands that take time.
// Follow up with FollowupMessage.
func DeferResponse(s *discordgo.Session, i *discordgo.InteractionCreate) error {
	return s.InteractionRespond(i.Interaction, &discordgo.InteractionResponse{
		Type: discordgo.InteractionResponseDeferredChannelMessageWithSource,
	}, discordRequestOption(context.Background(), "interaction_command"))
}

// FollowupMessage sends a follow-up message after DeferResponse.
func FollowupMessage(s *discordgo.Session, i *discordgo.InteractionCreate, content string) error {
	_, err := s.FollowupMessageCreate(i.Interaction, true, &discordgo.WebhookParams{
		Content: content,
	}, discordRequestOption(context.Background(), "interaction_command"))
	return err
}
