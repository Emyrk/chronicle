package servicesidekick

import (
	"fmt"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/prometheus/client_golang/prometheus"
)

const (
	sidekickHeartbeatResultSuccess       = "success"
	sidekickHeartbeatResultBadRequest    = "bad_request"
	sidekickHeartbeatResultNotFound      = "not_found"
	sidekickHeartbeatResultInternalError = "internal_error"

	sidekickUploadKindNew    = "new"
	sidekickUploadKindAppend = "append"

	sidekickOnlineWindow = 3 * time.Minute
)

type sidekickMetrics struct {
	heartbeats    *prometheus.CounterVec
	heartbeatTime *prometheus.HistogramVec
	configUpdates prometheus.Counter
	uploads       *prometheus.CounterVec
	online        prometheus.GaugeFunc

	onlineMu       sync.Mutex
	lastHeartbeats map[uuid.UUID]time.Time
	now            func() time.Time
}

func newSidekickMetrics(registerer prometheus.Registerer) (*sidekickMetrics, error) {
	if registerer == nil {
		registerer = prometheus.NewRegistry()
	}

	metrics := &sidekickMetrics{
		heartbeats: prometheus.NewCounterVec(prometheus.CounterOpts{
			Namespace: "chronicle",
			Subsystem: "sidekick",
			Name:      "heartbeats_total",
			Help:      "Sidekick heartbeat attempts by result.",
		}, []string{"result"}),
		heartbeatTime: prometheus.NewHistogramVec(prometheus.HistogramOpts{
			Namespace: "chronicle",
			Subsystem: "sidekick",
			Name:      "heartbeat_duration_seconds",
			Help:      "Time spent processing Sidekick heartbeats by result.",
		}, []string{"result"}),
		configUpdates: prometheus.NewCounter(prometheus.CounterOpts{
			Namespace: "chronicle",
			Subsystem: "sidekick",
			Name:      "config_updates_total",
			Help:      "Sidekick configuration updates returned by heartbeat responses.",
		}),
		uploads: prometheus.NewCounterVec(prometheus.CounterOpts{
			Namespace: "chronicle",
			Subsystem: "sidekick",
			Name:      "uploads_total",
			Help:      "Successful Sidekick log uploads by upload kind.",
		}, []string{"kind"}),
		lastHeartbeats: make(map[uuid.UUID]time.Time),
		now:            time.Now,
	}
	metrics.online = prometheus.NewGaugeFunc(prometheus.GaugeOpts{
		Namespace: "chronicle",
		Subsystem: "sidekick",
		Name:      "online_installations",
		Help:      "Sidekick installations with a successful heartbeat in the past three minutes, observed by this process.",
	}, metrics.onlineInstallations)
	for _, collector := range []prometheus.Collector{metrics.heartbeats, metrics.heartbeatTime, metrics.configUpdates, metrics.uploads, metrics.online} {
		if err := registerer.Register(collector); err != nil {
			return nil, fmt.Errorf("register sidekick metric: %w", err)
		}
	}
	return metrics, nil
}

func (m *sidekickMetrics) observeHeartbeat(result string, duration time.Duration) {
	if m == nil {
		return
	}
	m.heartbeats.WithLabelValues(result).Inc()
	m.heartbeatTime.WithLabelValues(result).Observe(duration.Seconds())
}

func (m *sidekickMetrics) observeConfigUpdate() {
	if m == nil {
		return
	}
	m.configUpdates.Inc()
}

func (m *sidekickMetrics) observeOnline(installationID uuid.UUID) {
	if m == nil {
		return
	}
	m.onlineMu.Lock()
	defer m.onlineMu.Unlock()
	now := m.now()
	m.pruneOnlineLocked(now)
	m.lastHeartbeats[installationID] = now
}

func (m *sidekickMetrics) onlineInstallations() float64 {
	m.onlineMu.Lock()
	defer m.onlineMu.Unlock()
	m.pruneOnlineLocked(m.now())
	return float64(len(m.lastHeartbeats))
}

func (m *sidekickMetrics) pruneOnlineLocked(now time.Time) {
	cutoff := now.Add(-sidekickOnlineWindow)
	for installationID, lastHeartbeat := range m.lastHeartbeats {
		if !lastHeartbeat.After(cutoff) {
			delete(m.lastHeartbeats, installationID)
		}
	}
}

func (m *sidekickMetrics) observeUpload(kind string) {
	if m == nil {
		return
	}
	m.uploads.WithLabelValues(kind).Inc()
}
