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
)

type ArgsHighlightDispatch struct {
	TenantID    uuid.UUID `json:"tenant_id"`
	AfterTenant uuid.UUID `json:"after_tenant"`
	Offset      int       `json:"offset"`
}

func (ArgsHighlightDispatch) Kind() string                 { return "leaderboard-highlights-dispatch" }
func (ArgsHighlightDispatch) InsertOpts() river.InsertOpts { return insertOptions() }

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

func (d *HighlightDispatcher) Work(ctx context.Context, j *river.Job[ArgsHighlightDispatch]) error {
	ctx, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()
	if j.Args.TenantID == uuid.Nil {
		tenants, err := d.Store.ListLeaderboardMetricTenants(servicetenant.AdminBypass(ctx), j.Args.AfterTenant)
		if err != nil {
			return err
		}
		for _, id := range tenants {
			if _, err = d.Queue.Insert(ctx, ArgsHighlightDispatch{TenantID: id}, nil); err != nil {
				return err
			}
		}
		if len(tenants) == 100 {
			_, err = d.Queue.Insert(ctx, ArgsHighlightDispatch{AfterTenant: tenants[len(tenants)-1]}, nil)
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
		if exists && HighlightFresh(row.ConfigurationFingerprint, row.SourceGeneration, row.RefreshedAt.Time, fingerprint, generation, now) {
			continue
		}
		if _, err = d.Queue.Insert(ctx, ArgsHighlightRefresh{TenantID: j.Args.TenantID, RealmID: realm, Instance: c.Instance, Difficulty: c.Difficulty, Size: c.Size}, nil); err != nil {
			return err
		}
	}
	if end < total {
		_, err = d.Queue.Insert(ctx, ArgsHighlightDispatch{TenantID: j.Args.TenantID, Offset: end}, nil)
	}
	return err
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
	if err == nil && HighlightFresh(row.ConfigurationFingerprint, row.SourceGeneration, row.RefreshedAt.Time, HighlightFingerprint(config, cohort), generation, time.Now()) {
		return nil
	}
	return RefreshHighlights(ctx, w.Store, j.Args.TenantID, j.Args.RealmID, cohort)
}
