package serviceprometheus

import (
	"context"
	"log/slog"
	"net"
	"net/http"

	"github.com/Emyrk/chronicle/internal/services"
	"github.com/Emyrk/chronicle/internal/services/servicelogger"
	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promhttp"

	"github.com/coder/serpent"
)

var _ services.Servicer = (*Service)(nil)

func Registry(broker *services.Services) *prometheus.Registry {
	srv := services.MustGet[*Service](broker)
	return srv.reg
}

func OnPrometheus() string {
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
	return services.ServicePrometheus
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

	srv := http.Server{
		Addr:    s.address,
		Handler: promhttp.HandlerFor(s.reg, promhttp.HandlerOpts{}),
		BaseContext: func(listener net.Listener) context.Context {
			return ctx
		},
	}
	go func() {
		logger.Info("Starting prometheus server", slog.String("address", s.address))
		err := srv.ListenAndServe()
		if err != nil {
			logger.Error("prometheus server", slog.String("service", "prometheus"), slog.String("error", err.Error()))
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
			Name:        "Prometheus Enabled",
			Description: "Enable Prometheus metrics server.",
			Required:    false,
			Flag:        "prometheus-enabled",
			Env:         "CHRONICLE_PROMETHEUS_ENABLED",
			Default:     "false",
			Value:       serpent.BoolOf(&s.enabled),
		},
		{
			Name:        "Prometheus Address",
			Description: "Address for Prometheus metrics server to listen on.",
			Required:    false,
			Flag:        "prometheus-address",
			Env:         "CHRONICLE_PROMETHEUS_ADDRESS",
			Default:     "0.0.0.0:9091",
			Value:       serpent.StringOf(&s.address),
		},
	}
}
