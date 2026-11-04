package servicerankings

import (
	"context"
	"fmt"
	"time"

	"github.com/Emyrk/chronicle/chronicle/riverqueue"
	"github.com/Emyrk/chronicle/chronicle/riverqueue/riverconst"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/internal/services/servicetenant"
	"github.com/google/uuid"
	"github.com/riverqueue/river"
)

const masteryExpiryPageSize int32 = 200

type ArgsExpireTenantMastery struct {
	TenantID        uuid.UUID `json:"tenant_id"`
	AsOf            time.Time `json:"as_of"`
	SubjectKind     string    `json:"subject_kind"`
	AfterRealm      uuid.UUID `json:"after_realm"`
	AfterPlayer     string    `json:"after_player"`
	AfterGuild      uuid.UUID `json:"after_guild"`
	AfterInstance   string    `json:"after_instance"`
	AfterBoss       string    `json:"after_boss"`
	AfterDifficulty string    `json:"after_difficulty"`
	AfterSize       int16     `json:"after_size"`
	AfterClass      string    `json:"after_class"`
	AfterSpec       string    `json:"after_spec"`
	AfterSubSpec    string    `json:"after_sub_spec"`
	AfterMetric     string    `json:"after_metric"`
}

func (ArgsExpireTenantMastery) Kind() string { return "expire-tenant-mastery" }
func (ArgsExpireTenantMastery) InsertOpts() river.InsertOpts {
	return river.InsertOpts{Queue: riverconst.QueueRankings, Priority: riverconst.PriorityLow, MaxAttempts: 10,
		UniqueOpts: river.UniqueOpts{ByArgs: true, ByState: ratingActiveJobStates}}
}

type WorkerExpireTenantMastery struct {
	river.WorkerDefaults[ArgsExpireTenantMastery]
	Store database.Store
	Queue *riverqueue.Queues
}

