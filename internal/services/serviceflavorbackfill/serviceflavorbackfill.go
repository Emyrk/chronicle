// Package serviceflavorbackfill is a one-shot boot migration that stamps the
// build-tag flavor onto log groups created before the flavor column existed.
//
// It is deliberately self-contained and temporary: once every row carries a
// flavor (and flavor resolution moves to per-tenant runtime config), delete the
// package and its registration in cmd/chronicled/cli/server.go. Nothing depends
// on this package.
package serviceflavorbackfill

import (
	"context"
	"log/slog"

	"github.com/Emyrk/chronicle/internal/services"
	"github.com/Emyrk/chronicle/internal/services/servicechronicle"
	"github.com/Emyrk/chronicle/internal/services/servicedbstore"
	"github.com/Emyrk/chronicle/internal/services/servicelogger"
	"github.com/Emyrk/chronicle/internal/services/servicetenant"

	"github.com/coder/serpent"
)

var _ services.Servicer = (*Service)(nil)

type Service struct {
	broker *services.Services
}

func New(broker *services.Services) *Service {
	return &Service{broker: broker}
}

func (s *Service) Name() string {
	return services.ServiceFlavorBackfill
}

func (s *Service) DependsOn() []string {
	return []string{
		servicelogger.OnLogger(),
		servicedbstore.OnDatabaseStore(),
	}
}

// Start launches the backfill asynchronously so it never blocks boot. The
// update is idempotent (only NULL flavors are touched), so a crash mid-run or a
// restart simply re-runs it harmlessly.
func (s *Service) Start(ctx context.Context) error {
	logger := services.NamedLogger(servicelogger.Logger(s.broker), s.Name())
	db := servicedbstore.DatabaseStore(s.broker)
	flavor := servicechronicle.BuildTagFlavor()

	go func() {
		rows, err := db.BackfillLogGroupFlavors(servicetenant.AdminBypass(ctx), flavor.Strings())
		if err != nil {
			logger.Error("backfill log group flavors", slog.String("error", err.Error()))
			return
		}
		if rows > 0 {
			logger.Info("backfilled log group flavors",
				slog.String("server", services.ServerName),
				slog.Any("flavor", flavor),
				slog.Int64("rows", rows),
			)
		}
	}()

	return nil
}

func (s *Service) Close(_ context.Context) error {
	return nil
}

func (s *Service) Options() serpent.OptionSet {
	return serpent.OptionSet{}
}

func (s *Service) Configures() []string {
	return []string{}
}
