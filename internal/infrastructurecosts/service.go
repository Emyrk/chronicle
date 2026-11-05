package infrastructurecosts

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"math"
	"slices"
	"time"

	"github.com/Emyrk/chronicle/chronicle/riverqueue/riverconst"
	"github.com/Emyrk/chronicle/database"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/riverqueue/river"
	"github.com/riverqueue/river/rivertype"
)

type Provider interface {
	PreviousPeriod(context.Context) (time.Time, time.Time, error)
	Fetch(context.Context, time.Time, time.Time) (ProviderUsage, []byte, error)
}

type Service struct {
	Store      database.Store
	Provider   Provider
	ServerType string
	Logger     *slog.Logger
}

type GenerateOptions struct {
	PeriodStart, PeriodEnd time.Time
	Force                  bool
}

func ts(t time.Time) pgtype.Timestamptz { return pgtype.Timestamptz{Time: t, Valid: true} }

func (s *Service) ResolvePeriod(ctx context.Context, start, end time.Time) (time.Time, time.Time, error) {
	if start.IsZero() != end.IsZero() {
		return time.Time{}, time.Time{}, errors.New("periodStart and periodEnd must be supplied together")
	}
	if start.IsZero() {
		return s.Provider.PreviousPeriod(ctx)
	}
	if !start.Before(end) {
		return time.Time{}, time.Time{}, errors.New("periodStart must be before periodEnd")
	}
	return start, end, nil
}

func percentile(sorted []int64, p float64) int64 {
	if len(sorted) == 0 {
		return 0
	}
	idx := int(math.Ceil(p*float64(len(sorted)))) - 1
	if idx < 0 {
		idx = 0
	}
	return sorted[idx]
}
func ratioTop(sortedDesc []int64, n int, total int64) float64 {
	if total <= 0 {
		return 0
	}
	if n > len(sortedDesc) {
		n = len(sortedDesc)
	}
	var v int64
	for _, x := range sortedDesc[:n] {
		v += x
	}
	return float64(v) / float64(total)
}
func unitEconomics(total int64, usage UsageSummary, allocations []UserAllocation) UnitEconomics {
	u := UnitEconomics{}
	if usage.UploadedLogGroups > 0 {
		u.CostPerLogMicrodollars = total / usage.UploadedLogGroups
	}
	if usage.ParsedInstances > 0 {
		u.CostPerParsedInstanceMicrodollars = total / usage.ParsedInstances
	}
	vals := []int64{}
	for _, a := range allocations {
		if a.ActiveUploader {
			vals = append(vals, a.TotalCostMicrodollars)
		}
	}
	slices.Sort(vals)
	if len(vals) > 0 {
		var sum int64
		for _, v := range vals {
			sum += v
		}
		u.ActiveDistribution = Distribution{sum / int64(len(vals)), percentile(vals, .5), percentile(vals, .75), percentile(vals, .95), percentile(vals, .99), vals[len(vals)-1]}
		slices.Reverse(vals)
		topCount := func(percent float64) int {
			return max(1, int(math.Ceil(float64(len(vals))*percent)))
		}
		u.Concentration = Concentration{
			ratioTop(vals, topCount(.01), sum),
			ratioTop(vals, topCount(.05), sum),
			ratioTop(vals, topCount(.10), sum),
		}
	}
	return u
}

