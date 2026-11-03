package api

import (
	"encoding/json"
	"net/http"
	"sort"
	"strconv"
	"time"

	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/api/httpapi"
	"github.com/Emyrk/chronicle/database"
)

// AdminListRatingRebuilds returns the most recent tenant rating rebuild jobs
// from River with their timings, flagging unusually slow ones.
//
//	GET /api/v1/admin/leaderboard/rating-rebuilds?limit=40
func (api *API) AdminListRatingRebuilds(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	limit := 40
	if raw := r.URL.Query().Get("limit"); raw != "" {
		parsed, err := strconv.Atoi(raw)
		if err != nil || parsed < 1 || parsed > 200 {
			httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{Message: "limit must be between 1 and 200"})
			return
		}
		limit = parsed
	}
	rows, err := api.Opts.Zed.AdminListRatingRebuildJobs(ctx, int32(limit))
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}
	httpapi.Write(ctx, w, http.StatusOK, ratingRebuildJobs(rows, time.Now()))
}

// ratingRebuildJobs turns River rows into timed jobs and flags slow ones.
func ratingRebuildJobs(rows []database.AdminListRatingRebuildJobsRow, now time.Time) chroniclesdk.AdminRatingRebuildJobsResponse {
	out := chroniclesdk.AdminRatingRebuildJobsResponse{Jobs: make([]chroniclesdk.AdminRatingRebuildJob, 0, len(rows))}
	var finished []float64
	for _, row := range rows {
		var output struct {
			Phase          string  `json:"phase"`
			Status         string  `json:"status"`
			PagesProcessed int64   `json:"pages_processed"`
			ElapsedSeconds float64 `json:"elapsed_seconds"`
			RecentRate     float64 `json:"recent_pages_per_second"`
			LastRate       float64 `json:"last_invocation_pages_per_second"`
		}
		_ = json.Unmarshal(row.Output, &output)
		job := chroniclesdk.AdminRatingRebuildJob{ID: row.ID, State: row.State, Attempt: row.Attempt, TenantID: row.TenantID,
			TenantName: row.TenantName, CreatedAt: row.CreatedAt.Time, Phase: output.Phase, Status: output.Status,
			PagesProcessed: output.PagesProcessed, PagesPerSecond: output.RecentRate, LastError: row.LastError}
		if job.PagesPerSecond == 0 {
			job.PagesPerSecond = output.LastRate
		}
		if row.AttemptedAt.Valid {
			t := row.AttemptedAt.Time
			job.AttemptedAt = &t
		}
		end := now
		if row.FinalizedAt.Valid {
			t := row.FinalizedAt.Time
			job.FinalizedAt, end = &t, t
		}
		// The worker records time since the rebuild started; River's own span adds queue waits.
		job.DurationSeconds = end.Sub(row.CreatedAt.Time).Seconds()
		if output.ElapsedSeconds > 0 {
			job.DurationSeconds = output.ElapsedSeconds
		}
		if row.State == "completed" {
			finished = append(finished, job.DurationSeconds)
		}
		out.Jobs = append(out.Jobs, job)
	}
	if len(finished) > 0 {
		sort.Float64s(finished)
		mid := len(finished) / 2
		out.MedianSeconds = finished[mid]
		if len(finished)%2 == 0 {
			out.MedianSeconds = (finished[mid-1] + finished[mid]) / 2
		}
		for i := range out.Jobs {
			d := out.Jobs[i].DurationSeconds
			out.Jobs[i].Slow = d > 60 && d > 2*out.MedianSeconds && out.Jobs[i].State != "cancelled"
		}
	}
	return out
}
