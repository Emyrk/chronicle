package servicepprof

import (
	"context"
	"log/slog"
	"net"
	"net/http"
	"net/http/pprof"

	"github.com/Emyrk/chronicle/internal/services"
	"github.com/Emyrk/chronicle/internal/services/servicelogger"
	"github.com/prometheus/client_golang/prometheus"

	"github.com/coder/serpent"
)

var _ services.Servicer = (*Service)(nil)

func OnPProf() string {
	return (&Service{}).Name()
}

type Service struct {
	broker *services.Services

	reg *prometheus.Registry

	enabled bool
	address string
}

func New(broker *services.Services) *Service {
	return &Service{
		broker: broker,
		reg:    prometheus.NewRegistry(),
	}
}

func (s *Service) Name() string {
	return services.ServicePProf
}

func (s *Service) Configures() []string { return []string{} }
func (s *Service) DependsOn() []string {
	return []string{
		servicelogger.OnLogger(),
	}
}

func (s *Service) Start(ctx context.Context) error {
	logger := servicelogger.Logger(s.broker)
	if !s.enabled {
		return nil
	}

	mux := http.NewServeMux()
	mux.Handle("/debug/pprof/", http.HandlerFunc(pprof.Index))
	mux.Handle("/debug/pprof/cmdline", http.HandlerFunc(pprof.Cmdline))
	mux.Handle("/debug/pprof/profile", http.HandlerFunc(pprof.Profile))
	mux.Handle("/debug/pprof/symbol", http.HandlerFunc(pprof.Symbol))
	mux.Handle("/debug/pprof/trace", http.HandlerFunc(pprof.Trace))

	srv := http.Server{
		Addr:    s.address,
		Handler: mux,
		BaseContext: func(listener net.Listener) context.Context {
			return ctx
		},
	}
	go func() {
		logger.Info("Starting pprof server", slog.String("address", s.address))
		err := srv.ListenAndServe()
		if err != nil {
			logger.Error("pprof server", slog.String("service", "pprof"), slog.String("error", err.Error()))
		}
	}()
	return nil
}

func (s *Service) Close(_ context.Context) error {
	return nil
}

func (s *Service) Options() serpent.OptionSet {
	return serpent.OptionSet{
		{
			Name:        "Pprof Enabled",
			Description: "Enable pprof server.",
			Required:    false,
			Flag:        "pprof-enabled",
			Env:         "CHRONICLE_PPROF_ENABLED",
			Default:     "false",
			Value:       serpent.BoolOf(&s.enabled),
		},
		{
			Name:        "Pprof Address",
			Description: "Address for pprof server to listen on.",
			Required:    false,
			Flag:        "pprof-address",
			Env:         "CHRONICLE_PPROF_ADDRESS",
			Default:     "0.0.0.0:6060",
			Value:       serpent.StringOf(&s.address),
		},
	}
}