func (s *Service) Generate(ctx context.Context, opts GenerateOptions) (database.InfrastructureCostReport, bool, error) {
	start, end, err := s.ResolvePeriod(ctx, opts.PeriodStart, opts.PeriodEnd)
	if err != nil {
		return database.InfrastructureCostReport{}, false, err
	}
	if !opts.Force {
		if existing, e := s.Store.GetLatestInfrastructureCostReportForPeriod(ctx, database.GetLatestInfrastructureCostReportForPeriodParams{PeriodStart: ts(start), PeriodEnd: ts(end)}); e == nil {
			return existing, false, nil
		} else if !errors.Is(e, pgx.ErrNoRows) {
			return database.InfrastructureCostReport{}, false, e
		}
	}
	providerUsage, payload, err := s.Provider.Fetch(ctx, start, end)
	if err != nil {
		return database.InfrastructureCostReport{}, false, fmt.Errorf("fetch railway usage: %w", err)
	}
	activityRows, err := s.Store.InfrastructureCostUserActivity(ctx, database.InfrastructureCostUserActivityParams{PeriodStart: ts(start), PeriodEnd: ts(end)})
	if err != nil {
		return database.InfrastructureCostReport{}, false, err
	}
	counts, err := s.Store.InfrastructureCostPeriodUserCounts(ctx, database.InfrastructureCostPeriodUserCountsParams{PeriodStart: ts(start), PeriodEnd: ts(end)})
	if err != nil {
		return database.InfrastructureCostReport{}, false, err
	}
	activity := make([]UserActivity, 0, len(activityRows))
	usage := UsageSummary{RegisteredUsersAtEnd: counts.RegisteredUsersAtEnd, NewUsers: counts.NewUsers}
	for _, r := range activityRows {
		a := UserActivity{r.UserID, r.UsernameSnapshot, r.ActiveUploader, r.UploadedFiles, r.UploadedLogGroups, r.UploadedRawBytes, r.UploadedStoredBytes, r.ParsedInstances, r.MonthlyParsedBytes, r.CurrentParsedBytes}
		activity = append(activity, a)
		usage.UploadedFiles += r.UploadedFiles
		usage.UploadCount += r.UploadedFiles
		usage.UploadedLogGroups += r.UploadedLogGroups
		usage.UploadedRawBytes += r.UploadedRawBytes
		usage.UploadedStoredBytes += r.UploadedStoredBytes
		usage.ParsedInstances += r.ParsedInstances
		usage.MonthlyParsedBytes += r.MonthlyParsedBytes
		usage.CurrentParsedBytes += r.CurrentParsedBytes
		if r.ActiveUploader {
			usage.ActiveUploaders++
		}
		if r.CurrentParsedBytes > 0 {
			usage.CurrentStorageOwners++
			if !r.ActiveUploader {
				usage.InactiveStorageOwners++
				usage.InactiveStorageBytes += r.CurrentParsedBytes
			}
		}
	}
	allocations, pools := Allocate(providerUsage.Costs, activity)
	now := time.Now().UTC()
	hash := sha256.Sum256(payload)
	hashHex := hex.EncodeToString(hash[:])
	id := uuid.New()
	var result database.InfrastructureCostReport
	inserted := false
	err = s.Store.InTx(ctx, func(tx database.Store) error {
		if err := tx.AcquireInfrastructureCostReportLock(ctx, database.AcquireInfrastructureCostReportLockParams{PeriodStart: start.Format(time.RFC3339Nano), PeriodEnd: end.Format(time.RFC3339Nano)}); err != nil {
			return err
		}
		latest, e := tx.GetLatestInfrastructureCostReportForPeriod(ctx, database.GetLatestInfrastructureCostReportForPeriodParams{PeriodStart: ts(start), PeriodEnd: ts(end)})
		rev := int32(1)
		if e == nil {
			if !opts.Force {
				result = latest
				return nil
			}
			rev = latest.Revision + 1
		} else if !errors.Is(e, pgx.ErrNoRows) {
			return e
		}
		var previous *int64
		if value, e := tx.PreviousInfrastructureCostReportTotal(ctx, ts(start)); e == nil {
			previous = &value
		} else if !errors.Is(e, pgx.ErrNoRows) {
			return e
		}
		warnings := append([]string{}, providerUsage.Warnings...)
		warnings = append(warnings, "Railway project spend is allocated using usage from this Chronicle deployment only.")
		if pools.UnattributedMicrodollars > 0 {
			warnings = append(warnings, "Some cost could not be attributed because an allocation pool had no eligible usage weight.")
		}
		report := Report{ID: id, PeriodStart: start, PeriodEnd: end, Revision: rev, Status: "published", GeneratedAt: now, StorageAsOf: now, Scope: Scope{providerUsage.ProjectName, s.ServerType, "partial"}, Costs: providerUsage.Costs, Pools: pools, Services: providerUsage.Services, Usage: usage, AllocationPolicy: AllocationPolicy{"USD", "integer microdollars", "memory + egress + unclassified equally across active uploaders", "CPU weighted by monthly parsed event bytes", "volume + backup weighted by current parsed event bytes", "deterministic largest remainder, user ID tie-break"}, Warnings: warnings, TotalCostMicrodollars: providerUsage.Costs.Total(), PreviousTotalCostMicrodollars: previous, Provider: "railway", ProviderPayloadSHA256: hashHex}
		report.UnitEconomics = unitEconomics(report.TotalCostMicrodollars, usage, allocations)
		reportJSON, e := json.Marshal(report)
		if e != nil {
			return e
		}
		result, e = tx.InsertInfrastructureCostReport(ctx, database.InsertInfrastructureCostReportParams{ID: id, PeriodStart: ts(start), PeriodEnd: ts(end), Revision: rev, Status: "published", StorageAsOf: ts(now), Provider: "railway", ProviderPayload: payload, ProviderPayloadSha256: hashHex, TotalCostMicrodollars: report.TotalCostMicrodollars, ActiveUploaderCount: usage.ActiveUploaders, StorageOwnerCount: usage.CurrentStorageOwners, WarningCount: int64(len(warnings)), Report: reportJSON})
		if e != nil {
			return e
		}
		for _, a := range allocations {
			if e := tx.InsertInfrastructureCostReportUser(ctx, database.InsertInfrastructureCostReportUserParams{ReportID: id, UserID: a.UserID, UsernameSnapshot: a.UsernameSnapshot, ActiveUploader: a.ActiveUploader, UploadedFiles: a.UploadedFiles, MonthlyParsedBytes: a.MonthlyParsedBytes, CurrentParsedBytes: a.CurrentParsedBytes, SharedCostMicrodollars: a.SharedCostMicrodollars, ActivityCostMicrodollars: a.ActivityCostMicrodollars, StorageCostMicrodollars: a.StorageCostMicrodollars, TotalCostMicrodollars: a.TotalCostMicrodollars}); e != nil {
				return e
			}
		}
		inserted = true
		return nil
	}, nil)
	return result, inserted, err
}

