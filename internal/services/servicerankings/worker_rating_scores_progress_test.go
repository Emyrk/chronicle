package servicerankings

import (
	"context"
	"fmt"
	"testing"
	"time"

	"github.com/Emyrk/chronicle/database"

	"github.com/google/uuid"
	"github.com/riverqueue/river"
	"github.com/riverqueue/river/rivertype"
	"github.com/stretchr/testify/require"
)

func TestRatingPagesProcessedUsesOnlyCurrentGeneration(t *testing.T) {
	t.Parallel()
	generation := uuid.New()
	job := &river.Job[ArgsRebuildTenantRatings]{JobRow: &rivertype.JobRow{
		Metadata: []byte(fmt.Sprintf(`{"output":{"generation_id":%q,"pages_processed":64}}`, generation)),
	}}
	require.Equal(t, 96, ratingPagesProcessed(job, generation, 32))
	require.Equal(t, 32, ratingPagesProcessed(job, uuid.New(), 32), "new generation starts at zero")
	require.Equal(t, 32, ratingPagesProcessed(&river.Job[ArgsRebuildTenantRatings]{}, generation, 32))
	job.Metadata = []byte(`{"output":{"generation_id":"not-a-uuid","pages_processed":64}}`)
	require.Equal(t, 32, ratingPagesProcessed(job, generation, 32))
}

type masteryProgressStore struct {
	database.Store
	total      int32
	done       int64
	totalCalls int
}

func (s *masteryProgressStore) CountTenantMasteryWindows(context.Context, database.CountTenantMasteryWindowsParams) (int32, error) {
	s.totalCalls++
	return s.total, nil
}
func (s *masteryProgressStore) CountCompletedTenantMasteryWindows(context.Context, database.CountCompletedTenantMasteryWindowsParams) (int64, error) {
	return s.done, nil
}

func TestRatingMasteryProgressKeepsGenerationBoundETA(t *testing.T) {
	t.Parallel()
	generation, tenant := uuid.New(), uuid.New()
	started := time.Date(2026, 11, 3, 0, 0, 0, 0, time.UTC)
	now := started.Add(10 * time.Second)
	store := &masteryProgressStore{total: 100, done: 30}
	worker := &WorkerRebuildTenantRatings{Store: store}
	cp := database.RatingRebuildCheckpoint{GenerationID: generation, TenantID: tenant, AsOf: database.Timestamptz(started)}
	job := &river.Job[ArgsRebuildTenantRatings]{JobRow: &rivertype.JobRow{Metadata: []byte(fmt.Sprintf(`{"output":{"generation_id":%q,"mastery_windows_total":100,"mastery_windows_at_start":10,"mastery_started_at":%q}}`, generation, started.Format(time.RFC3339Nano)))}}
	output := map[string]any{}
	worker.recordMasteryProgress(t.Context(), output, job, cp, now)
	require.Equal(t, int32(100), output["mastery_windows_total"])
	require.Equal(t, int64(30), output["mastery_windows_done"])
	require.Equal(t, int64(70), output["mastery_windows_remaining"])
	require.Equal(t, int64(35), output["mastery_eta_seconds"])
	require.Zero(t, store.totalCalls, "total is cached from the previous output")
	job.Metadata = nil
	output = map[string]any{}
	worker.recordMasteryProgress(t.Context(), output, job, cp, now)
	require.Equal(t, int64(70), output["mastery_windows_remaining"])
	require.NotContains(t, output, "mastery_eta_seconds", "one sample is not a rate")
	require.Equal(t, 1, store.totalCalls)
}
