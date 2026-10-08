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
	GuildID       string
	Disabled      bool
	DB            database.Store
	Zed           *authz.Authz
	AccessURL     string
	PrimaryDomain string
}

type gatewaySession interface {
	Open() error
	Close() error
}

// Bot represents a Discord bot instance.
type Bot struct {
	session         *discordgo.Session
	gateway         gatewaySession
	httpDiagnostics *discordHTTPDiagnostics
	logger          *slog.Logger
	config          Config

	mu                sync.RWMutex
	gatewayMu         sync.Mutex
	commandMu         sync.Mutex
	handlers          []func()
	handlersInstalled bool
	commandHandlers   map[string]func(*discordgo.Session, *discordgo.InteractionCreate)
	gatewayRunning    bool
	queue             JobInserter

	roles    []*discordgo.Role
	disabled bool
}

// New constructs a Discord bot without opening its gateway connection.
func New(_ context.Context, logger *slog.Logger, config Config) (*Bot, error) {
	if config.Disabled || config.Token == "" {
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

	httpDiagnostics := newDiscordHTTPDiagnostics(session.Client.Transport, config.Token)
	session.Client.Transport = httpDiagnostics
	bot := &Bot{
		session:         session,
		gateway:         session,
		httpDiagnostics: httpDiagnostics,
		logger:          logger.With(slog.String("component", "discord-bot")),
		config:          config,
		commandHandlers: make(map[string]func(*discordgo.Session, *discordgo.InteractionCreate)),
	}
	bot.installHandlers()
	return bot, nil
}

// Available reports whether the Discord bot is configured for REST operations.
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

func (b *Bot) installHandlers() {
	b.mu.Lock()
	defer b.mu.Unlock()
	if b.handlersInstalled || b.session == nil {
		return
	}
	if b.commandHandlers == nil {
		b.commandHandlers = make(map[string]func(*discordgo.Session, *discordgo.InteractionCreate))
	}
	b.handlers = append(b.handlers,
		b.session.AddHandler(b.onReady),
		b.session.AddHandler(b.onGuildMemberAdd),
		b.session.AddHandler(b.onGuildMemberUpdate),
		b.session.AddHandler(b.onGuildMemberRemove),
		b.session.AddHandler(func(s *discordgo.Session, i *discordgo.InteractionCreate) {
			if i.Type != discordgo.InteractionApplicationCommand {
				return
			}
			b.mu.RLock()
			handler := b.commandHandlers[i.ApplicationCommandData().Name]
			b.mu.RUnlock()
			if handler != nil {
				handler(s, i)
			}
		}),
	)
	b.handlersInstalled = true
}

// StartGateway connects the configured bot to Discord. Repeated calls are safe.
func (b *Bot) StartGateway(ctx context.Context) error {
	if b == nil || b.disabled {
		return nil
	}
	if err := ctx.Err(); err != nil {
		return err
	}

	b.gatewayMu.Lock()
	if b.GatewayRunning() {
		b.gatewayMu.Unlock()
		return nil
	}

	b.session.Identify.Intents = discordgo.IntentsGuilds |
		discordgo.IntentsGuildMembers |
		discordgo.IntentsGuildMessages |
		discordgo.IntentsDirectMessages
	b.httpDiagnostics.reset()
	if err := b.gateway.Open(); err != nil {
		b.gatewayMu.Unlock()
		return fmt.Errorf("open discord session: %w", b.httpDiagnostics.annotate(err))
	}
	b.mu.Lock()
	b.gatewayRunning = true
	b.mu.Unlock()
	b.gatewayMu.Unlock()

	var username, discriminator string
	if b.session.State != nil && b.session.State.User != nil {
		username = b.session.State.User.Username
		discriminator = b.session.State.User.Discriminator
	}
	b.logger.Info("discord bot connected",
		slog.String("username", username),
		slog.String("discriminator", discriminator),
	)

	// Pre-populate the roles cache after each successful connection. This is
	// best-effort because a transient Discord failure should not surrender an
	// otherwise healthy gateway connection.
	if b.ChronicleGuildID() != "" {
		if _, err := b.GetGuildRoles(b.ChronicleGuildID()); err != nil {
			b.logger.Warn("initial guild role fetch failed, roles will be fetched on next call",
				slog.String("error", err.Error()))
		}
	}
	return nil
}

// StopGateway disconnects the bot from Discord. Repeated calls are safe.
func (b *Bot) StopGateway() error {
	if b == nil || b.disabled {
		return nil
	}

	b.gatewayMu.Lock()
	defer b.gatewayMu.Unlock()
	if !b.GatewayRunning() {
		return nil
	}
	if err := b.gateway.Close(); err != nil {
		return err
	}
	b.mu.Lock()
	b.gatewayRunning = false
	b.mu.Unlock()
	return nil
}

func (b *Bot) GatewayRunning() bool {
	if b == nil {
		return false
	}
	b.mu.RLock()
	defer b.mu.RUnlock()
	return b.gatewayRunning
}

// Close permanently shuts down the bot and unregisters local event handlers.
func (b *Bot) Close() error {
	if b == nil {
		return nil
	}
	stopErr := b.StopGateway()

	b.mu.Lock()
	handlers := b.handlers
	b.handlers = nil
	b.handlersInstalled = false
	b.mu.Unlock()
	for _, cleanup := range handlers {
		cleanup()
	}
	return stopErr
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

type DiscordChannelEligibility struct {
	Channel *discordgo.Channel
	Reasons []string
}

var discordAnnouncementPermissions = []struct {
	permission int64
	label      string
}{
	{permission: discordgo.PermissionViewChannel, label: "View Channel"},
	{permission: discordgo.PermissionSendMessages, label: "Send Messages"},
	{permission: discordgo.PermissionEmbedLinks, label: "Embed Links"},
}

func missingDiscordAnnouncementPermissions(permissions int64) []string {
	missing := make([]string, 0, len(discordAnnouncementPermissions))
	for _, required := range discordAnnouncementPermissions {
		if permissions&required.permission == 0 {
			missing = append(missing, "Missing "+required.label+" permission")
		}
	}
	return missing
}

func hasDiscordAnnouncementPermissions(permissions int64) bool {
	return len(missingDiscordAnnouncementPermissions(permissions)) == 0
}

func discordAnnouncementChannelTypeReason(channelType discordgo.ChannelType) (string, bool) {
	switch channelType {
	case discordgo.ChannelTypeGuildText:
		return "", true
	case discordgo.ChannelTypeGuildNews:
		return "Announcement channels are not supported", true
	case discordgo.ChannelTypeGuildForum:
		return "Forum channels are not supported", true
	default:
		return "", false
	}
}

// TextChannelEligibility returns text-like channels and explains why each channel can or cannot be used for announcements.
func (b *Bot) TextChannelEligibility(guildID string) ([]DiscordChannelEligibility, error) {
	if !b.Available() || b.session == nil || b.session.State == nil || b.session.State.User == nil {
		return nil, fmt.Errorf("discord bot is unavailable")
	}
	channels, err := b.session.GuildChannels(guildID)
	if err != nil {
		return nil, fmt.Errorf("get Discord guild channels: %w", err)
	}
	eligibility := make([]DiscordChannelEligibility, 0, len(channels))
	for _, channel := range channels {
		typeReason, include := discordAnnouncementChannelTypeReason(channel.Type)
		if !include {
			continue
		}
		result := DiscordChannelEligibility{Channel: channel}
		if typeReason != "" {
			result.Reasons = []string{typeReason}
			eligibility = append(eligibility, result)
			continue
		}
		permissions, err := b.session.UserChannelPermissions(b.session.State.User.ID, channel.ID)
		if err != nil {
			return nil, fmt.Errorf("get Discord channel %s permissions: %w", channel.ID, err)
		}
		result.Reasons = missingDiscordAnnouncementPermissions(permissions)
		eligibility = append(eligibility, result)
	}
	return eligibility, nil
}

// WritableTextChannels returns text channels where the bot can send announcements.
func (b *Bot) WritableTextChannels(guildID string) ([]*discordgo.Channel, error) {
	eligibility, err := b.TextChannelEligibility(guildID)
	if err != nil {
		return nil, err
	}
	writable := make([]*discordgo.Channel, 0, len(eligibility))
	for _, channel := range eligibility {
		if len(channel.Reasons) == 0 {
			writable = append(writable, channel.Channel)
		}
	}
	return writable, nil
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
