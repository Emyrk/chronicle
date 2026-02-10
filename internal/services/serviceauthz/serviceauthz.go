package serviceauthz

import (
	"context"
	"fmt"

	"github.com/Emyrk/chronicle/database/authz"
	"github.com/Emyrk/chronicle/internal/services"
	"github.com/Emyrk/chronicle/internal/services/servicedbstore"
	"github.com/Emyrk/chronicle/internal/services/servicelogger"

	"github.com/coder/serpent"
)

var _ services.Servicer = (*Service)(nil)

func Authz(broker *services.Services) *authz.Authz {
	srv := services.MustGet[*Service](broker)
	return srv.z
}

func OnAuthz() string {
	return (&Service{}).Name()
}

type Service struct {
	broker *services.Services

	grpcURL      string
	presharedKey string

	z *authz.Authz
}

func New(broker *services.Services) *Service {
	return &Service{
		broker: broker,
	}
}

func (s *Service) Name() string {
	return services.ServiceAuthz
}

func (s *Service) Configures() []string { return []string{} }
func (s *Service) DependsOn() []string {
	return []string{
		servicelogger.OnLogger(),
		servicedbstore.OnDatabaseStore(),
	}
}

func (s *Service) Start(ctx context.Context) error {
	logger := servicelogger.Logger(s.broker)
	db := servicedbstore.DatabaseStore(s.broker)

	z, err := authz.New(ctx, authz.Options{
		GRPCURL:      s.grpcURL,
		PreSharedKey: s.presharedKey,
		Logger:       logger,
		DB:           db,
	})
	if err != nil {
		return fmt.Errorf("init authz: %w", err)
	}
	s.z = z

	return nil
}

func (s *Service) Close(_ context.Context) error {
	return s.z.Close()
}

func (s *Service) Options() serpent.OptionSet {
	return serpent.OptionSet{
		{
			Name:        "SpiceDB GRPC URL",
			Description: "SpceDB GRPC URL, e.g. localhost:50051",
			Required:    false,
			Flag:        "spicedb-grpc-url",
			Env:         "CHRONICLE_SPICEDB_GRPC_URL",
			Default:     "localhost:50051",
			Value:       serpent.StringOf(&s.grpcURL),
		},
		{
			Name:        "SpiceDB Preshared Key",
			Description: "Shared key for authenticating with SpiceDB.",
			Required:    false,
			Flag:        "spicedb-preshared-key",
			Env:         "CHRONICLE_SPICEDB_PRESHARED_KEY",
			Default:     "chronicle-dev-key",
			Value:       serpent.StringOf(&s.presharedKey),
		},
	}
}
