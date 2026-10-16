package cli

import (
	"context"
	"fmt"
	"log/slog"
	"time"

	"github.com/Emyrk/chronicle/internal/services"
	"github.com/Emyrk/chronicle/internal/services/serviceaccessurl"
	"github.com/Emyrk/chronicle/internal/services/serviceauthz"
	"github.com/Emyrk/chronicle/internal/services/servicecache"
	"github.com/Emyrk/chronicle/internal/services/servicechronicle"
	"github.com/Emyrk/chronicle/internal/services/servicedataset"
	"github.com/Emyrk/chronicle/internal/services/servicedbstore"
	"github.com/Emyrk/chronicle/internal/services/servicelogger"
	"github.com/Emyrk/chronicle/internal/services/serviceparser"
	"github.com/Emyrk/chronicle/internal/services/servicepgxpool"
	"github.com/Emyrk/chronicle/internal/services/serviceprometheus"
	"github.com/Emyrk/chronicle/internal/services/servicestorage"
	"github.com/Emyrk/chronicle/internal/services/servicetenant"
	"github.com/Emyrk/chronicle/internal/services/servicewowdb"
	"github.com/Emyrk/chronicle/internal/version"

	"github.com/coder/serpent"
)

func parserServices(srvs *services.Services) []services.Servicer {
	return []services.Servicer{
		serviceaccessurl.New(srvs),
		servicelogger.New(srvs),
		serviceprometheus.New(srvs),
		servicecache.New(srvs),
		servicestorage.New(srvs),
		servicepgxpool.New(srvs),
		servicetenant.New(srvs),
		servicedbstore.New(srvs),
		serviceauthz.New(srvs),
		servicedataset.New(srvs),
		servicewowdb.New(srvs),
		servicechronicle.NewParser(srvs),
		serviceparser.New(srvs),
	}
}

// ParserCmd runs only the services required to consume log-parsing jobs.
func ParserCmd() *serpent.Command {
	srvs := services.New()
	if err := srvs.Register(parserServices(srvs)...); err != nil {
		panic(fmt.Sprintf("register parser service: %v", err))
	}

	return &serpent.Command{
		Use:     "parser",
		Short:   "Run scalable log parsing workers",
		Options: srvs.OptionSet(),
		Handler: func(i *serpent.Invocation) error {
			ctx, cancelApp := context.WithCancel(context.Background())
			defer cancelApp()

			logger := getLogger(i)
			logger.Info("parser startup sequence initiated",
				slog.String("server", services.ServerName),
				slog.String("tag", version.GitTag),
				slog.String("commit", version.GitCommit),
				slog.String("build_time", version.BuildTime),
			)

			started := time.Now()
			if err := srvs.Start(ctx, logger); err != nil {
				return fmt.Errorf("start parser services: %w", err)
			}
			logger.Info("parser startup sequence complete", slog.String("duration", time.Since(started).String()))

			<-i.Context().Done()
			logger.Info("parser closing sequence initiated")

			terminate, cancel := context.WithTimeout(context.Background(), 10*time.Second)
			defer cancel()
			if err := srvs.Close(terminate); err != nil {
				return fmt.Errorf("close parser services: %w", err)
			}
			logger.Info("parser closing sequence complete")
			return nil
		},
	}
}
