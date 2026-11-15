package serviceratings

import (
	"context"
	"sync"
	"testing"
	"time"

	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/dbtestutil"
	"github.com/Emyrk/chronicle/internal/testutil"
	"github.com/google/uuid"
	"github.com/riverqueue/river"
	"github.com/riverqueue/river/riverdriver/riverpgxv5"
	"github.com/riverqueue/river/rivertype"
	"github.com/stretchr/testify/require"
)

func TestHighlightHourBoundaries(t *testing.T) {
	t.Parallel()
	tenant := uuid.New()
	for _, input := range []string{"2026-01-01T12:00:00Z", "2026-01-01T12:59:59.999999999Z", "2026-01-01T18:15:00+05:30"} {
		now, err := time.Parse(time.RFC3339Nano, input)
		require.NoError(t, err)
		next := time.Date(2026, 1, 1, 13, 0, 0, 0, time.UTC)
		args := AutomaticHighlightDispatch(tenant, now)
		require.Equal(t, next, args.Boundary)
		require.Equal(t, next, args.insertOpts(now).ScheduledAt)
		require.Equal(t, next, (HighlightSchedule{}).Next(now))
		periodic := PeriodicHighlightDispatch(now)
		require.Equal(t, next.Add(-time.Hour), periodic.Boundary)
		require.False(t, periodic.insertOpts(now).ScheduledAt.After(now), "late periodic work must be immediately eligible")
	}
	require.True(t, (ArgsHighlightDispatch{TenantID: tenant}).InsertOpts().ScheduledAt.IsZero())
	require.Equal(t, 1, (ArgsHighlightRefresh{}).InsertOpts().MaxAttempts)
	require.Equal(t, 3, (ArgsHighlightDispatch{}).InsertOpts().MaxAttempts)
}

type highlightDispatchStore struct {
	highlightStore
	tenants []uuid.UUID
	realms  []uuid.UUID
}

func (s highlightDispatchStore) GetTenantByID(context.Context, uuid.UUID) (database.Tenant, error) {
	return database.Tenant{}, nil
}
func (s highlightDispatchStore) ListLeaderboardMetricTenants(context.Context, uuid.UUID) ([]uuid.UUID, error) {
	return s.tenants, nil
}
func (s highlightDispatchStore) LeaderboardHighlightRealms(context.Context, uuid.UUID) ([]uuid.UUID, error) {
	return s.realms, nil
}
func (s highlightDispatchStore) GetLeaderboardHighlightGeneration(context.Context, uuid.UUID) (int64, error) {
	return 1, nil
}
func (s highlightDispatchStore) ListLeaderboardHighlights(context.Context, database.ListLeaderboardHighlightsParams) ([]database.LeaderboardHighlight, error) {
	return nil, nil
}

type highlightConflictQueue struct {
	recordingQueue
	conflict bool
}

func (q *highlightConflictQueue) Insert(ctx context.Context, args river.JobArgs, opts *river.InsertOpts) (*rivertype.JobInsertResult, error) {
	result, err := q.recordingQueue.Insert(ctx, args, opts)
	if _, ok := args.(ArgsHighlightRefresh); ok {
		result.UniqueSkippedAsDuplicate = q.conflict
	}
	return result, err
}

func TestHighlightDispatchContinuationsAndConflict(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitShort)
	store := highlightDispatchStore{highlightStore: highlightStore{config: highlightConfig()}}
	for range 100 {
		store.tenants = append(store.tenants, uuid.New())
		store.realms = append(store.realms, uuid.New())
	}
	q := &highlightConflictQueue{}
	d := &HighlightDispatcher{Store: store, Queue: q}
	boundary := time.Date(2026, 1, 1, 12, 0, 0, 0, time.UTC)
	require.NoError(t, d.Work(ctx, &river.Job[ArgsHighlightDispatch]{Args: ArgsHighlightDispatch{Boundary: boundary}}))
	require.Len(t, q.jobs, 101)
	for _, job := range q.jobs {
		require.Equal(t, boundary, job.(ArgsHighlightDispatch).Boundary)
	}
	require.Equal(t, store.tenants[99], q.jobs[100].(ArgsHighlightDispatch).AfterTenant)
	q.jobs = nil
	args := ArgsHighlightDispatch{TenantID: store.tenants[0], Boundary: boundary}
	q.conflict = true
	require.ErrorIs(t, d.Work(ctx, &river.Job[ArgsHighlightDispatch]{Args: args}), errHighlightRefreshOutstanding)
	require.Len(t, q.jobs, 101, "conflicts must not prevent pagination")
	continuation := q.jobs[100].(ArgsHighlightDispatch)
	require.Equal(t, 100, continuation.Offset)
	require.Equal(t, boundary, continuation.Boundary)
	for _, job := range q.jobs[:100] {
		require.True(t, job.(ArgsHighlightRefresh).InsertOpts().ScheduledAt.IsZero())
	}
	q.jobs = nil
	q.conflict = false // existing leaf completed; the retry must attempt the stale scope again
	require.NoError(t, d.Work(ctx, &river.Job[ArgsHighlightDispatch]{Args: args}))
	require.Len(t, q.jobs, 101)
	q.jobs = nil
	require.NoError(t, d.Work(ctx, &river.Job[ArgsHighlightDispatch]{Args: continuation}))
	require.Len(t, q.jobs, 1)
}

