package servicechronicle

import (
	"context"

	"github.com/Emyrk/chronicle/chronicle"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/internal/services"
	"github.com/Emyrk/chronicle/internal/services/serviceauthz"
	"github.com/Emyrk/chronicle/internal/services/servicedataset"
	"github.com/Emyrk/chronicle/internal/services/servicelogger"
	"github.com/Emyrk/chronicle/internal/services/servicepgxpool"
	"github.com/Emyrk/chronicle/internal/services/servicestorage"
	"github.com/Emyrk/chronicle/internal/services/servicetenant"
	"github.com/Emyrk/chronicle/internal/services/servicewowdb"
	"github.com/google/uuid"

	"github.com/Gophercraft/core/vsn"
	"github.com/coder/serpent"
)

var _ services.Servicer = (*Service)(nil)

func Chronicle(broker *services.Services) *chronicle.Chronicle {
	srv := services.MustGet[*Service](broker)
	return srv.chronicle
}

func OnChronicle() string {
	return (&Service{}).Name()
}

type Service struct {
	broker *services.Services

	chronicle     *chronicle.Chronicle
	emitParseLogs bool
}

func New(broker *services.Services) *Service {
	return &Service{
		broker: broker,
	}
}

func (s *Service) Name() string {
	return services.ServiceChronicle
}

func (s *Service) DependsOn() []string {
	return []string{
		servicelogger.OnLogger(),
		serviceauthz.OnAuthz(),
		servicestorage.OnStorage(),
		servicewowdb.OnWoWDB(),
		servicetenant.OnTenant(),
		servicedataset.OnDataset(),
	}
}

// BuildTagFlavor resolves the default flavor for this binary from its build
// tags (services.ServerName / ServerBuild). It is the bootstrap source of
// flavor until per-tenant runtime config exists, used to stamp new log
// groups whose flavor can't be resolved from a dataset.
func BuildTagFlavor() database.WoWFlavor {
	base := database.FlavorVanilla
	if services.ServerBuild == vsn.V3_3_5a {
		base = database.FlavorWrath
	}
	return database.ServerFlavor(services.ServerName, base)
}

func (s *Service) Start(ctx context.Context) error {
	logger := servicelogger.Logger(s.broker)
	st := servicestorage.Storage(s.broker)
	zed := serviceauthz.Authz(s.broker)
	wowDB := servicewowdb.WoWDB(s.broker)
	ps := servicepgxpool.Pubsub(s.broker)

	tenantSvc := servicetenant.Tenant(s.broker)
	datasetSvc := servicedataset.Dataset(s.broker)

	c, err := chronicle.New(ctx, logger, chronicle.Options{
		Storage:         st,
		Zed:             zed,
		Ps:              ps,
		WoWDB:           wowDB.GameDB(),
		EmitParsingLogs: s.emitParseLogs,
		PrimaryDomain:   tenantSvc.PrimaryDomain(),
		// Stamp the build-tag flavor on new log groups.
		DefaultFlavor:    BuildTagFlavor(),
		DefaultDatasetID: servicedataset.DefaultDatasetID,
		ResolveDataset: func(ctx context.Context, realmID uuid.UUID) chronicle.ResolvedDataset {
			dsID, flavor := datasetSvc.ResolveDatasetWithFlavorForRealm(ctx, realmID)
			return chronicle.ResolvedDataset{DatasetID: dsID, Flavor: flavor}
		},
	})
	if err != nil {
		return err
	}
	s.chronicle = c

	return nil
}

func (s *Service) Close(_ context.Context) error {
	return nil
}

func (s *Service) Options() serpent.OptionSet {
	return serpent.OptionSet{
		{
			Name:        "Emit logs during processing",
			Description: "Emit logs during processing wow log files.",
			Required:    false,
			Flag:        "emit-parse-logs",
			Env:         "CHRONICLE_EMIT_PARSE_LOGS",
			Default:     "false",
			Value:       serpent.BoolOf(&s.emitParseLogs),
		},
	}
}

func (s *Service) Configures() []string {
	return []string{}
}
