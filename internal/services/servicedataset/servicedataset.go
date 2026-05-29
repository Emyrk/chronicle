package servicedataset

import (
	"context"

	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/internal/services"
	"github.com/Emyrk/chronicle/internal/services/servicedbstore"
	"github.com/Emyrk/chronicle/internal/services/servicelogger"

	"github.com/coder/serpent"
	"github.com/google/uuid"
)

// DatasetStore is the narrow query interface for dataset CRUD.
// database.Store satisfies this implicitly.
type DatasetStore interface {
	GetDataset(ctx context.Context, id uuid.UUID) (database.Dataset, error)
	GetDatasetBySlug(ctx context.Context, slug string) (database.Dataset, error)
	ListDatasets(ctx context.Context) ([]database.Dataset, error)
	InsertDataset(ctx context.Context, arg database.InsertDatasetParams) (database.Dataset, error)
	UpdateDataset(ctx context.Context, arg database.UpdateDatasetParams) (database.Dataset, error)
	DeleteDataset(ctx context.Context, id uuid.UUID) error
}

var _ services.Servicer = (*Service)(nil)

func Dataset(broker *services.Services) *Service {
	return services.MustGet[*Service](broker)
}

func OnDataset() string {
	return (&Service{}).Name()
}

type Service struct {
	broker *services.Services

	db DatasetStore
}

func New(broker *services.Services) *Service {
	return &Service{
		broker: broker,
	}
}

func (s *Service) Name() string         { return services.ServiceDataset }
func (s *Service) Configures() []string { return nil }
func (s *Service) DependsOn() []string {
	return []string{
		servicelogger.OnLogger(),
		servicedbstore.OnDatabaseStore(),
	}
}

func (s *Service) Start(_ context.Context) error {
	s.db = servicedbstore.DatabaseStore(s.broker)
	return nil
}

func (s *Service) Close(_ context.Context) error {
	return nil
}

func (s *Service) Options() serpent.OptionSet {
	return serpent.OptionSet{}
}
