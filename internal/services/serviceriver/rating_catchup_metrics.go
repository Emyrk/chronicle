package serviceriver

import (
	"context"
	"log/slog"
	"time"

	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/internal/services/servicetenant"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promauto"
)

const ratingCatchupMetricsInterval = 30 * time.Second

// The same global DB snapshot is scraped on every replica. Grafana must use
// max(), not sum(), for these gauges. The DB query runs in this bounded loop,
// never on the Prometheus scrape path.
func runRatingCatchupMetrics(ctx context.Context, db database.Store, registry prometheus.Registerer, logger *slog.Logger) <-chan struct{} {
	dirty := promauto.With(registry).NewGaugeVec(prometheus.GaugeOpts{
		Namespace: "chronicle", Subsystem: "rating", Name: "dirty_keys",
		Help: "Global pending rating keys by stage (identical on each daemon)",
	}, []string{"stage"})
	tenantDirty := promauto.With(registry).NewGaugeVec(prometheus.GaugeOpts{
		Namespace: "chronicle", Subsystem: "rating", Name: "tenant_dirty_keys",
		Help: "Pending rating keys by tenant slug and stage (identical on each daemon)",
	}, []string{"tenant", "stage"})
	oldest := promauto.With(registry).NewGaugeVec(prometheus.GaugeOpts{
		Namespace: "chronicle", Subsystem: "rating", Name: "oldest_dirty_age_seconds",
		Help: "Age of the oldest global pending rating key by stage",
	}, []string{"stage"})
	unfinished := promauto.With(registry).NewGauge(prometheus.GaugeOpts{
		Namespace: "chronicle", Subsystem: "rating", Name: "unfinished_scans",
		Help: "Tenants with a historical rating evidence scan not yet completed",
	})
	peakPages := promauto.With(registry).NewGauge(prometheus.GaugeOpts{
		Namespace: "chronicle", Subsystem: "rating", Name: "peak_pages",
		Help: "Global resumable Peak cohort pages",
	})
	refreshSuccess := promauto.With(registry).NewGauge(prometheus.GaugeOpts{
		Namespace: "chronicle", Subsystem: "rating", Name: "catchup_snapshot_success",
		Help: "Whether the most recent database-backed catch-up metrics refresh succeeded",
	})
	const timeout = 10 * time.Second
	finished := make(chan struct{})
	go func() {
		defer close(finished)
		ticker := time.NewTicker(ratingCatchupMetricsInterval)
		defer ticker.Stop()
		for {
			queryCtx, cancel := context.WithTimeout(servicetenant.AdminBypass(ctx), timeout)
			rows, err := db.ListTenantRatingCatchupStatus(queryCtx)
			cancel()
			if err != nil {
				refreshSuccess.Set(0)
				logger.WarnContext(ctx, "rating catch-up metrics refresh failed", slog.Any("error", err))
			} else {
				refreshSuccess.Set(1)
				counts, ages, scans, pages := aggregateRatingCatchupMetrics(rows, time.Now().UTC())
				for stage, count := range counts {
					dirty.WithLabelValues(stage).Set(float64(count))
					oldest.WithLabelValues(stage).Set(ages[stage])
				}
				tenantDirty.Reset()
				for tenant, stageCounts := range ratingDirtyCountsByTenant(rows) {
					for stage, count := range stageCounts {
						tenantDirty.WithLabelValues(tenant, stage).Set(float64(count))
					}
				}
				unfinished.Set(float64(scans))
				peakPages.Set(float64(pages))
			}
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
			}
		}
	}()
	return finished
}

func aggregateRatingCatchupMetrics(rows []database.ListTenantRatingCatchupStatusRow, now time.Time) (map[string]int64, map[string]float64, int64, int64) {
	counts := map[string]int64{"runs": 0, "renown": 0, "mastery": 0, "peak": 0}
	ages := map[string]float64{"runs": 0, "renown": 0, "mastery": 0, "peak": 0}
	var unfinished, pages int64
	add := func(stage string, count int64, changed pgtype.Timestamptz) {
		counts[stage] += count
		if count > 0 && changed.Valid {
			age := max(0, now.Sub(changed.Time).Seconds())
			ages[stage] = max(ages[stage], age)
		}
	}
	for _, row := range rows {
		add("runs", row.DirtyRuns, row.OldestRun)
		add("renown", row.DirtyRenown, row.OldestRenown)
		add("mastery", row.DirtyMastery, row.OldestMastery)
		add("peak", row.DirtyPeak, row.OldestPeak)
		pages += row.PeakPages
		if !row.CompletedAt.Valid || row.UnfinishedPolicyScanStages > 0 {
			unfinished++
		}
	}
	return counts, ages, unfinished, pages
}

func ratingDirtyCountsByTenant(rows []database.ListTenantRatingCatchupStatusRow) map[string]map[string]int64 {
	counts := make(map[string]map[string]int64, len(rows))
	for _, row := range rows {
		tenant := row.TenantSlug
		if tenant == "" {
			tenant = "root"
		}
		counts[tenant] = map[string]int64{
			"runs":    row.DirtyRuns,
			"renown":  row.DirtyRenown,
			"mastery": row.DirtyMastery,
			"peak":    row.DirtyPeak,
		}
	}
	return counts
}
