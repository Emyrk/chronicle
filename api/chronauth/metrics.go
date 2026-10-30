package chronauth

import (
	"fmt"

	"github.com/prometheus/client_golang/prometheus"
)

const (
	authMethodDiscord       = "discord"
	authMethodEmailPassword = "email_password"
	authResultSuccess       = "success"
	authResultError         = "error"
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
			Help:      "Successful user signups by authentication method.",
		}, []string{"method"}),
		logins: prometheus.NewCounterVec(prometheus.CounterOpts{
			Namespace: "chronicle",
			Subsystem: "api_auth",
			Name:      "logins_total",
			Help:      "Successful user logins by authentication method.",
		}, []string{"method"}),
		refreshes: prometheus.NewCounterVec(prometheus.CounterOpts{
			Namespace: "chronicle",
			Subsystem: "api_auth",
			Name:      "refreshes_total",
			Help:      "OAuth session refresh attempts by authentication method and result.",
		}, []string{"method", "result"}),
	}
	for _, collector := range []prometheus.Collector{metrics.signups, metrics.logins, metrics.refreshes} {
		if err := registerer.Register(collector); err != nil {
			return nil, fmt.Errorf("register auth metric: %w", err)
		}
	}
	return metrics, nil
}

func (m *authMetrics) observeSignup(method string) {
	if m == nil {
		return
	}
	m.signups.WithLabelValues(method).Inc()
}

func (m *authMetrics) observeLogin(method string) {
	if m == nil {
		return
	}
	m.logins.WithLabelValues(method).Inc()
}

func (m *authMetrics) observeRefresh(method string, err error) {
	if m == nil {
		return
	}
	result := authResultSuccess
	if err != nil {
		result = authResultError
	}
	m.refreshes.WithLabelValues(authMethod(method), result).Inc()
}

func authMethod(provider string) string {
	if provider == PasswordProvider {
		return authMethodEmailPassword
	}
	return provider
}
