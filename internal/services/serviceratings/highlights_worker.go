package serviceratings

import (
	"context"
	"errors"
	"slices"
	"time"

	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/internal/services/servicetenant"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/riverqueue/river"
	"github.com/riverqueue/river/rivertype"
)

// HighlightSchedule aligns automatic refreshes to UTC hours, not process startup.
type HighlightSchedule struct{}

func (HighlightSchedule) Next(now time.Time) time.Time {
	return now.UTC().Truncate(time.Hour).Add(time.Hour)
}

// AutomaticHighlightDispatch coalesces nudges until the next UTC hour. Zero
// Boundary is reserved for immediate admin/legacy dispatches.
func AutomaticHighlightDispatch(tenant uuid.UUID, now time.Time) ArgsHighlightDispatch {
	return ArgsHighlightDispatch{TenantID: tenant, Boundary: (HighlightSchedule{}).Next(now)}
}

// PeriodicHighlightDispatch serves the current hour even if the scheduler is late.
// The periodic sweep may revisit a tenant whose scheduled nudge already completed.
// Accept that bounded two-source traversal: freshness checks skip current leaves.
// Completed jobs do not dedupe, so later admin requests can still repair changes.
func PeriodicHighlightDispatch(now time.Time) ArgsHighlightDispatch {
	// River v0.43's periodic enqueuer may invoke constructors up to 100ms
	// early. Select the upcoming boundary in that window so the sweep shares
	// the scheduled nudges' identity. Late invocations still use this hour.
	const earlyWindow = 100 * time.Millisecond
	return ArgsHighlightDispatch{Boundary: now.UTC().Add(earlyWindow).Truncate(time.Hour)}
}

type ArgsHighlightDispatch struct {
	Boundary    time.Time `json:"boundary,omitempty"`
	TenantID    uuid.UUID `json:"tenant_id"`
	AfterTenant uuid.UUID `json:"after_tenant"`
	Offset      int       `json:"offset"`
}

func (ArgsHighlightDispatch) Kind() string { return "leaderboard-highlights-dispatch" }
func (a ArgsHighlightDispatch) InsertOpts() river.InsertOpts {
	return a.insertOpts(time.Now())
}

func (a ArgsHighlightDispatch) insertOpts(now time.Time) river.InsertOpts {
	opts := insertOptions()
	// Keep repeated nudges coalesced while a conflicting leaf's page recheck
	// waits. This is dispatch-only; refresh leaves never retry.
	opts.UniqueOpts.ByState = append(opts.UniqueOpts.ByState, rivertype.JobStateRetryable)
	// River marks even past ScheduledAt values as scheduled. Omit the time
	// once due so periodic and continuation jobs are available immediately.
	if a.Boundary.After(now) {
		opts.ScheduledAt = a.Boundary
	}
	return opts
}

type ArgsHighlightRefresh struct {
	TenantID   uuid.UUID `json:"tenant_id"`
	RealmID    uuid.UUID `json:"realm_id"`
	Instance   string    `json:"instance"`
	Difficulty string    `json:"difficulty"`
	Size       int16     `json:"size"`
}

func (ArgsHighlightRefresh) Kind() string { return "leaderboard-highlights-refresh" }
func (ArgsHighlightRefresh) InsertOpts() river.InsertOpts {
	opts := insertOptions()
	opts.MaxAttempts = 1
	return opts
}

type highlightKey struct {
	instance   string
	difficulty string
	size       int16
}

type HighlightDispatcher struct {
	river.WorkerDefaults[ArgsHighlightDispatch]
	Store database.Store
	Queue JobInserter
}

// A conflicting leaf may have already read the old generation. Recheck the
// page after its one-minute timeout instead of losing the nudge. Normal River
// retries are bounded by the dispatcher's three attempts (no unbounded snooze).
// Queue delays or persistent failures can exhaust them; hourly sweeps repair
// remaining stale scopes. Refresh leaves retain MaxAttempts=1 and uniqueness.
func (*HighlightDispatcher) NextRetry(*river.Job[ArgsHighlightDispatch]) time.Time {
	return time.Now().Add(2 * time.Minute)
}

var errHighlightRefreshOutstanding = errors.New("highlight refresh outstanding; recheck dispatch page")