func TestHighlightRiverUniqueness(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitLong)
	pool, _ := dbtestutil.NewPGXPool(t)
	client, err := river.NewClient(riverpgxv5.New(pool), &river.Config{SkipUnknownJobCheck: true})
	require.NoError(t, err)
	auto := AutomaticHighlightDispatch(uuid.New(), time.Now().Add(time.Hour))
	// Concurrent automatic nudges coalesce, but adjacent hours and admin do not.
	var wg sync.WaitGroup
	results := make([]*rivertype.JobInsertResult, 8)
	errs := make([]error, len(results))
	for i := range results {
		wg.Go(func() { results[i], errs[i] = client.Insert(ctx, auto, nil) })
	}
	wg.Wait()
	inserted := 0
	for i, r := range results {
		require.NoError(t, errs[i])
		if !r.UniqueSkippedAsDuplicate {
			inserted++
		}
		require.Equal(t, results[0].Job.ID, r.Job.ID)
	}
	require.Equal(t, 1, inserted)
	require.Equal(t, rivertype.JobStateScheduled, results[0].Job.State)
	periodic, err := client.Insert(ctx, PeriodicHighlightDispatch(time.Now().Add(-time.Minute)), nil)
	require.NoError(t, err)
	require.Equal(t, rivertype.JobStateAvailable, periodic.Job.State)
	admin, err := client.Insert(ctx, ArgsHighlightDispatch{TenantID: auto.TenantID}, nil)
	require.NoError(t, err)
	require.False(t, admin.UniqueSkippedAsDuplicate)
	adjacent := auto
	adjacent.Boundary = adjacent.Boundary.Add(time.Hour)
	next, err := client.Insert(ctx, adjacent, nil)
	require.NoError(t, err)
	require.False(t, next.UniqueSkippedAsDuplicate)
	// State transitions emulate River ownership without starting timing-sensitive workers.
	_, err = pool.Exec(ctx, `UPDATE river_job SET state='running',attempted_at=now() WHERE id=$1`, admin.Job.ID)
	require.NoError(t, err)
	duplicate, err := client.Insert(ctx, ArgsHighlightDispatch{TenantID: auto.TenantID}, nil)
	require.NoError(t, err)
	require.True(t, duplicate.UniqueSkippedAsDuplicate)
	_, err = pool.Exec(ctx, `UPDATE river_job SET state='completed',finalized_at=now() WHERE id=$1`, admin.Job.ID)
	require.NoError(t, err)
	replacement, err := client.Insert(ctx, ArgsHighlightDispatch{TenantID: auto.TenantID}, nil)
	require.NoError(t, err)
	require.False(t, replacement.UniqueSkippedAsDuplicate)
	leaf := ArgsHighlightRefresh{TenantID: auto.TenantID, Instance: "Fixture raid", Difficulty: "Normal", Size: 40}
	dispatcher := &HighlightDispatcher{
		Store: highlightDispatchStore{highlightStore: highlightStore{config: highlightConfig()}},
		Queue: client,
	}
	page := &river.Job[ArgsHighlightDispatch]{Args: ArgsHighlightDispatch{TenantID: auto.TenantID, Boundary: auto.Boundary}}
	first, err := client.Insert(ctx, leaf, nil)
	require.NoError(t, err)
	_, err = pool.Exec(ctx, `UPDATE river_job SET state='running',attempted_at=now() WHERE id=$1`, first.Job.ID)
	require.NoError(t, err)
	require.ErrorIs(t, dispatcher.Work(ctx, page), errHighlightRefreshOutstanding)
	for i := range results {
		wg.Go(func() { results[i], errs[i] = client.Insert(ctx, leaf, nil) })
	}
	wg.Wait()
	for i, r := range results {
		require.NoError(t, errs[i])
		require.True(t, r.UniqueSkippedAsDuplicate)
		require.Equal(t, first.Job.ID, r.Job.ID)
	}
	_, err = pool.Exec(ctx, `UPDATE river_job SET state='completed',finalized_at=now() WHERE id=$1`, first.Job.ID)
	require.NoError(t, err)
	// River's bounded retry rechecks this same page after the prior leaf finishes.
	require.NoError(t, dispatcher.Work(ctx, page))
	replacement, err = client.Insert(ctx, leaf, nil)
	require.NoError(t, err)
	require.True(t, replacement.UniqueSkippedAsDuplicate)
	require.NotEqual(t, first.Job.ID, replacement.Job.ID)
	for _, different := range []ArgsHighlightRefresh{
		{TenantID: uuid.New(), Instance: leaf.Instance, Difficulty: leaf.Difficulty, Size: leaf.Size},
		{TenantID: leaf.TenantID, RealmID: uuid.New(), Instance: leaf.Instance, Difficulty: leaf.Difficulty, Size: leaf.Size},
		{TenantID: leaf.TenantID, Instance: "Other", Difficulty: leaf.Difficulty, Size: leaf.Size},
		{TenantID: leaf.TenantID, Instance: leaf.Instance, Difficulty: "Heroic", Size: leaf.Size},
		{TenantID: leaf.TenantID, Instance: leaf.Instance, Difficulty: leaf.Difficulty, Size: 20},
	} {
		r, err := client.Insert(ctx, different, nil)
		require.NoError(t, err)
		require.False(t, r.UniqueSkippedAsDuplicate)
	}
}
