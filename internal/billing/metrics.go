package billing

import (
	"fmt"
	"time"

	"github.com/prometheus/client_golang/prometheus"
)

// Metrics exposes aggregate billing synchronization health without using
// customer or subscription IDs as Prometheus labels.
type Metrics struct {
	entitlementSyncs                 *prometheus.CounterVec
	reconciliationRuns               *prometheus.CounterVec
	reconciliationLastCompleted      prometheus.Gauge
	reconciliationLastSuccess        prometheus.Gauge
	reconciliationSubscriptionErrors prometheus.Gauge
	reconciliationEntitlementErrors  prometheus.Gauge
	reconciliationCustomersFound     prometheus.Gauge
	reconciliationCustomersSynced    prometheus.Gauge
}

func NewMetrics(registerer prometheus.Registerer) (*Metrics, error) {
	metrics := &Metrics{
		entitlementSyncs: prometheus.NewCounterVec(prometheus.CounterOpts{
			Namespace: "chronicle",
			Subsystem: "billing",
			Name:      "entitlement_syncs_total",
			Help:      "Stripe entitlement synchronization attempts by result.",
		}, []string{"result"}),
		reconciliationRuns: prometheus.NewCounterVec(prometheus.CounterOpts{
			Namespace: "chronicle",
			Subsystem: "billing",
			Name:      "reconciliation_runs_total",
			Help:      "Billing reconciliation runs by final status.",
		}, []string{"status"}),
		reconciliationLastCompleted: prometheus.NewGauge(prometheus.GaugeOpts{
			Namespace: "chronicle",
			Subsystem: "billing",
			Name:      "reconciliation_last_completed_timestamp_seconds",
			Help:      "Unix timestamp of the last completed billing reconciliation run.",
		}),
		reconciliationLastSuccess: prometheus.NewGauge(prometheus.GaugeOpts{
			Namespace: "chronicle",
			Subsystem: "billing",
			Name:      "reconciliation_last_success_timestamp_seconds",
			Help:      "Unix timestamp of the last billing reconciliation run without errors.",
		}),
		reconciliationSubscriptionErrors: prometheus.NewGauge(prometheus.GaugeOpts{
			Namespace: "chronicle",
			Subsystem: "billing",
			Name:      "reconciliation_subscription_errors",
			Help:      "Subscription errors in the last billing reconciliation run.",
		}),
		reconciliationEntitlementErrors: prometheus.NewGauge(prometheus.GaugeOpts{
			Namespace: "chronicle",
			Subsystem: "billing",
			Name:      "reconciliation_entitlement_errors",
			Help:      "Customer entitlement synchronization errors in the last billing reconciliation run.",
		}),
		reconciliationCustomersFound: prometheus.NewGauge(prometheus.GaugeOpts{
			Namespace: "chronicle",
			Subsystem: "billing",
			Name:      "reconciliation_entitlement_customers_found",
			Help:      "Stripe entitlement customers found in the last billing reconciliation run.",
		}),
		reconciliationCustomersSynced: prometheus.NewGauge(prometheus.GaugeOpts{
			Namespace: "chronicle",
			Subsystem: "billing",
			Name:      "reconciliation_entitlement_customers_synced",
			Help:      "Stripe entitlement customers successfully synchronized in the last billing reconciliation run.",
		}),
	}
	collectors := []prometheus.Collector{
		metrics.entitlementSyncs,
		metrics.reconciliationRuns,
		metrics.reconciliationLastCompleted,
		metrics.reconciliationLastSuccess,
		metrics.reconciliationSubscriptionErrors,
		metrics.reconciliationEntitlementErrors,
		metrics.reconciliationCustomersFound,
		metrics.reconciliationCustomersSynced,
	}
	for _, collector := range collectors {
		if err := registerer.Register(collector); err != nil {
			return nil, fmt.Errorf("register billing metric: %w", err)
		}
	}
	return metrics, nil
}

func (m *Metrics) observeEntitlementSync(err error) {
	if m == nil {
		return
	}
	result := "success"
	if err != nil {
		result = "error"
	}
	m.entitlementSyncs.WithLabelValues(result).Inc()
}

func (m *Metrics) observeReconciliation(status string, completedAt time.Time, counts reconciliationCounts, subscriptionErrors, entitlementErrors int) {
	if m == nil {
		return
	}
	m.reconciliationRuns.WithLabelValues(status).Inc()
	m.reconciliationLastCompleted.Set(float64(completedAt.Unix()))
	if status == "completed" {
		m.reconciliationLastSuccess.Set(float64(completedAt.Unix()))
	}
	m.reconciliationSubscriptionErrors.Set(float64(subscriptionErrors))
	m.reconciliationEntitlementErrors.Set(float64(entitlementErrors))
	m.reconciliationCustomersFound.Set(float64(counts.entitlementCustomersFound))
	m.reconciliationCustomersSynced.Set(float64(counts.entitlementCustomersSynced))
}
