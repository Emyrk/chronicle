package servicerankings

import (
	"context"
	"errors"
	"reflect"
	"sync"
	"testing"
	"time"

	"github.com/Emyrk/chronicle/database/dbtestutil"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/prometheus/client_golang/prometheus"
	dto "github.com/prometheus/client_model/go"
	"github.com/riverqueue/river"
	"github.com/riverqueue/river/riverdriver/riverpgxv5"
	"github.com/stretchr/testify/require"
)

func TestTenantRatingDrainOutcome(t *testing.T) {
	t.Parallel()
	require.Equal(t, "completed", tenantRatingDrainOutcome(nil))
	require.Equal(t, "snoozed", tenantRatingDrainOutcome(river.JobSnooze(time.Second)))
	require.Equal(t, "failed", tenantRatingDrainOutcome(errors.New("failed")))
}

func TestDrainTenantRatingPagesInterleavesAndStopsWhenEmpty(t *testing.T) {
	t.Parallel()
	var calls []string
	pages := []struct {
		name   string
		counts []int
	}{
		{"runs", []int{1, 1, 0}},
		{"renown", []int{1, 0, 0}},
		{"mastery", []int{1, 0, 0}},
		{"peak", []int{1, 0, 0}},
	}
	var stages []ratingDrainStage
	for _, p := range pages {
		p := p
		stages = append(stages, ratingDrainStage{name: p.name, run: func(context.Context) (int, error) {
			calls = append(calls, p.name)
			n := p.counts[0]
			p.counts = p.counts[1:]
			return n, nil
		}})
	}
	err := drainTenantRatingPages(context.Background(), stages, time.Now().Add(time.Hour), time.Now, nil)
	if err != nil {
		t.Fatalf("drain: %v", err)
	}
	want := []string{"runs", "renown", "mastery", "peak", "runs", "renown", "mastery", "peak", "runs", "renown", "mastery", "peak"}
	if !reflect.DeepEqual(calls, want) {
		t.Fatalf("stages: got %v, want %v", calls, want)
	}
}

func TestDrainTenantRatingPagesSnoozesAfterDeadlineWithProgress(t *testing.T) {
	t.Parallel()
	var calls []string
	deadline := time.Unix(100, 0)
	stages := []ratingDrainStage{
		{name: "runs", run: func(context.Context) (int, error) { calls = append(calls, "runs"); return 1, nil }},
		{name: "renown", run: func(context.Context) (int, error) { calls = append(calls, "renown"); return 0, nil }},
		{name: "mastery", run: func(context.Context) (int, error) { calls = append(calls, "mastery"); return 0, nil }},
		{name: "peak", run: func(context.Context) (int, error) { calls = append(calls, "peak"); return 0, nil }},
	}
	err := drainTenantRatingPages(context.Background(), stages, deadline, func() time.Time { return deadline }, nil)
	var snooze *river.JobSnoozeError
	if !errors.As(err, &snooze) {
		t.Fatalf("expected River snooze, got %v", err)
	}
	if !reflect.DeepEqual(calls, []string{"runs"}) {
		t.Fatalf("deadline did not stop before starting another page: %v", calls)
	}
}

func TestDrainTenantRatingPagesEmptyCycleDoesNotSnooze(t *testing.T) {
	t.Parallel()
	deadline := time.Unix(100, 0)
	calls := 0
	err := drainTenantRatingPages(context.Background(), []ratingDrainStage{
		{name: "runs", run: func(context.Context) (int, error) { calls++; return 0, nil }},
	}, deadline, func() time.Time { return deadline }, nil)
	if err != nil || calls != 1 {
		t.Fatalf("empty drain: error=%v calls=%d", err, calls)
	}
}

func TestDrainTenantRatingPagesPropagatesStageError(t *testing.T) {
	t.Parallel()
	failure := errors.New("page failure")
	var calls []string
	err := drainTenantRatingPages(context.Background(), []ratingDrainStage{
		{name: "runs", run: func(context.Context) (int, error) { calls = append(calls, "runs"); return 1, nil }},
		{name: "renown", run: func(context.Context) (int, error) { return 0, failure }},
		{name: "mastery", run: func(context.Context) (int, error) { calls = append(calls, "mastery"); return 0, nil }},
	}, time.Now().Add(time.Hour), time.Now, nil)
	if !errors.Is(err, failure) || len(calls) != 1 {
		t.Fatalf("error=%v calls=%v", err, calls)
	}
}

