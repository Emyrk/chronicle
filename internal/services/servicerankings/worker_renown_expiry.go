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

const renownExpiryPageSize int32 = 200

// ArgsExpireTenantRenown scans active period scores in bounded keyset pages.
// Historical facts are never deleted: career Renown remains repairable.
type ArgsExpireTenantRenown struct {
	TenantID       uuid.UUID `json:"tenant_id"`
	AsOf           time.Time `json:"as_of"`
	SubjectKind    string    `json:"subject_kind"`
	AfterRealm     uuid.UUID `json:"after_realm"`
	AfterPlayer    string    `json:"after_player"`
	AfterGuild     uuid.UUID `json:"after_guild"`
	AfterInstance  string    `json:"after_instance"`
	AfterEncounter string    `json:"after_encounter"`
}

func (ArgsExpireTenantRenown) Kind() string { return "expire-tenant-renown" }
func (ArgsExpireTenantRenown) InsertOpts() river.InsertOpts {
	return river.InsertOpts{Queue: riverconst.QueueRankings, Priority: riverconst.PriorityLow, MaxAttempts: 10,
		UniqueOpts: river.UniqueOpts{ByArgs: true, ByState: ratingActiveJobStates}}
}

type WorkerExpireTenantRenown struct {
	river.WorkerDefaults[ArgsExpireTenantRenown]
	Store   database.Store
	Queue   *riverqueue.Queues
	enqueue func(context.Context, ArgsExpireTenantRenown) error
}

func (w *WorkerExpireTenantRenown) Work(ctx context.Context, job *river.Job[ArgsExpireTenantRenown]) error {
	if skip, err := skipDisabledRootRatings(ctx, w.Store, job.Args.TenantID); err != nil || skip {
		return err
	}
	args := job.Args
	if args.AsOf.IsZero() {
		return fmt.Errorf("renown expiry requires a fixed cutoff")
	}
	if args.TenantID == uuid.Nil {
		ctx = servicetenant.AdminBypass(ctx)
	} else {
		ctx = servicetenant.WithTenantID(ctx, args.TenantID)
	}
	periodStart := database.Timestamptz(args.AsOf.AddDate(0, 0, -180))
	next := args
	switch args.SubjectKind {
	case "", "player":
		rows, err := w.Store.ListPlayerRenownExpiryPage(ctx, database.ListPlayerRenownExpiryPageParams{
			TenantID: args.TenantID, PeriodStart: periodStart, AfterRealmID: args.AfterRealm,
			AfterPlayerGuid: args.AfterPlayer, AfterInstanceName: args.AfterInstance,
			AfterEncounterName: args.AfterEncounter, BatchSize: renownExpiryPageSize,
		})
		if err != nil {
			return err
		}
		for _, row := range rows {
			if row.Expired {
				if err := w.Store.MarkDirtyRenownSubject(ctx, database.MarkDirtyRenownSubjectParams{
					TenantID: args.TenantID, SubjectKind: "player", RealmID: row.RealmID,
					SubjectID: row.PlayerGuid, InstanceName: row.InstanceName,
					EncounterName: row.EncounterName,
				}); err != nil {
					return err
				}
			}
		}
		if len(rows) == int(renownExpiryPageSize) {
			last := rows[len(rows)-1]
			next.SubjectKind, next.AfterRealm, next.AfterPlayer = "player", last.RealmID, last.PlayerGuid
			next.AfterInstance, next.AfterEncounter = last.InstanceName, last.EncounterName
		} else {
			next.SubjectKind, next.AfterRealm, next.AfterPlayer = "guild", uuid.Nil, ""
			next.AfterInstance, next.AfterEncounter = "", ""
		}
	case "guild":
		rows, err := w.Store.ListGuildRenownExpiryPage(ctx, database.ListGuildRenownExpiryPageParams{
			TenantID: args.TenantID, PeriodStart: periodStart, AfterRealmID: args.AfterRealm,
			AfterGuildID: args.AfterGuild, AfterInstanceName: args.AfterInstance,
			AfterEncounterName: args.AfterEncounter, BatchSize: renownExpiryPageSize,
		})
		if err != nil {
			return err
		}
		for _, row := range rows {
			if row.Expired {
				if err := w.Store.MarkDirtyRenownSubject(ctx, database.MarkDirtyRenownSubjectParams{
					TenantID: args.TenantID, SubjectKind: "guild", RealmID: row.RealmID,
					SubjectID: row.GuildID.String(), InstanceName: row.InstanceName,
					EncounterName: row.EncounterName,
				}); err != nil {
					return err
				}
			}
		}
		if len(rows) < int(renownExpiryPageSize) {
			return nil
		}
		last := rows[len(rows)-1]
		next.AfterRealm, next.AfterGuild = last.RealmID, last.GuildID
		next.AfterInstance, next.AfterEncounter = last.InstanceName, last.EncounterName
	default:
		return fmt.Errorf("invalid Renown expiry subject kind %q", args.SubjectKind)
	}
	if w.enqueue != nil {
		return w.enqueue(ctx, next)
	}
	if w.Queue == nil {
		return fmt.Errorf("renown expiry queue unavailable")
	}
	_, err := w.Queue.Insert(ctx, next, nil)
	return err
}

type ArgsDispatchRenownExpiry struct{}

func (ArgsDispatchRenownExpiry) Kind() string { return "dispatch-renown-expiry" }
func (ArgsDispatchRenownExpiry) InsertOpts() river.InsertOpts {
	return river.InsertOpts{Queue: riverconst.QueueRankings, Priority: riverconst.PriorityLow, MaxAttempts: 10,
		UniqueOpts: river.UniqueOpts{ByState: ratingActiveJobStates}}
}

type WorkerDispatchRenownExpiry struct {
	river.WorkerDefaults[ArgsDispatchRenownExpiry]
	Store database.Store
	Queue *riverqueue.Queues
}

func (w *WorkerDispatchRenownExpiry) Work(ctx context.Context, _ *river.Job[ArgsDispatchRenownExpiry]) error {
	if w.Queue == nil {
		return fmt.Errorf("renown expiry queue unavailable")
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
		if _, err := w.Queue.Insert(ctx, ArgsExpireTenantRenown{TenantID: tenant.UUID, AsOf: asOf}, nil); err != nil {
			return err
		}
	}
	return nil
}
