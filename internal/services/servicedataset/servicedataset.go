package servicedataset

import (
	"context"
	"fmt"
	"log/slog"

	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/internal/services"
	"github.com/Emyrk/chronicle/internal/services/servicedbstore"
	"github.com/Emyrk/chronicle/internal/services/servicelogger"
	"github.com/Emyrk/chronicle/internal/services/servicetenant"
	"github.com/Gophercraft/core/vsn"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/coder/serpent"
	"github.com/google/uuid"
)

// DefaultDatasetID is the well-known UUID for the default dataset.
// Inserted by migration 000121 and referenced by all existing world_*/dbc_* rows.
var DefaultDatasetID = uuid.MustParse("00000000-0000-0000-0000-000000000001")

// DatasetStore is the narrow query interface for dataset CRUD.
// database.Store satisfies this implicitly.
type DatasetStore interface {
	GetDataset(ctx context.Context, id uuid.UUID) (database.Dataset, error)
	GetDatasetBySlug(ctx context.Context, slug string) (database.Dataset, error)
	ListDatasets(ctx context.Context) ([]database.Dataset, error)
	InsertDataset(ctx context.Context, arg database.InsertDatasetParams) (database.Dataset, error)
	UpdateDataset(ctx context.Context, arg database.UpdateDatasetParams) (database.Dataset, error)
	DeleteDataset(ctx context.Context, id uuid.UUID) error
	ListTenantsByDataset(ctx context.Context, datasetID uuid.NullUUID) ([]database.ListTenantsByDatasetRow, error)
	ResolveDatasetByRealm(ctx context.Context, id uuid.UUID) (uuid.NullUUID, error)
	ResolveDatasetWithFlavorByRealm(ctx context.Context, id uuid.UUID) (database.ResolveDatasetWithFlavorByRealmRow, error)
	GetDatasetImportSummary(ctx context.Context, datasetID uuid.UUID) (database.GetDatasetImportSummaryRow, error)
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

func (s *Service) Start(ctx context.Context) error {
	s.db = servicedbstore.DatabaseStore(s.broker)

	if err := s.ensureDefaultDataset(ctx); err != nil {
		return fmt.Errorf("ensure default dataset: %w", err)
	}
	return nil
}

// ResolveDatasetForRealm returns the dataset ID that applies to a realm,
// using the precedence server.default_dataset_id > tenant.default_dataset_id >
// the compiled-in default. Used by instance/armory endpoints so talent (and
// future game) data is served for the dataset that the viewed data belongs to,
// regardless of which tenant domain the request came in on.
// GetDataset returns a dataset by ID. Used by API handlers that need to look
// up dataset fields (e.g. icon_base_url) after resolving the dataset ID.
func (s *Service) GetDataset(ctx context.Context, id uuid.UUID) (database.Dataset, error) {
	ctx = servicetenant.AdminBypass(ctx)
	return s.db.GetDataset(ctx, id)
}

func (s *Service) ResolveDatasetForRealm(ctx context.Context, realmID uuid.UUID) uuid.UUID {
	ctx = servicetenant.AdminBypass(ctx)
	resolved, err := s.db.ResolveDatasetByRealm(ctx, realmID)
	if err != nil || !resolved.Valid {
		return DefaultDatasetID
	}
	return resolved.UUID
}

// ResolveDatasetWithFlavorForRealm resolves the dataset, its default flavor,
// and the tenant's additive flavor tags for a realm. Falls back to the default
// dataset (querying its flavor from the DB) on any error.
func (s *Service) ResolveDatasetWithFlavorForRealm(ctx context.Context, realmID uuid.UUID) (uuid.UUID, database.WoWFlavor, database.WoWFlavor) {
	ctx = servicetenant.AdminBypass(ctx)
	row, err := s.db.ResolveDatasetWithFlavorByRealm(ctx, realmID)
	if err != nil {
		// The realm-based resolution failed (unknown realm, no
		// default_dataset_id on server/tenant, etc.). Query the default
		// dataset directly for its flavor.
		ds, dsErr := s.db.GetDataset(ctx, DefaultDatasetID)
		if dsErr != nil {
			return DefaultDatasetID, nil, nil
		}
		return DefaultDatasetID, database.FlavorFromStrings(ds.DefaultFlavor), nil
	}
	return row.DatasetID,
		database.FlavorFromStrings(row.DefaultFlavor),
		database.FlavorFromStrings(row.AdditionalFlavor)
}

func (s *Service) Close(_ context.Context) error {
	return nil
}

func (s *Service) Options() serpent.OptionSet {
	return serpent.OptionSet{}
}

// ensureDefaultDataset upserts the wow_version, build_version, and
// default_flavor on the default dataset row (inserted by migration 000121)
// using the bundled AzerothCore fallback identity.
func (s *Service) ensureDefaultDataset(ctx context.Context) error {
	ctx = servicetenant.AdminBypass(ctx)
	logger := servicelogger.Logger(s.broker)

	wowVersion := wowVersionFromBuild(services.ServerBuild)
	buildVersion := int32(services.ServerBuild)

	// Derive flavor from the compiled-in server identity.
	baseFlavor := database.FlavorVanilla
	if services.ServerBuild == vsn.V3_3_5a {
		baseFlavor = database.FlavorWrath
	}
	flavor := database.ServerFlavor(services.ServerName, baseFlavor)

	_, err := s.db.UpdateDataset(ctx, database.UpdateDatasetParams{
		ID:            DefaultDatasetID,
		WowVersion:    pgtype.Text{String: wowVersion, Valid: true},
		BuildVersion:  pgtype.Int4{Int32: buildVersion, Valid: true},
		DefaultFlavor: flavor.Strings(),
	})
	if err != nil {
		return fmt.Errorf("update default dataset build info: %w", err)
	}

	logger.Info("default dataset ensured",
		slog.String("server", services.ServerName),
		slog.String("wow_version", wowVersion),
		slog.Int("build_version", int(buildVersion)),
		slog.Any("default_flavor", flavor.Strings()),
	)
	return nil
}

// wowVersionFromBuild maps Gophercraft build constants to human-readable
// WoW version strings.
func wowVersionFromBuild(build vsn.Build) string {
	// vsn.V1_12_1 = 5875, vsn.V1_12_2 = 6005, vsn.V2_4_3 = 8606,
	// vsn.V3_3_5a = 12340
	switch {
	case build <= 5875:
		return "1.12.1"
	case build <= 6005:
		return "1.12.2"
	case build <= 8606:
		return "2.4.3"
	case build <= 12340:
		return "3.3.5a"
	default:
		return fmt.Sprintf("unknown-%d", build)
	}
}