func TestDrainTenantRatingPageMetrics(t *testing.T) {
	t.Parallel()
	worker := &WorkerDrainTenantRatings{
		PageDuration:   prometheus.NewHistogramVec(prometheus.HistogramOpts{Name: "test_rating_drain_duration_seconds"}, []string{"stage"}),
		PagesProcessed: prometheus.NewCounterVec(prometheus.CounterOpts{Name: "test_rating_drain_pages_total"}, []string{"stage"}),
		KeysProcessed:  prometheus.NewCounterVec(prometheus.CounterOpts{Name: "test_rating_drain_keys_total"}, []string{"stage"}),
		PageErrors:     prometheus.NewCounterVec(prometheus.CounterOpts{Name: "test_rating_drain_errors_total"}, []string{"stage"}),
	}
	failure := errors.New("failed page")
	calls := 0
	err := drainTenantRatingPages(context.Background(), []ratingDrainStage{
		{name: "runs", run: func(context.Context) (int, error) {
			calls++
			if calls == 1 {
				return 3, nil
			}
			return 0, nil
		}},
		{name: "renown", run: func(context.Context) (int, error) { return 0, nil }},
	}, time.Now().Add(time.Hour), time.Now, worker)
	if err != nil {
		t.Fatal(err)
	}
	if got := ratingCounterValue(t, worker.PagesProcessed.WithLabelValues("runs")); got != 1 {
		t.Fatalf("pages=%v", got)
	}
	if got := ratingCounterValue(t, worker.KeysProcessed.WithLabelValues("runs")); got != 3 {
		t.Fatalf("keys=%v", got)
	}
	if got := ratingCounterValue(t, worker.PagesProcessed.WithLabelValues("renown")); got != 0 {
		t.Fatalf("empty pages=%v", got)
	}
	err = drainTenantRatingPages(context.Background(), []ratingDrainStage{
		{name: "peak", run: func(context.Context) (int, error) { return 0, failure }},
	}, time.Now().Add(time.Hour), time.Now, worker)
	if !errors.Is(err, failure) {
		t.Fatalf("error=%v", err)
	}
	if got := ratingCounterValue(t, worker.PageErrors.WithLabelValues("peak")); got != 1 {
		t.Fatalf("errors=%v", got)
	}
	// Both successful and failed page attempts record durations without tenant labels.
	for _, stage := range []string{"runs", "renown", "peak"} {
		metric := &dto.Metric{}
		if err := worker.PageDuration.WithLabelValues(stage).(prometheus.Metric).Write(metric); err != nil {
			t.Fatal(err)
		}
		want := uint64(2)
		if stage == "peak" {
			want = 1
		}
		if got := metric.GetHistogram().GetSampleCount(); got != want {
			t.Fatalf("%s duration samples=%v", stage, got)
		}
	}
}

func TestTenantRatingDrainConcurrentEnqueueDeduplicates(t *testing.T) {
	t.Parallel()
	pool, _ := dbtestutil.NewPGXPool(t)
	clients := make([]*river.Client[pgx.Tx], 2)
	for i := range clients {
		var err error
		clients[i], err = river.NewClient(riverpgxv5.New(pool), &river.Config{})
		require.NoError(t, err)
	}
	tenant := uuid.New()
	var wg sync.WaitGroup
	errors := make(chan error, len(clients))
	for _, client := range clients {
		wg.Add(1)
		go func() {
			defer wg.Done()
			_, err := client.Insert(t.Context(), ArgsDrainTenantRatings{TenantID: tenant}, nil)
			errors <- err
		}()
	}
	wg.Wait()
	close(errors)
	for err := range errors {
		require.NoError(t, err)
	}
	var count int
	require.NoError(t, pool.QueryRow(t.Context(), `SELECT count(*) FROM river_job WHERE kind = 'drain-tenant-ratings' AND args->>'tenant_id' = $1`, tenant.String()).Scan(&count))
	require.Equal(t, 1, count)
}

func ratingCounterValue(t *testing.T, counter prometheus.Counter) float64 {
	t.Helper()
	metric := &dto.Metric{}
	if err := counter.Write(metric); err != nil {
		t.Fatal(err)
	}
	return metric.GetCounter().GetValue()
}

func TestTenantRatingDrainJobUniquePerTenant(t *testing.T) {
	t.Parallel()
	opts := (ArgsDrainTenantRatings{}).InsertOpts()
	if !opts.UniqueOpts.ByArgs || !reflect.DeepEqual(opts.UniqueOpts.ByState, ratingActiveJobStates) {
		t.Fatalf("unexpected deduplication options: %+v", opts.UniqueOpts)
	}
}
