package api

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/chronicle/riverqueue"
	"github.com/Emyrk/chronicle/database/dbtestutil"
	"github.com/Emyrk/chronicle/internal/services/servicerankings"
	"github.com/Emyrk/chronicle/internal/testutil"
	"github.com/google/uuid"
	"github.com/riverqueue/river"
	"github.com/riverqueue/river/riverdriver/riverpgxv5"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestAdminRankingRunSummaryStatus(t *testing.T) {
	t.Parallel()

	pool, _ := dbtestutil.NewPGXPool(t)
	ctx := testutil.Context(t, testutil.WaitShort)
	oldest := time.Now().Add(-2 * time.Minute)
	_, err := pool.Exec(ctx, `
		INSERT INTO ranking_run_summary_dirty (run_id, generation, last_transaction_id, updated_at)
		VALUES ($1, 1, pg_current_xact_id(), $2), ($3, 1, pg_current_xact_id(), now())
	`, uuid.New(), oldest, uuid.New())
	require.NoError(t, err)

	api := &API{Opts: &Options{Pool: pool}}
	recorder := httptest.NewRecorder()
	api.AdminRankingRunSummaryStatus(recorder, httptest.NewRequest(http.MethodGet, "/api/v1/admin/parses/ranking-run-summaries/status", nil))
	require.Equal(t, http.StatusOK, recorder.Code)

	var response chroniclesdk.AdminRankingRunSummaryStatusResponse
	require.NoError(t, json.NewDecoder(recorder.Body).Decode(&response))
	assert.Equal(t, int64(2), response.QueueDepth)
	require.NotNil(t, response.OldestDirtyAt)
	assert.WithinDuration(t, oldest, *response.OldestDirtyAt, time.Second)
	assert.GreaterOrEqual(t, response.OldestDirtyAgeSeconds, 119.0)
	assert.Equal(t, servicerankings.RankingPlayerRunSummaryVersion(), response.SummaryVersion)
	assert.False(t, response.ObservedAt.IsZero())
}

func TestAdminRebuildRankingRunSummaries(t *testing.T) {
	t.Parallel()

	pool, _ := dbtestutil.NewPGXPool(t)
	client, err := river.NewClient(riverpgxv5.New(pool), &river.Config{})
	require.NoError(t, err)

	api := &API{Queues: &riverqueue.Queues{Client: client}}
	post := func() chroniclesdk.AdminRankingRunSummaryRebuildResponse {
		t.Helper()
		recorder := httptest.NewRecorder()
		api.AdminRebuildRankingRunSummaries(recorder, httptest.NewRequest(http.MethodPost, "/api/v1/admin/parses/ranking-run-summaries/rebuild", nil))
		require.Equal(t, http.StatusAccepted, recorder.Code)
		var response chroniclesdk.AdminRankingRunSummaryRebuildResponse
		require.NoError(t, json.NewDecoder(recorder.Body).Decode(&response))
		return response
	}

	first := post()
	assert.Positive(t, first.Job.ID)
	assert.Equal(t, "rebuild-ranking-run-summaries", first.Job.Kind)
	assert.Equal(t, riverqueue.QueueRankings, first.Job.Queue)
	assert.Equal(t, "available", first.Job.State)
	assert.False(t, first.Job.UniqueSkippedAsDuplicate)

	second := post()
	assert.Equal(t, first.Job.ID, second.Job.ID)
	assert.True(t, second.Job.UniqueSkippedAsDuplicate)
}
