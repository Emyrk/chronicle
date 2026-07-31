package servicebot

import (
	"context"
	"fmt"

	"github.com/Emyrk/chronicle/chroniclebot"
	"github.com/Emyrk/chronicle/internal/services"
	"github.com/Emyrk/chronicle/internal/services/serviceauthz"
	"github.com/Emyrk/chronicle/internal/services/servicedbstore"
	"github.com/Emyrk/chronicle/internal/services/servicelogger"

	"github.com/coder/serpent"
)

var _ services.Servicer = (*Service)(nil)

func DiscordBot(broker *services.Services) *chroniclebot.Bot {
	srv := services.MustGet[*Service](broker)
	return srv.bot
}

func OnDiscordBot() string {
	return (&Service{}).Name()
}

type Service struct {
	broker *services.Services
	cfg    chroniclebot.Config

	bot *chroniclebot.Bot
}

func New(broker *services.Services) *Service {
	return &Service{
		broker: broker,
	}
}

func (s *Service) Name() string {
	return services.ServiceDiscordBot
}

func (s *Service) Configures() []string { return []string{} }
func (s *Service) DependsOn() []string {
	return []string{
		servicelogger.OnLogger(),
		servicedbstore.OnDatabaseStore(),
		serviceauthz.OnAuthz(),
	}
}

func (s *Service) Start(ctx context.Context) error {
	logger := servicelogger.Logger(s.broker)
	db := servicedbstore.DatabaseStore(s.broker)
	zed := serviceauthz.Authz(s.broker)

	bot, err := chroniclebot.New(ctx, logger, chroniclebot.Config{
		Token:                        s.cfg.Token,
		GuildID:                      s.cfg.GuildID,
		Disabled:                     s.cfg.Disabled,
		MembershipGrantChecksPerHour: s.cfg.MembershipGrantChecksPerHour,
		DB:                           db,
		Zed:                          zed,
	})
	if err != nil {
		return fmt.Errorf("create chronicle bot: %w", err)
	}
	s.bot = bot

	// Do not do anything else
	if bot.Disabled() {
		return nil
	}

	if err := bot.RegisterCommands(chroniclebot.DefaultCommands(bot)); err != nil {
		return fmt.Errorf("register discord commands: %w", err)
	}

	return nil
}

func (s *Service) Close(_ context.Context) error {
	return s.bot.Close()
}

func (s *Service) Options() serpent.OptionSet {
	return serpent.OptionSet{
		{
			Name:        "Disable Discord bot",
			Description: "Disable the Discord bot and bot-dependent background jobs.",
			Required:    false,
			Flag:        "disable-discord-bot",
			Env:         "CHRONICLE_DISCORD_BOT_DISABLE",
			Default:     "false",
			Value:       serpent.BoolOf(&s.cfg.Disabled),
		},
		{
			Name:        "Discord bot token",
			Description: "Address to serve the api on.",
			Required:    false,
			Flag:        "discord-token",
			Env:         "CHRONICLE_DISCORD_BOT_TOKEN",
			Default:     "",
			Value:       serpent.StringOf(&s.cfg.Token),
		},
		{
			Name:        "Discord membership checks per hour",
			Description: "Maximum number of scheduled Discord membership grant checks claimed per hour.",
			Required:    false,
			Flag:        "discord-membership-checks-per-hour",
			Env:         "CHRONICLE_DISCORD_MEMBERSHIP_CHECKS_PER_HOUR",
			Default:     "100",
			Value:       serpent.Int64Of(&s.cfg.MembershipGrantChecksPerHour),
		},
		{
			Name:        "Discord Chronicle GuildID",
			Description: "Address to serve the api on.",
			Required:    false,
			Flag:        "discord-guild-id",
			Env:         "CHRONICLE_DISCORD_GUILD_ID",
			Default:     "1466099237669306380",
			Value:       serpent.StringOf(&s.cfg.GuildID),
		},
	}
}