const KindGenerate = "infrastructure-cost-report-generate"

type ArgsGenerate struct {
	PeriodStart time.Time `json:"period_start,omitempty"`
	PeriodEnd   time.Time `json:"period_end,omitempty"`
	Force       bool      `json:"force,omitempty"`
}

func (ArgsGenerate) Kind() string { return KindGenerate }
func (a ArgsGenerate) InsertOpts() river.InsertOpts {
	return river.InsertOpts{Queue: river.QueueDefault, Priority: riverconst.PriorityLow, MaxAttempts: 5, UniqueOpts: river.UniqueOpts{ByArgs: true, ByState: []rivertype.JobState{rivertype.JobStateScheduled, rivertype.JobStatePending, rivertype.JobStateAvailable, rivertype.JobStateRunning, rivertype.JobStateRetryable}}}
}

type Worker struct {
	river.WorkerDefaults[ArgsGenerate]
	Service *Service
}

func (w *Worker) Work(ctx context.Context, job *river.Job[ArgsGenerate]) error {
	_, _, err := w.Service.Generate(ctx, GenerateOptions{job.Args.PeriodStart, job.Args.PeriodEnd, job.Args.Force})
	return err
}

type DailyUTCSchedule struct{}

func (DailyUTCSchedule) Next(current time.Time) time.Time {
	u := current.UTC()
	return time.Date(u.Year(), u.Month(), u.Day()+1, 0, 15, 0, 0, time.UTC)
}
