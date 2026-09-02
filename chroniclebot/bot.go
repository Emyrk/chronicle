// Package chroniclebot provides a Discord bot for Chronicle.
package chroniclebot

import (
	"context"
	"fmt"
	"log/slog"
	"strings"
	"sync"

	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/authz"
	"github.com/bwmarrin/discordgo"
	"github.com/riverqueue/river"
	"github.com/riverqueue/river/rivertype"
)

// Config holds the configuration for the Discord bot.
type Config struct {
	// Token is the bot token from Discord Developer Portal.
	Token string
	// GuildID is your Discord server ID. If empty, commands are registered globally.
	GuildID  string
	Disabled bool
	DB       database.Store
	Zed      *authz.Authz
}

// Bot represents a Discord bot instance.
type Bot struct {
	session *discordgo.Session
	logger  *slog.Logger
	config  Config

	mu       sync.RWMutex
	handlers []func()
	queue    JobInserter

	roles    []*discordgo.Role
	disabled bool
}

// New creates a new Discord bot instance.
// Call Open() to connect to Discord.
func New(ctx context.Context, logger *slog.Logger, config Config) (*Bot, error) {
	if config.Token == "" {
		logger.Info("discord bot is disabled, skipping initialization")
		return &Bot{
			logger:   logger.With(slog.String("component", "discord-bot")),
			config:   config,
			disabled: true,
		}, nil
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

	err = bot.Open(ctx)
	if err != nil {
		return nil, fmt.Errorf("open bot session: %w", err)
	}

	// Pre-populate the roles cache. This is best-effort — a transient Discord
	// API failure (rate-limit, CloudFlare HTML response, etc.) should not
	// prevent the server from starting.
	bot.roles, err = bot.GetGuildRoles(bot.ChronicleGuildID())
	if err != nil {
		bot.logger.Warn("initial guild role fetch failed, roles will be fetched on next call",
			slog.String("error", err.Error()),
		)
	}

	return bot, nil
}

// Available reports whether the Discord bot is configured and connected.
func (b *Bot) Available() bool {
	return b != nil && !b.disabled
}

func (b *Bot) Disabled() bool {
	return b.disabled
}

// Session returns the underlying discordgo session.
// Use this to add custom handlers or make API calls.
func (b *Bot) Session() *discordgo.Session {
	return b.session
}

func (b *Bot) ChronicleGuildID() string {
	return b.config.GuildID
}

// JobInserter is the interface for inserting River jobs.
// Satisfied by *riverqueue.Queues (via river.Client).
type JobInserter interface {
	Insert(ctx context.Context, args river.JobArgs, opts *river.InsertOpts) (*rivertype.JobInsertResult, error)
}

// SetQueue configures the River queue for async job processing.
func (b *Bot) SetQueue(queue JobInserter) {
	b.queue = queue
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

	var username, discriminator string
	if b.session.State != nil && b.session.State.User != nil {
		username = b.session.State.User.Username
		discriminator = b.session.State.User.Discriminator
	}

	b.logger.Info("discord bot connected",
		slog.String("username", username),
		slog.String("discriminator", discriminator),
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
	if m.GuildID != b.ChronicleGuildID() {
		return
	}
	b.enqueueSyncJob(m.User.ID, "add")
}

// onGuildMemberUpdate is called when a member's roles, nickname, etc. change.
func (b *Bot) onGuildMemberUpdate(s *discordgo.Session, m *discordgo.GuildMemberUpdate) {
	if m.GuildID != b.ChronicleGuildID() {
		return
	}

	// New role combinations get new unique strings
	b.enqueueSyncJob(m.User.ID, strings.Join(m.Roles, ",")+"update")
}

// onGuildMemberRemove is called when a member leaves or is kicked from a guild.
func (b *Bot) onGuildMemberRemove(s *discordgo.Session, m *discordgo.GuildMemberRemove) {
	if m.GuildID != b.ChronicleGuildID() {
		return
	}
	b.enqueueSyncJob(m.User.ID, "remove")
}

func (b *Bot) enqueueSyncJob(discordID, uniqueString string) {
	if b.disabled {
		b.logger.Info("bot is disabled, skipping sync job")
		return
	}
	if b.queue == nil {
		b.logger.Warn("no river queue configured, skipping sync job",
			slog.String("discord_id", discordID),
		)
		return
	}

	_, err := b.queue.Insert(context.Background(), ArgsSyncDiscordUser{
		DiscordID:    discordID,
		UniqueString: uniqueString,
	}, nil)
	if err != nil {
		b.logger.Error("failed to enqueue discord sync job",
			slog.String("discord_id", discordID),
			slog.String("error", err.Error()),
		)
	}
}

// VerifyGuild confirms that the connected bot can access a Discord guild.
func (b *Bot) VerifyGuild(guildID string) (*discordgo.Guild, error) {
	if !b.Available() || b.session == nil {
		return nil, fmt.Errorf("discord bot is unavailable")
	}
	guild, err := b.session.Guild(guildID)
	if err != nil {
		return nil, fmt.Errorf("fetch Discord guild %s: %w", guildID, err)
	}
	return guild, nil
}

// LeaveGuild removes the bot from a Discord guild.
func (b *Bot) LeaveGuild(guildID string) error {
	if !b.Available() || b.session == nil {
		return fmt.Errorf("discord bot is unavailable")
	}
	if err := b.session.GuildLeave(guildID); err != nil {
		return fmt.Errorf("leave Discord guild %s: %w", guildID, err)
	}
	return nil
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
