// Package chroniclebot provides a Discord bot for Chronicle.
package chroniclebot

import (
	"context"
	"fmt"
	"log/slog"
	"sync"

	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/authz"
	"github.com/bwmarrin/discordgo"
)

// Config holds the configuration for the Discord bot.
type Config struct {
	// Token is the bot token from Discord Developer Portal.
	Token string
	// GuildID is your Discord server ID. If empty, commands are registered globally.
	GuildID string
	DB      database.Store
	Zed     *authz.Authz
}

// Bot represents a Discord bot instance.
type Bot struct {
	session *discordgo.Session
	logger  *slog.Logger
	config  Config

	mu       sync.RWMutex
	handlers []func()

	roles []*discordgo.Role
}

// New creates a new Discord bot instance.
// Call Open() to connect to Discord.
func New(ctx context.Context, logger *slog.Logger, config Config) (*Bot, error) {
	if config.Token == "" {
		return nil, fmt.Errorf("no token provided")
	}

	session, err := discordgo.New("Bot " + config.Token)
	if err != nil {
		return nil, err
	}

	bot := &Bot{
		session: session,
		logger:  logger.With(slog.String("component", "discord-bot")),
		config:  config,
	}

	// Register default handlers
	session.AddHandler(bot.onReady)
	session.AddHandler(bot.onGuildMemberAdd)
	session.AddHandler(bot.onGuildMemberUpdate)
	session.AddHandler(bot.onGuildMemberRemove)

	bot.roles, err = bot.GetGuildRoles(bot.ChronicleGuildID())
	if err != nil {
		return nil, fmt.Errorf("fetch guild roles: %w", err)
	}

	err = bot.Open(ctx)
	if err != nil {
		return nil, fmt.Errorf("open bot session: %w", err)
	}

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
		slog.Int("intents", int(s.Identify.Intents)),
		slog.String("chronicle_guild_id", b.ChronicleGuildID()),
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

// onGuildMemberUpdate is called when a member's roles, nickname, etc. change.
func (b *Bot) onGuildMemberUpdate(s *discordgo.Session, m *discordgo.GuildMemberUpdate) {
	b.logger.Info("onGuildMemberUpdate fired",
		slog.String("guild_id", m.GuildID),
		slog.String("user_id", m.User.ID),
		slog.String("chronicle_guild", b.ChronicleGuildID()),
	)

	// Only care about our guild
	if m.GuildID != b.ChronicleGuildID() {
		return
	}

	b.logger.Info("member updated",
		slog.String("guild_id", m.GuildID),
		slog.String("user_id", m.User.ID),
		slog.String("username", m.User.Username),
		slog.Any("roles", m.Roles),
	)

	// Look up the user by Discord ID
	link, err := b.config.DB.GetUserAuthByLinkedID(context.Background(), database.GetUserAuthByLinkedIDParams{
		LinkedID: m.User.ID,
		Provider: "discord",
	})
	if err != nil {
		b.logger.Debug("member update: user not found in db",
			slog.String("discord_id", m.User.ID),
		)
		return
	}

	// Sync their roles
	err = b.SyncDiscordUser(context.Background(), b.config.Zed, m.User.ID, link.UserID)
	if err != nil {
		b.logger.Error("failed to sync user roles",
			slog.String("user_id", link.UserID.String()),
			slog.Any("error", err),
		)
	}
}

// onGuildMemberRemove is called when a member leaves or is kicked from a guild.
func (b *Bot) onGuildMemberRemove(s *discordgo.Session, m *discordgo.GuildMemberRemove) {
	if m.GuildID != b.ChronicleGuildID() {
		return
	}

	b.logger.Debug("member left guild",
		slog.String("guild_id", m.GuildID),
		slog.String("user_id", m.User.ID),
		slog.String("username", m.User.Username),
	)

	// Look up the user by Discord ID
	link, err := b.config.DB.GetUserAuthByLinkedID(context.Background(), database.GetUserAuthByLinkedIDParams{
		LinkedID: m.User.ID,
		Provider: "discord",
	})
	if err != nil {
		return // User not in our system, nothing to do
	}

	// SyncDiscordUser will clear roles when member is nil (not in guild)
	err = b.SyncDiscordUser(context.Background(), b.config.Zed, m.User.ID, link.UserID)
	if err != nil {
		b.logger.Error("failed to revoke roles on member leave",
			slog.String("user_id", link.UserID.String()),
			slog.Any("error", err),
		)
	}
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

	if guildID == b.ChronicleGuildID() {
		b.mu.Lock()
		b.roles = roles
		b.mu.Unlock()
	}
	return roles, nil
}

func (b *Bot) Roles() []*discordgo.Role {
	b.mu.RLock()
	defer b.mu.RUnlock()
	return b.roles
}
