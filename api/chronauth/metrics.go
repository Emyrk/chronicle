package chronauth

import (
	"fmt"
	"net/http"

	"github.com/prometheus/client_golang/prometheus"
)

const (
	authMethodDiscord       = "discord"
	authMethodEmailPassword = "email_password"
	authResultSuccess       = "success"
	authResultError         = "error"
	authTenantRoot          = "root"
)

type authMetrics struct {
	signups   *prometheus.CounterVec
	logins    *prometheus.CounterVec
	refreshes *prometheus.CounterVec
}

func newAuthMetrics(registerer prometheus.Registerer) (*authMetrics, error) {
	if registerer == nil {
		registerer = prometheus.NewRegistry()
	}

	metrics := &authMetrics{
		signups: prometheus.NewCounterVec(prometheus.CounterOpts{
			Namespace: "chronicle",
			Subsystem: "api_auth",
			Name:      "signups_total",
			Help:      "Successful user signups by authentication method and tenant.",
		}, []string{"method", "tenant"}),
		logins: prometheus.NewCounterVec(prometheus.CounterOpts{
			Namespace: "chronicle",
			Subsystem: "api_auth",
			Name:      "logins_total",
			Help:      "Successful user logins by authentication method and tenant.",
		}, []string{"method", "tenant"}),
		refreshes: prometheus.NewCounterVec(prometheus.CounterOpts{
			Namespace: "chronicle",
			Subsystem: "api_auth",
			Name:      "refreshes_total",
			Help:      "OAuth session refresh attempts by authentication method, result, and tenant.",
		}, []string{"method", "result", "tenant"}),
	}
	for _, collector := range []prometheus.Collector{metrics.signups, metrics.logins, metrics.refreshes} {
		if err := registerer.Register(collector); err != nil {
			return nil, fmt.Errorf("register auth metric: %w", err)
		}
	}
	return metrics, nil
}

func (m *authMetrics) observeSignup(method, tenant string) {
	if m == nil {
		return
	}
	m.signups.WithLabelValues(method, tenant).Inc()
}

func (m *authMetrics) observeLogin(method, tenant string) {
	if m == nil {
		return
	}
	m.logins.WithLabelValues(method, tenant).Inc()
}

func (m *authMetrics) observeRefresh(method, tenant string, err error) {
	if m == nil {
		return
	}
	result := authResultSuccess
	if err != nil {
		result = authResultError
	}
	m.refreshes.WithLabelValues(authMethod(method), result, tenant).Inc()
}

func (s *Service) authMetricTenant(r *http.Request) string {
	if s.Store != nil {
		redirect, err := s.Store.Get(r, "from")
		if err == nil && redirect != nil {
			from, _ := redirect.Values["from"].(string)
			if _, _, tenant, ok := s.parseRelayTarget(from); ok && tenant.Slug != "" {
				return tenant.Slug
			}
		}
	}
	if s.tenantChecker != nil {
		if tenant := s.tenantChecker(r.Host); tenant != nil && tenant.Slug != "" {
			return tenant.Slug
		}
	}
	return authTenantRoot
}

func authMethod(provider string) string {
	if provider == PasswordProvider {
		return authMethodEmailPassword
	}
	return provider
}