func (d *HighlightDispatcher) Work(ctx context.Context, j *river.Job[ArgsHighlightDispatch]) error {
	ctx, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()
	if j.Args.TenantID == uuid.Nil {
		tenants, err := d.Store.ListLeaderboardMetricTenants(servicetenant.AdminBypass(ctx), j.Args.AfterTenant)
		if err != nil {
			return err
		}
		for _, id := range tenants {
			if _, err = d.Queue.Insert(ctx, ArgsHighlightDispatch{TenantID: id, Boundary: j.Args.Boundary}, nil); err != nil {
				return err
			}
		}
		if len(tenants) == 100 {
			_, err = d.Queue.Insert(ctx, ArgsHighlightDispatch{AfterTenant: tenants[len(tenants)-1], Boundary: j.Args.Boundary}, nil)
		}
		return err
	}
	ctx = servicetenant.WithTenantID(ctx, j.Args.TenantID)
	config, cohorts, err := HighlightConfiguration(ctx, d.Store, j.Args.TenantID)
	if err != nil {
		return err
	}
	realms, err := d.Store.LeaderboardHighlightRealms(ctx, j.Args.TenantID)
	if err != nil {
		return err
	}
	realms = append([]uuid.UUID{uuid.Nil}, realms...)
	total := len(cohorts) * len(realms)
	if j.Args.Offset < 0 || j.Args.Offset >= total {
		return nil
	}
	end := min(total, j.Args.Offset+100)
	generation, err := d.Store.GetLeaderboardHighlightGeneration(ctx, j.Args.TenantID)
	if err != nil {
		return err
	}
	now := time.Now()
	conflict := false
	storedByRealm := make(map[uuid.UUID]map[highlightKey]database.LeaderboardHighlight)
	for i := j.Args.Offset; i < end; i++ {
		c := cohorts[i/len(realms)]
		realm := realms[i%len(realms)]
		stored, ok := storedByRealm[realm]
		if !ok {
			rows, listErr := d.Store.ListLeaderboardHighlights(ctx, database.ListLeaderboardHighlightsParams{TenantID: j.Args.TenantID, RealmScope: realm})
			if listErr != nil {
				return listErr
			}
			stored = make(map[highlightKey]database.LeaderboardHighlight, len(rows))
			for _, row := range rows {
				stored[highlightKey{row.InstanceName, row.DifficultyName, row.MaxPlayers}] = row
			}
			storedByRealm[realm] = stored
		}
		row, exists := stored[highlightKey{c.Instance, c.Difficulty, c.Size}]
		fingerprint := HighlightFingerprint(config, c)
		if exists && HighlightFresh(row.ConfigurationFingerprint, row.SourceGeneration, row.RefreshedAt.Time, fingerprint, generation, now) && !HighlightStatisticsDue(row.ConfigurationFingerprint, fingerprint, row.StatisticsRefreshedAt, now) {
			continue
		}
		result, insertErr := d.Queue.Insert(ctx, ArgsHighlightRefresh{TenantID: j.Args.TenantID, RealmID: realm, Instance: c.Instance, Difficulty: c.Difficulty, Size: c.Size}, nil)
		if insertErr != nil {
			return insertErr
		}
		conflict = conflict || result.UniqueSkippedAsDuplicate
	}
	if end < total {
		_, err = d.Queue.Insert(ctx, ArgsHighlightDispatch{TenantID: j.Args.TenantID, Offset: end, Boundary: j.Args.Boundary}, nil)
	}
	if err != nil {
		return err
	}
	if conflict {
		return errHighlightRefreshOutstanding
	}
	return nil
}

type HighlightWorker struct {
	river.WorkerDefaults[ArgsHighlightRefresh]
	Store database.Store
}

func (*HighlightWorker) Timeout(*river.Job[ArgsHighlightRefresh]) time.Duration {
	return time.Minute
}
func (w *HighlightWorker) Work(ctx context.Context, j *river.Job[ArgsHighlightRefresh]) error {
	if servicetenant.IsBypass(ctx) {
		return errors.New("highlight refresh requires tenant context")
	}
	ctx = servicetenant.WithTenantID(ctx, j.Args.TenantID)
	config, cohorts, err := HighlightConfiguration(ctx, w.Store, j.Args.TenantID)
	if err != nil {
		return err
	}
	cohort := HighlightCohort{j.Args.Instance, j.Args.Difficulty, j.Args.Size}
	if !slices.Contains(cohorts, cohort) {
		return nil
	}
	generation, err := w.Store.GetLeaderboardHighlightGeneration(ctx, j.Args.TenantID)
	if err != nil {
		return err
	}
	row, err := w.Store.GetLeaderboardHighlightFreshness(ctx, database.GetLeaderboardHighlightFreshnessParams{
		TenantID: j.Args.TenantID, RealmScope: j.Args.RealmID, InstanceName: cohort.Instance, DifficultyName: cohort.Difficulty, MaxPlayers: cohort.Size,
	})
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		return err
	}
	fingerprint := HighlightFingerprint(config, cohort)
	now := time.Now()
	if err == nil && HighlightFresh(row.ConfigurationFingerprint, row.SourceGeneration, row.RefreshedAt.Time, fingerprint, generation, now) && !HighlightStatisticsDue(row.ConfigurationFingerprint, fingerprint, row.StatisticsRefreshedAt, now) {
		return nil
	}
	return RefreshHighlights(ctx, w.Store, j.Args.TenantID, j.Args.RealmID, cohort)
}
