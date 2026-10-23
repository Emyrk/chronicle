package serviceapplication

import (
	"context"

	"github.com/Emyrk/chronicle/chronicle/riverqueue"
	"github.com/Emyrk/chronicle/chroniclebot"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/authz"
	"github.com/Emyrk/chronicle/internal/services"
	"github.com/Emyrk/chronicle/internal/services/serviceaccessurl"
	"github.com/Emyrk/chronicle/internal/services/serviceauthz"
	"github.com/Emyrk/chronicle/internal/services/servicebot"
	"github.com/Emyrk/chronicle/internal/services/servicecache"
	"github.com/Emyrk/chronicle/internal/services/servicedbstore"
	"github.com/Emyrk/chronicle/internal/services/serviceriver"
	"github.com/Emyrk/chronicle/internal/services/servicetenant"

	"github.com/coder/serpent"
)

var _ services.Servicer = (*Service)(nil)

// Application returns the service from the broker.
func Application(broker *services.Services) *Service {
	return services.MustGet[*Service](broker)
}

// OnApplication returns the service name for dependency declarations.
func OnApplication() string {
	return (&Service{}).Name()
}

// Service manages server application submissions and reviews.
type Service struct {
	broker *services.Services

	enabled               bool
	applicationsChannelID string
	DB                    database.Store
	Zed                   *authz.Authz
	Bot                   *chroniclebot.Bot
	Queue                 *riverqueue.Queues
	Cache                 *servicecache.Service
	accessURL             string
}

// Enabled returns whether the server applications feature is turned on.
func (s *Service) Enabled() bool {
	return s.enabled
}

// ApplicationsChannelID returns the Discord channel ID for application notifications.
func (s *Service) ApplicationsChannelID() string {
	return s.applicationsChannelID
}

func New(broker *services.Services) *Service {
	return &Service{broker: broker}
}

func (s *Service) Name() string         { return services.ServiceApplication }
func (s *Service) Configures() []string { return nil }

func (s *Service) DependsOn() []string {
	return []string{
		servicedbstore.OnDatabaseStore(),
		serviceauthz.OnAuthz(),
		servicebot.OnDiscordBot(),
		serviceriver.OnRiverQueue(),
		serviceaccessurl.OnAccessURL(),
		servicetenant.OnTenant(),
		servicecache.OnCache(),
	}
}

func (s *Service) Options() serpent.OptionSet {
	return serpent.OptionSet{
		{
			Name:        "Server Applications Enabled",
			Description: "Enable the server applications feature for self-service onboarding.",
			Required:    false,
			Flag:        "server-applications-enabled",
			Env:         "CHRONICLE_SERVER_APPLICATIONS_ENABLED",
			Default:     "false",
			Value:       serpent.BoolOf(&s.enabled),
		},
		{
			Name:        "Discord Applications Channel ID",
			Description: "Discord channel ID for server application notifications. If empty, notifications are skipped.",
			Required:    false,
			Flag:        "discord-applications-channel-id",
			Env:         "CHRONICLE_DISCORD_APPLICATIONS_CHANNEL_ID",
			Default:     "",
			Value:       serpent.StringOf(&s.applicationsChannelID),
		},
	}
}

func (s *Service) Start(_ context.Context) error {
	s.DB = servicedbstore.DatabaseStore(s.broker)
	s.Zed = serviceauthz.Authz(s.broker)
	s.Bot = servicebot.DiscordBot(s.broker)
	s.Queue = serviceriver.RiverQueue(s.broker)
	s.Cache = servicecache.CacheService(s.broker)
	s.accessURL = serviceaccessurl.AccessURL(s.broker)
	return nil
}

func (s *Service) mutateTenant(ctx context.Context, mutate func(*authz.AuthzTX) error) error {
	var published servicecache.PublishedGeneration
	if err := s.Zed.InTx(ctx, func(tx *authz.AuthzTX) error {
		if err := mutate(tx); err != nil {
			return err
		}
		var err error
		published, err = s.Cache.PublishTx(ctx, tx, servicecache.GlobalInvalidation(servicecache.NamespaceTenantSlugs))
		return err
	}, nil); err != nil {
		return err
	}
	s.Cache.ApplyPublishedBestEffort(published)
	return nil
}

func (s *Service) Close(_ context.Context) error { return nil }
