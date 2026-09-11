package servicerankings

import (
	"testing"

	"github.com/prometheus/client_golang/prometheus"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestRankingRunSummaryMetrics(t *testing.T) {
	t.Parallel()

	registry := prometheus.NewRegistry()
	metrics := newRankingRunSummaryMetrics(registry)
	metrics.queueDepth.Set(7)
	metrics.oldestDirtyAge.Set(90)
	metrics.failures.Inc()
	metrics.runsProcessed.Add(4)
	metrics.runsRebuilt.Add(2)
	metrics.runsDeleted.Inc()
	metrics.runsRetained.Inc()
	metrics.rebuildDuration.Observe(1)
	metrics.leaderboardPath.WithLabelValues("fast", "eligible").Inc()
	metrics.leaderboardPath.WithLabelValues("slow", "dirty_summary").Inc()

	families, err := registry.Gather()
	require.NoError(t, err)
	require.Len(t, families, 9)
	names := make([]string, 0, len(families))
	for _, family := range families {
		names = append(names, family.GetName())
	}
	assert.Contains(t, names, "chronicle_rankings_run_summaries_dirty_queue_depth")
	assert.Contains(t, names, "chronicle_rankings_run_summaries_oldest_dirty_age_seconds")
	assert.Contains(t, names, "chronicle_rankings_run_summaries_rebuild_duration_seconds")
	assert.Contains(t, names, "chronicle_rankings_run_summaries_rebuild_failures_total")
	assert.Contains(t, names, "chronicle_rankings_run_summaries_runs_processed_total")
	assert.Contains(t, names, "chronicle_rankings_run_summaries_runs_rebuilt_total")
	assert.Contains(t, names, "chronicle_rankings_run_summaries_runs_deleted_total")
	assert.Contains(t, names, "chronicle_rankings_run_summaries_leaderboard_queries_total")
	assert.Contains(t, names, "chronicle_rankings_run_summaries_runs_retained_dirty_total")

	// A separate registry mirrors isolated service tests and cannot collide with
	// collectors registered by another test or service instance.
	assert.NotPanics(t, func() { newRankingRunSummaryMetrics(prometheus.NewRegistry()) })
}
