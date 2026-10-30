package chronicle

import (
	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promauto"
)

type accountMetrics struct {
	deleted prometheus.Counter
}

func newAccountMetrics(registerer prometheus.Registerer) *accountMetrics {
	if registerer == nil {
		registerer = prometheus.NewRegistry()
	}
	return &accountMetrics{
		deleted: promauto.With(registerer).NewCounter(prometheus.CounterOpts{
			Namespace: "chronicle",
			Subsystem: "accounts",
			Name:      "deleted_total",
			Help:      "Successful user account deletions.",
		}),
	}
}

func (m *accountMetrics) observeDeletion() {
	if m == nil {
		return
	}
	m.deleted.Inc()
}
