package servicerankings

import (
	"context"
	"errors"
	"reflect"
	"testing"
	"time"

	"github.com/riverqueue/river"
)

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
	err := drainTenantRatingPages(context.Background(), stages, time.Now().Add(time.Hour), time.Now)
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
	err := drainTenantRatingPages(context.Background(), stages, deadline, func() time.Time { return deadline })
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
	}, deadline, func() time.Time { return deadline })
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
	}, time.Now().Add(time.Hour), time.Now)
	if !errors.Is(err, failure) || len(calls) != 1 {
		t.Fatalf("error=%v calls=%v", err, calls)
	}
}

func TestTenantRatingDrainJobUniquePerTenant(t *testing.T) {
	t.Parallel()
	opts := (ArgsDrainTenantRatings{}).InsertOpts()
	if !opts.UniqueOpts.ByArgs || !reflect.DeepEqual(opts.UniqueOpts.ByState, ratingActiveJobStates) {
		t.Fatalf("unexpected deduplication options: %+v", opts.UniqueOpts)
	}
}
