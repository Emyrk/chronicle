package serviceprometheus

import (
	"context"
	"crypto/subtle"
	"fmt"
	"log/slog"
	"net"
	"net/http"
	"net/netip"
	"strings"

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

	enabled   bool
	address   string
	sharedKey string
	ipAllow   string
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

	handler, err := ipAllow(
		s.ipAllow,
		bearerAuth(s.sharedKey, promhttp.HandlerFor(s.reg, promhttp.HandlerOpts{})),
	)
	if err != nil {
		return err
	}

	srv := http.Server{
		Addr:    s.address,
		Handler: handler,
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

func ipAllow(rawAllowlist string, next http.Handler) (http.Handler, error) {
	if strings.TrimSpace(rawAllowlist) == "" {
		return next, nil
	}

	allowed := make(map[netip.Addr]struct{})
	for entry := range strings.SplitSeq(rawAllowlist, ",") {
		entry = strings.TrimSpace(entry)
		if entry == "" {
			continue
		}

		ip, err := netip.ParseAddr(entry)
		if err != nil {
			return nil, fmt.Errorf("parse prometheus IP allowlist entry %q: %w", entry, err)
		}
		allowed[ip.Unmap()] = struct{}{}
	}
	if len(allowed) == 0 {
		return nil, fmt.Errorf("prometheus IP allowlist contains no IP addresses")
	}

	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ip, ok := prometheusClientIP(r)
		if !ok {
			http.Error(w, http.StatusText(http.StatusForbidden), http.StatusForbidden)
			return
		}
		if _, ok := allowed[ip.Unmap()]; !ok {
			http.Error(w, http.StatusText(http.StatusForbidden), http.StatusForbidden)
			return
		}

		next.ServeHTTP(w, r)
	}), nil
}

func prometheusClientIP(r *http.Request) (netip.Addr, bool) {
	remote := r.RemoteAddr
	if host, _, err := net.SplitHostPort(remote); err == nil {
		remote = host
	}

	remoteIP, err := netip.ParseAddr(strings.TrimSpace(remote))
	if err != nil {
		return netip.Addr{}, false
	}

	// Trust forwarding data only from a private or loopback reverse proxy.
	if remoteIP.IsPrivate() || remoteIP.IsLoopback() {
		forwarded := strings.Split(r.Header.Get("X-Forwarded-For"), ",")
		for i := len(forwarded) - 1; i >= 0; i-- {
			candidate, err := netip.ParseAddr(strings.TrimSpace(forwarded[i]))
			if err == nil {
				return candidate.Unmap(), true
			}
		}
	}

	return remoteIP.Unmap(), true
}

func bearerAuth(sharedKey string, next http.Handler) http.Handler {
	if sharedKey == "" {
		return next
	}

	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		const prefix = "Bearer "
		authorization := r.Header.Get("Authorization")
		if len(authorization) <= len(prefix) ||
			!strings.EqualFold(authorization[:len(prefix)], prefix) ||
			subtle.ConstantTimeCompare(
				[]byte(strings.TrimSpace(authorization[len(prefix):])),
				[]byte(sharedKey),
			) != 1 {
			w.Header().Set("WWW-Authenticate", "Bearer")
			http.Error(w, http.StatusText(http.StatusUnauthorized), http.StatusUnauthorized)
			return
		}

		next.ServeHTTP(w, r)
	})
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
		{
			Name:        "Prometheus Shared Key",
			Description: "Optional shared key required as a Bearer token to access Prometheus metrics.",
			Required:    false,
			Flag:        "prometheus-shared-key",
			Env:         "CHRONICLE_PROMETHEUS_SHARED_KEY",
			Default:     "",
			Value:       serpent.StringOf(&s.sharedKey),
		},
		{
			Name:        "Prometheus IP Allowlist",
			Description: "Optional comma-separated IP addresses allowed to access Prometheus metrics.",
			Required:    false,
			Flag:        "prometheus-ip-allow",
			Env:         "CHRONICLE_PROMETHEUS_IP_ALLOW",
			Default:     "",
			Value:       serpent.StringOf(&s.ipAllow),
		},
	}
}
