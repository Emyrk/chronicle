package api

import (
	"strconv"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgtype"
	"github.com/stretchr/testify/require"

	"github.com/Emyrk/chronicle/database"
)

func TestRatingRebuildJobs(t *testing.T) {
	t.Parallel()
	now := time.Date(2026, 11, 3, 12, 0, 0, 0, time.UTC)
	at := func(minutesAgo int) pgtype.Timestamptz {
		return pgtype.Timestamptz{Time: now.Add(-time.Duration(minutesAgo) * time.Minute), Valid: true}
	}
	done := func(id int64, seconds float64) database.AdminListRatingRebuildJobsRow {
		return database.AdminListRatingRebuildJobsRow{ID: id, State: "completed", CreatedAt: at(60), FinalizedAt: at(50),
			Output: []byte(`{"phase":"complete","status":"complete","pages_processed":120,"elapsed_seconds":` + strconv.FormatFloat(seconds, 'f', -1, 64) + `}`)}
	}
	rows := []database.AdminListRatingRebuildJobsRow{
		// Still building for 40 minutes, with no recorded elapsed time yet.
		{ID: 5, State: "scheduled", CreatedAt: at(40), Output: []byte(`{"phase":"mastery_pending","recent_pages_per_second":3.5}`)},
		done(4, 100), done(3, 120), done(2, 900), done(1, 110),
	}
	out := ratingRebuildJobs(rows, now)
	require.Len(t, out.Jobs, 5)
	require.InDelta(t, 115, out.MedianSeconds, 1e-9) // median of 100, 110, 120, 900
	require.InDelta(t, 2400, out.Jobs[0].DurationSeconds, 1e-9, "unfinished: creation to now")
	require.True(t, out.Jobs[0].Slow, "a rebuild running far past the median is slow")
	require.Equal(t, "mastery_pending", out.Jobs[0].Phase)
	require.InDelta(t, 3.5, out.Jobs[0].PagesPerSecond, 1e-9)
	require.False(t, out.Jobs[1].Slow)
	require.True(t, out.Jobs[3].Slow, "900s is over twice the median")
	require.InDelta(t, 900, out.Jobs[3].DurationSeconds, 1e-9, "the worker's elapsed time wins over River's span")
}