func (w *WorkerExpireTenantMastery) Work(ctx context.Context, job *river.Job[ArgsExpireTenantMastery]) error {
	args := job.Args
	if args.AsOf.IsZero() {
		return fmt.Errorf("mastery expiry requires a fixed cutoff")
	}
	if args.TenantID == uuid.Nil {
		ctx = servicetenant.AdminBypass(ctx)
	} else {
		ctx = servicetenant.WithTenantID(ctx, args.TenantID)
	}
	if w.Queue == nil {
		return fmt.Errorf("mastery expiry queue unavailable")
	}
	start := database.Timestamptz(args.AsOf.AddDate(0, 0, -180))
	next := args
	switch args.SubjectKind {
	case "", "player":
		rows, err := w.Store.ListPlayerLiveMasteryExpiryPage(ctx, database.ListPlayerLiveMasteryExpiryPageParams{
			TenantID: args.TenantID, PeriodStart: start, AfterRealmID: args.AfterRealm,
			AfterPlayerGuid: args.AfterPlayer, AfterInstanceName: args.AfterInstance,
			AfterEncounterName: args.AfterBoss, AfterDifficultyName: args.AfterDifficulty,
			AfterMaxPlayers: args.AfterSize, AfterPlayerClass: args.AfterClass,
			AfterPlayerSpec: args.AfterSpec, AfterPlayerSubSpec: args.AfterSubSpec,
			AfterPerformanceMetric: args.AfterMetric, BatchSize: masteryExpiryPageSize,
		})
		if err != nil {
			return err
		}
		for _, row := range rows {
			if err := w.Store.MarkDirtyMasterySubject(ctx, database.MarkDirtyMasterySubjectParams{
				TenantID: args.TenantID, SubjectKind: "player", RealmID: row.RealmID,
				SubjectID: row.PlayerGuid, InstanceName: row.InstanceName,
				EncounterName: row.EncounterName, DifficultyName: row.DifficultyName,
				MaxPlayers: row.MaxPlayers, PlayerClass: row.PlayerClass,
				PlayerSpec: row.PlayerSpec, PlayerSubSpec: row.PlayerSubSpec,
				PerformanceMetric: row.PerformanceMetric,
			}); err != nil {
				return err
			}
		}
		if len(rows) == int(masteryExpiryPageSize) {
			last := rows[len(rows)-1]
			next.SubjectKind, next.AfterRealm, next.AfterPlayer = "player", last.RealmID, last.PlayerGuid
			next.AfterInstance, next.AfterBoss, next.AfterDifficulty = last.InstanceName, last.EncounterName, last.DifficultyName
			next.AfterSize, next.AfterClass, next.AfterSpec = last.MaxPlayers, last.PlayerClass, last.PlayerSpec
			next.AfterSubSpec, next.AfterMetric = last.PlayerSubSpec, last.PerformanceMetric
		} else {
			next = ArgsExpireTenantMastery{TenantID: args.TenantID, AsOf: args.AsOf, SubjectKind: "guild"}
		}
	case "guild":
		rows, err := w.Store.ListGuildLiveMasteryExpiryPage(ctx, database.ListGuildLiveMasteryExpiryPageParams{
			TenantID: args.TenantID, PeriodStart: start, AfterRealmID: args.AfterRealm,
			AfterGuildID: args.AfterGuild, AfterInstanceName: args.AfterInstance,
			AfterEncounterName: args.AfterBoss, AfterDifficultyName: args.AfterDifficulty,
			AfterMaxPlayers: args.AfterSize, BatchSize: masteryExpiryPageSize,
		})
		if err != nil {
			return err
		}
		for _, row := range rows {
			if err := w.Store.MarkDirtyMasterySubject(ctx, database.MarkDirtyMasterySubjectParams{
				TenantID: args.TenantID, SubjectKind: "guild", RealmID: row.RealmID,
				SubjectID: row.GuildID.String(), InstanceName: row.InstanceName,
				EncounterName: row.EncounterName, DifficultyName: row.DifficultyName,
				MaxPlayers: row.MaxPlayers, PerformanceMetric: "none",
			}); err != nil {
				return err
			}
		}
		if len(rows) < int(masteryExpiryPageSize) {
			return nil
		}
		last := rows[len(rows)-1]
		next.AfterRealm, next.AfterGuild = last.RealmID, last.GuildID
		next.AfterInstance, next.AfterBoss, next.AfterDifficulty = last.InstanceName, last.EncounterName, last.DifficultyName
		next.AfterSize = last.MaxPlayers
	default:
		return fmt.Errorf("invalid mastery expiry subject kind %q", args.SubjectKind)
	}
	_, err := w.Queue.Insert(ctx, next, nil)
	return err
}

type ArgsDispatchMasteryExpiry struct{}

func (ArgsDispatchMasteryExpiry) Kind() string { return "dispatch-mastery-expiry" }
func (ArgsDispatchMasteryExpiry) InsertOpts() river.InsertOpts {
	return river.InsertOpts{Queue: riverconst.QueueRankings, Priority: riverconst.PriorityLow, MaxAttempts: 10,
		UniqueOpts: river.UniqueOpts{ByState: ratingActiveJobStates}}
}

type WorkerDispatchMasteryExpiry struct {
	river.WorkerDefaults[ArgsDispatchMasteryExpiry]
	Store database.Store
	Queue *riverqueue.Queues
}

func (w *WorkerDispatchMasteryExpiry) Work(ctx context.Context, _ *river.Job[ArgsDispatchMasteryExpiry]) error {
	if w.Queue == nil {
		return fmt.Errorf("mastery expiry queue unavailable")
	}
	ctx = servicetenant.AdminBypass(ctx)
	tenants, err := w.Store.ListRatingTenants(ctx)
	if err != nil {
		return err
	}
	asOf := time.Now().UTC()
	for _, tenant := range tenants {
		if !tenant.Valid {
			return fmt.Errorf("rating tenant enumeration returned null")
		}
		if _, err := w.Queue.Insert(ctx, ArgsExpireTenantMastery{TenantID: tenant.UUID, AsOf: asOf}, nil); err != nil {
			return err
		}
	}
	return nil
}
