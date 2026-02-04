// Package chroniclebot provides a Discord bot for Chronicle.
package chroniclebot

import (
	"context"
	"fmt"
	"log/slog"
	"sync"

	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/spice"
	"github.com/bwmarrin/discordgo"
)

// Config holds the configuration for the Discord bot.
type Config struct {
	// Token is the bot token from Discord Developer Portal.
	Token string
	// GuildID is your Discord server ID. If empty, commands are registered globally.
	GuildID string
	DB      database.Store
	Authz   *spice.Spice
}

// Bot represents a Discord bot instance.
type Bot struct {
	session *discordgo.Session
	logger  *slog.Logger
	config  Config

	mu       sync.RWMutex
	handlers []func()
}

// New creates a new Discord bot instance.
// Call Open() to connect to Discord.
func New(logger *slog.Logger, config Config) (*Bot, error) {
	if config.Token == "" {
		return nil, nil
	}

	session, err := discordgo.New("Bot " + config.Token)
	if err != nil {
		return nil, nil
	}

	bot := &Bot{
		session: session,
		logger:  logger.With(slog.String("component", "discord-bot")),
		config:  config,
	}

	// Register default handlers
	session.AddHandler(bot.onReady)
	session.AddHandler(bot.onGuildMemberAdd)

	return bot, nil
}

// Session returns the underlying discordgo session.
// Use this to add custom handlers or make API calls.
func (b *Bot) Session() *discordgo.Session {
	return b.session
}

func (b *Bot) ChronicleGuildID() string {
	return b.config.GuildID
}

// Open connects to Discord and starts the bot.
func (b *Bot) Open(ctx context.Context) error {
	// Set intents - adjust based on what your bot needs
	b.session.Identify.Intents = discordgo.IntentsGuilds |
		discordgo.IntentsGuildMembers |
		discordgo.IntentsGuildMessages |
		discordgo.IntentsDirectMessages

	if err := b.session.Open(); err != nil {
		return fmt.Errorf("open discord session: %w", err)
	}

	b.logger.Info("discord bot connected",
		slog.String("username", b.session.State.User.Username),
		slog.String("discriminator", b.session.State.User.Discriminator),
	)

	return nil
}

// Close gracefully shuts down the bot.
func (b *Bot) Close() error {
	b.mu.Lock()
	defer b.mu.Unlock()

	// Clean up any registered slash commands if needed
	for _, cleanup := range b.handlers {
		cleanup()
	}

	if b.session != nil {
		return b.session.Close()
	}
	return nil
}

// onReady is called when the bot successfully connects to Discord.
func (b *Bot) onReady(s *discordgo.Session, r *discordgo.Ready) {
	b.logger.Info("bot is ready",
		slog.String("user", r.User.Username),
		slog.Int("guilds", len(r.Guilds)),
	)
}

// onGuildMemberAdd is called when a new member joins a guild.
func (b *Bot) onGuildMemberAdd(s *discordgo.Session, m *discordgo.GuildMemberAdd) {
	b.logger.Debug("member joined guild",
		slog.String("guild_id", m.GuildID),
		slog.String("user_id", m.User.ID),
		slog.String("username", m.User.Username),
	)
}

// GetGuildMember fetches a member from a guild.
// Returns nil if the user is not a member of the guild.
func (b *Bot) GetGuildMember(guildID, userID string) (*discordgo.Member, error) {
	member, err := b.session.GuildMember(guildID, userID)
	if err != nil {
		if restErr, ok := err.(*discordgo.RESTError); ok {
			if restErr.Response.StatusCode == 404 {
				return nil, nil // Not a member
			}
		}
		return nil, fmt.Errorf("get guild member: %w", err)
	}
	return member, nil
}

// GetGuildMemberRoles fetches a member's roles in a guild.
// Returns the role IDs the member has.
func (b *Bot) GetGuildMemberRoles(guildID, userID string) ([]string, error) {
	member, err := b.GetGuildMember(guildID, userID)
	if err != nil {
		return nil, err
	}
	if member == nil {
		return nil, nil
	}
	return member.Roles, nil
}

// HasRole checks if a user has a specific role in a guild.
func (b *Bot) HasRole(guildID, userID, roleID string) (bool, error) {
	roles, err := b.GetGuildMemberRoles(guildID, userID)
	if err != nil {
		return false, err
	}
	for _, r := range roles {
		if r == roleID {
			return true, nil
		}
	}
	return false, nil
}

// HasAnyRole checks if a user has any of the specified roles in a guild.
func (b *Bot) HasAnyRole(guildID, userID string, roleIDs ...string) (bool, error) {
	roles, err := b.GetGuildMemberRoles(guildID, userID)
	if err != nil {
		return false, err
	}
	roleSet := make(map[string]struct{}, len(roleIDs))
	for _, id := range roleIDs {
		roleSet[id] = struct{}{}
	}
	for _, r := range roles {
		if _, ok := roleSet[r]; ok {
			return true, nil
		}
	}
	return false, nil
}

// GetGuildRoles fetches all roles in a guild.
// Useful for mapping role IDs to names.
func (b *Bot) GetGuildRoles(guildID string) ([]*discordgo.Role, error) {
	roles, err := b.session.GuildRoles(guildID)
	if err != nil {
		return nil, fmt.Errorf("get guild roles: %w", err)
	}
	return roles, nil
}
