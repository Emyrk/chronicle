package servicebot

import (
	"context"
	"errors"
	"fmt"

	"github.com/Emyrk/chronicle/chroniclebot"
	"github.com/Emyrk/chronicle/internal/leaderelection"
	"github.com/Emyrk/chronicle/internal/services"
	"github.com/Emyrk/chronicle/internal/services/serviceaccessurl"
	"github.com/Emyrk/chronicle/internal/services/serviceauthz"
	"github.com/Emyrk/chronicle/internal/services/servicedbstore"
	"github.com/Emyrk/chronicle/internal/services/servicelogger"
	"github.com/Emyrk/chronicle/internal/services/servicepgxpool"
	"github.com/Emyrk/chronicle/internal/services/serviceprometheus"
	"github.com/Emyrk/chronicle/internal/services/servicetenant"

	"github.com/coder/serpent"
)

var _ services.Servicer = (*Service)(nil)

const discordGatewayLockKey int64 = 0x4348524f4e444953 // "CHRONDIS"

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

	bot     *chroniclebot.Bot
	elector *leaderelection.Elector
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
		serviceaccessurl.OnAccessURL(),
		servicedbstore.OnDatabaseStore(),
		servicepgxpool.OnPGXPool(),
		serviceprometheus.OnPrometheus(),
		serviceauthz.OnAuthz(),
		servicetenant.OnTenant(),
	}
}

func (s *Service) Start(ctx context.Context) error {
	logger := servicelogger.Logger(s.broker)
	db := servicedbstore.DatabaseStore(s.broker)
	zed := serviceauthz.Authz(s.broker)
	tenant := servicetenant.Tenant(s.broker)

	bot, err := chroniclebot.New(ctx, logger, chroniclebot.Config{
		Token:         s.cfg.Token,
		GuildID:       s.cfg.GuildID,
		Disabled:      s.cfg.Disabled,
		DB:            db,
		Zed:           zed,
		AccessURL:     serviceaccessurl.AccessURL(s.broker),
		PrimaryDomain: tenant.PrimaryDomain(),
	})
	if err != nil {
		return fmt.Errorf("create chronicle bot: %w", err)
	}
	s.bot = bot

	// Do not do anything else
	if bot.Disabled() {
		return nil
	}

	elector, err := leaderelection.New(leaderelection.Options{
		Name:       "discord_gateway",
		LockKey:    discordGatewayLockKey,
		Pool:       servicepgxpool.PGXPool(s.broker),
		Logger:     logger,
		Registerer: serviceprometheus.Registry(s.broker),
	}, leaderelection.Callbacks{
		Start: func(ctx context.Context) error {
			if err := bot.StartGateway(ctx); err != nil {
				return fmt.Errorf("start discord gateway: %w", err)
			}
			if err := bot.RegisterCommands(chroniclebot.DefaultCommands(bot)); err != nil {
				return errors.Join(fmt.Errorf("register discord commands: %w", err), bot.StopGateway())
			}
			return nil
		},
		Stop: func(context.Context) error {
			return bot.StopGateway()
		},
	})
	if err != nil {
		return fmt.Errorf("create discord gateway leader election: %w", err)
	}
	s.elector = elector
	if err := elector.Start(ctx); err != nil {
		return fmt.Errorf("start discord gateway leader election: %w", err)
	}
	return nil
}

func (s *Service) Close(ctx context.Context) error {
	var electionErr error
	if s.elector != nil {
		electionErr = s.elector.Close(ctx)
	}
	if s.bot == nil {
		return electionErr
	}
	return errors.Join(electionErr, s.bot.Close())
}

func (s *Service) Options() serpent.OptionSet {
	return serpent.OptionSet{
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
