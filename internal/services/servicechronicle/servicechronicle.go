package servicechronicle

import (
	"context"
	"fmt"
	"strings"

	"github.com/Emyrk/chronicle/chronicle"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/storage"
	"github.com/Emyrk/chronicle/internal/services"
	"github.com/Emyrk/chronicle/internal/services/serviceauthz"
	"github.com/Emyrk/chronicle/internal/services/servicedataset"
	"github.com/Emyrk/chronicle/internal/services/servicelogger"
	"github.com/Emyrk/chronicle/internal/services/servicepgxpool"
	"github.com/Emyrk/chronicle/internal/services/serviceprometheus"
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

func EventStreamPublicURL(broker *services.Services) string {
	return strings.TrimRight(services.MustGet[*Service](broker).eventStreamPublicURL, "/")
}

func OnChronicle() string {
	return (&Service{}).Name()
}

type Service struct {
	broker *services.Services

	chronicle               *chronicle.Chronicle
	emitParseLogs           bool
	eventStorage            string
	eventStreamPublicURL    string
	eventStreamRegion       string
	eventStreamEndpoint     string
	eventStreamAccessKey    string
	eventStreamSecretKey    string
	eventStreamBucket       string
	eventStreamUsePathStyle bool
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
		serviceprometheus.OnPrometheus(),
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

	backend := database.LogEventStorage(s.eventStorage)
	if backend != database.LogEventStorageDatabase && backend != database.LogEventStorageR2 {
		return fmt.Errorf("unknown event storage %q (valid: database, r2)", s.eventStorage)
	}
	if backend == database.LogEventStorageR2 && s.eventStreamPublicURL == "" {
		return fmt.Errorf("CHRONICLE_EVENT_STREAM_PUBLIC_URL is required when CHRONICLE_EVENT_STORAGE=r2")
	}
	if backend == database.LogEventStorageR2 && s.eventStreamBucket == "" {
		return fmt.Errorf("CHRONICLE_EVENT_STREAM_BUCKET is required when CHRONICLE_EVENT_STORAGE=r2")
	}

	var eventObjects storage.ObjectStorage
	if s.eventStreamBucket != "" {
		var err error
		eventObjects, err = storage.NewS3Storage(ctx, storage.S3Options{
			Region:          s.eventStreamRegion,
			Endpoint:        s.eventStreamEndpoint,
			AccessKeyID:     s.eventStreamAccessKey,
			SecretAccessKey: s.eventStreamSecretKey,
			UsePathStyle:    s.eventStreamUsePathStyle,
			Bucket:          s.eventStreamBucket,
		})
		if err != nil {
			return fmt.Errorf("provision event stream storage: %w", err)
		}
	}
	eventStreams, err := chronicle.NewEventStreamStore(backend, eventObjects, logger)
	if err != nil {
		return err
	}

	c, err := chronicle.New(ctx, logger, chronicle.Options{
		Storage:         st,
		EventStreams:    eventStreams,
		Zed:             zed,
		Ps:              ps,
		WoWDB:           wowDB.GameDB(),
		Registry:        serviceprometheus.Registry(s.broker),
		EmitParsingLogs: s.emitParseLogs,
		PrimaryDomain:   tenantSvc.PrimaryDomain(),
		// Stamp the build-tag flavor on new log groups.
		DefaultFlavor:    BuildTagFlavor(),
		DefaultDatasetID: servicedataset.DefaultDatasetID,
		ResolveDataset: func(ctx context.Context, realmID uuid.UUID) chronicle.ResolvedDataset {
			dsID, flavor, additionalFlavor := datasetSvc.ResolveDatasetWithFlavorForRealm(ctx, realmID)
			return chronicle.ResolvedDataset{
				DatasetID:        dsID,
				Flavor:           flavor,
				AdditionalFlavor: additionalFlavor,
			}
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
			Name:        "Event Storage",
			Description: "Event stream storage backend: database or r2.",
			Flag:        "event-storage",
			Env:         "CHRONICLE_EVENT_STORAGE",
			Default:     "database",
			Value:       serpent.StringOf(&s.eventStorage),
		},
		{
			Name:        "Event Stream Public URL",
			Description: "Public base URL used for externally stored event streams.",
			Flag:        "event-stream-public-url",
			Env:         "CHRONICLE_EVENT_STREAM_PUBLIC_URL",
			Value:       serpent.StringOf(&s.eventStreamPublicURL),
		},
		{
			Name: "Event Stream Region", Flag: "event-stream-region", Env: "CHRONICLE_EVENT_STREAM_REGION",
			Value: serpent.StringOf(&s.eventStreamRegion),
		},
		{
			Name: "Event Stream Endpoint", Flag: "event-stream-endpoint", Env: "CHRONICLE_EVENT_STREAM_ENDPOINT",
			Value: serpent.StringOf(&s.eventStreamEndpoint),
		},
		{
			Name: "Event Stream Access Key", Flag: "event-stream-access-key", Env: "CHRONICLE_EVENT_STREAM_ACCESS_KEY",
			Value: serpent.StringOf(&s.eventStreamAccessKey),
		},
		{
			Name: "Event Stream Secret Key", Flag: "event-stream-secret-key", Env: "CHRONICLE_EVENT_STREAM_SECRET_KEY",
			Value: serpent.StringOf(&s.eventStreamSecretKey),
		},
		{
			Name: "Event Stream Bucket", Flag: "event-stream-bucket", Env: "CHRONICLE_EVENT_STREAM_BUCKET",
			Value: serpent.StringOf(&s.eventStreamBucket),
		},
		{
			Name: "Event Stream Path Style", Flag: "event-stream-path-style", Env: "CHRONICLE_EVENT_STREAM_PATH_STYLE",
			Default: "false", Value: serpent.BoolOf(&s.eventStreamUsePathStyle),
		},
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
