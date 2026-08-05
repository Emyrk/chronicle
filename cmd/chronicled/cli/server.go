package cli

import (
	"context"
	"fmt"
	"log/slog"
	"time"

	"github.com/Emyrk/chronicle/internal/services"
	"github.com/Emyrk/chronicle/internal/services/serviceaccessurl"
	"github.com/Emyrk/chronicle/internal/services/serviceapi"
	"github.com/Emyrk/chronicle/internal/services/serviceapplication"
	"github.com/Emyrk/chronicle/internal/services/serviceassets"
	"github.com/Emyrk/chronicle/internal/services/serviceauthz"
	"github.com/Emyrk/chronicle/internal/services/servicebot"
	"github.com/Emyrk/chronicle/internal/services/servicecache"
	"github.com/Emyrk/chronicle/internal/services/servicechronicle"
	"github.com/Emyrk/chronicle/internal/services/servicedataset"
	"github.com/Emyrk/chronicle/internal/services/servicedbstore"
	"github.com/Emyrk/chronicle/internal/services/serviceexternalapi"
	"github.com/Emyrk/chronicle/internal/services/servicegamedata"
	"github.com/Emyrk/chronicle/internal/services/servicelogger"
	"github.com/Emyrk/chronicle/internal/services/servicemail"
	"github.com/Emyrk/chronicle/internal/services/servicepgxpool"
	"github.com/Emyrk/chronicle/internal/services/servicepprof"
	"github.com/Emyrk/chronicle/internal/services/serviceprometheus"
	"github.com/Emyrk/chronicle/internal/services/servicerankings"
	"github.com/Emyrk/chronicle/internal/services/serviceretention"
	"github.com/Emyrk/chronicle/internal/services/serviceriver"
	"github.com/Emyrk/chronicle/internal/services/servicestorage"
	"github.com/Emyrk/chronicle/internal/services/servicetelemetry"
	"github.com/Emyrk/chronicle/internal/services/servicetenant"
	"github.com/Emyrk/chronicle/internal/services/servicewowdb"
	"github.com/Emyrk/chronicle/internal/version"

	"github.com/coder/serpent"
)

func ServerCmd() *serpent.Command {
	srvs := services.New()
	err := srvs.Register(
		serviceaccessurl.New(srvs),
		servicelogger.New(srvs),
		servicepprof.New(srvs),
		serviceprometheus.New(srvs),
		servicecache.New(srvs),
		servicestorage.New(srvs),
		servicepgxpool.New(srvs),
		servicetenant.New(srvs),
		servicedbstore.New(srvs),
		serviceriver.New(srvs),
		serviceauthz.New(srvs),
		servicewowdb.New(srvs),
		serviceassets.New(srvs),
		servicedataset.New(srvs),
		servicegamedata.New(srvs),
		servicerankings.New(srvs),
		servicechronicle.New(srvs),
		serviceretention.New(srvs),
		servicetelemetry.New(srvs),
		servicebot.New(srvs),
		servicemail.New(srvs),
		serviceapplication.New(srvs),
		serviceexternalapi.New(srvs),
		serviceapi.New(srvs),
	)
	if err != nil {
		panic(fmt.Sprintf("register service: %v", err))
	}
	optionSet := srvs.OptionSet()

	var ()
	optionSet = append(optionSet, serpent.OptionSet{}...)

	cmd := &serpent.Command{
		Use:     "server",
		Options: optionSet,
		Handler: func(i *serpent.Invocation) error {
			ctx, cancelApp := context.WithCancel(context.Background())
			defer cancelApp()
			now := time.Now()

			logger := getLogger(i)
			logger.Info("🚀🚀 startup sequence initiated 🚀🚀",
				slog.String("server", services.ServerName),
				slog.String("tag", version.GitTag),
				slog.String("commit", version.GitCommit),
				slog.String("build_time", version.BuildTime),
			)
			err := srvs.Start(ctx, logger)
			if err != nil {
				return fmt.Errorf("start services: %w", err)
			}

			logger.Info("🏃🏃 startup sequence complete, services in full swing 🏃🏃", slog.String("duration", time.Since(now).String()))
			<-i.Context().Done()

			logger.Info("🛑🛑 closing sequence initiated 🛑🛑",
				slog.String("tag", version.GitTag),
				slog.String("commit", version.GitCommit),
				slog.String("build_time", version.BuildTime),
			)

			terminate, cancel := context.WithTimeout(context.Background(), 10*time.Second)
			defer cancel()
			done := make(chan struct{})
			go func() {
				now := time.Now()
				defer close(done)
				err := srvs.Close(terminate)
				if err != nil {
					logger.Error("❌❌ closing sequence failed ❌❌", slog.String("error", err.Error()), slog.String("duration", time.Since(now).String()))
				} else {
					logger.Info("✅✅ closing sequence complete, goodbye! ✅✅", slog.String("duration", time.Since(now).String()))
				}
			}()

			select {
			case <-done:
				return nil
			case <-terminate.Done():
				return fmt.Errorf("timed out waiting for server to close")
			}
		},
	}
	return cmd
}
