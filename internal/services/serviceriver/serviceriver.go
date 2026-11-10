package serviceriver

import (
	"context"
	"fmt"
	"time"

	"github.com/Emyrk/chronicle/chronicle"
	"github.com/Emyrk/chronicle/chronicle/custompanel"
	"github.com/Emyrk/chronicle/chronicle/guildanalytics"
	"github.com/Emyrk/chronicle/chronicle/retention"
	"github.com/Emyrk/chronicle/chronicle/riverqueue"
	"github.com/Emyrk/chronicle/chronicle/riverqueue/rankingargs"
	"github.com/Emyrk/chronicle/chroniclebot"
	"github.com/Emyrk/chronicle/internal/billing"
	"github.com/Emyrk/chronicle/internal/cosmetics"
	"github.com/Emyrk/chronicle/internal/ratelimit"
	"github.com/Emyrk/chronicle/internal/services"
	"github.com/Emyrk/chronicle/internal/services/serviceaccessurl"
	"github.com/Emyrk/chronicle/internal/services/serviceauthz"
	"github.com/Emyrk/chronicle/internal/services/servicebilling"
	"github.com/Emyrk/chronicle/internal/services/servicebot"
	"github.com/Emyrk/chronicle/internal/services/servicechronicle"
	"github.com/Emyrk/chronicle/internal/services/servicedbstore"
	"github.com/Emyrk/chronicle/internal/services/servicelogger"
	"github.com/Emyrk/chronicle/internal/services/servicepgxpool"
	"github.com/Emyrk/chronicle/internal/services/serviceprometheus"
	"github.com/Emyrk/chronicle/internal/services/servicerankings"
	"github.com/Emyrk/chronicle/internal/services/serviceratings"
	"github.com/Emyrk/chronicle/internal/services/serviceretention"
	"github.com/Emyrk/chronicle/internal/services/servicetelemetry"
	"github.com/google/uuid"
	"github.com/riverqueue/river"

	"github.com/coder/serpent"
)

var _ services.Servicer = (*Service)(nil)

func RiverQueue(broker *services.Services) *riverqueue.Queues {
	srv := services.MustGet[*Service](broker)
	return srv.Queues
}

func OnRiverQueue() string {
	return (&Service{}).Name()
}

type Service struct {
	broker *services.Services

	*riverqueue.Queues
	logParsingWorkers int64
	rankingWorkers    int64
}

func New(broker *services.Services) *Service {
	return &Service{
		broker: broker,
	}
}

func (s *Service) Name() string {
	return services.ServiceRiverQueue
}

func (s *Service) DependsOn() []string {
	return []string{
		servicelogger.OnLogger(),
		serviceaccessurl.OnAccessURL(),
		servicepgxpool.OnPGXPool(),
		serviceprometheus.OnPrometheus(),
		servicebilling.OnBilling(),
		serviceauthz.OnAuthz(),
		servicedbstore.OnDatabaseStore(),
		servicechronicle.OnChronicle(),
		servicebot.OnDiscordBot(),
		serviceretention.OnRetention(),
		servicetelemetry.OnTelemetry(),
		servicerankings.OnRankings(),
		serviceratings.OnRatings(),
	}
}

func (s *Service) Start(ctx context.Context) error {
	logger := servicelogger.Logger(s.broker)
	pool := servicepgxpool.PGXPool(s.broker)
	chron := servicechronicle.Chronicle(s.broker)

	q, err := riverqueue.New(ctx, riverqueue.Options{
		Logger:            logger,
		Pool:              pool,
		Registry:          serviceprometheus.Registry(s.broker),
		LogParsingWorkers: int(s.logParsingWorkers),
		InsertOnly:        false,
	})
	if err != nil {
		return fmt.Errorf("creating river queues: %w", err)
	}

	bot := servicebot.DiscordBot(s.broker)

	q.AddQueue(riverqueue.QueueLogParsing, river.QueueConfig{
		MaxWorkers: int(s.logParsingWorkers),
	})
	q.AddQueue(riverqueue.QueueDiscordSync, river.QueueConfig{
		MaxWorkers: 2,
	})
	q.AddQueue(riverqueue.QueueDiscordAnnouncements, river.QueueConfig{
		MaxWorkers: 1,
	})

	riverqueue.AddWorker(q, chron.NewWorkerLogParse())
	riverqueue.AddWorker(q, chron.NewWorkerReLogParse())
	riverqueue.AddWorker(q, chron.NewWorkerRegressionSnapshot())
	var leaveDiscordGuild func(string) error
	if !bot.Disabled() {
		leaveDiscordGuild = bot.LeaveGuild
	}
	riverqueue.AddWorker(q, chron.NewWorkerAccountPurge(leaveDiscordGuild, func(ctx context.Context, purge chronicle.AccountPurgeNotification) error {
		return chroniclebot.EnqueueAdminNotification(ctx, q, bot, accountPurgeNotificationArgs(purge))
	}))
	if !bot.Disabled() {
		bot.SetQueue(q)
		riverqueue.AddWorker(q, bot.NewWorkerSyncDiscordUser())
		riverqueue.AddWorker(q, bot.NewWorkerNotifyApplication())
		riverqueue.AddWorker(q, bot.NewWorkerSendDiscordDM())
		// Keep the specialized worker registered to drain jobs queued before DMs
		// moved to the shared worker.
		riverqueue.AddWorker(q, bot.NewWorkerNotifyCharacterLinkDecision())
		riverqueue.AddWorker(q, bot.NewWorkerNotifyAdmin())
		riverqueue.AddWorker(q, bot.NewWorkerAnnounceRaidLog())
		riverqueue.AddWorker(q, bot.NewWorkerNotifyUploadProcessed())
		riverqueue.AddWorker(q, bot.NewWorkerDispatchDiscordMembershipGrantChecks())
		riverqueue.AddWorker(q, bot.NewWorkerCheckDiscordMembershipGrant())
		q.AddPeriodicJob(
			river.NewPeriodicJob(
				river.PeriodicInterval(time.Hour),
				func() (river.JobArgs, *river.InsertOpts) {
					return chroniclebot.ArgsDispatchDiscordMembershipGrantChecks{}, nil
				},
				&river.PeriodicJobOpts{RunOnStart: true},
			),
		)
	}

	// Register billing reconciliation before the queue starts.
	billingService := servicebilling.BillingService(s.broker)
	riverqueue.AddWorker(q, billingService.Worker)
	q.AddPeriodicJob(
		river.NewPeriodicJob(
			river.PeriodicInterval(servicebilling.ReconciliationSchedule),
			func() (river.JobArgs, *river.InsertOpts) {
				return billing.ArgsReconcileSubscriptions{}, nil
			},
			&river.PeriodicJobOpts{ID: "billing-subscription-reconciliation", RunOnStart: true},
		),
	)

	billingService.Billing.SetSubscriptionChangeNotifier(func(ctx context.Context, change billing.SubscriptionChangeNotification) error {
		return chroniclebot.EnqueueAdminNotification(ctx, q, bot, billingSubscriptionNotificationArgs(serviceaccessurl.AccessURL(s.broker), change))
	})

	billingService.Billing.SetDiscordRoleSyncEnqueuer(bot.EnqueueEntitlementRoleSync)

	// Register character cosmetic audits. The daily dispatcher repairs missed
	// event-driven audits without producing a deployment-time burst.
	cosmeticStore := servicedbstore.DatabaseStore(s.broker)
	cosmeticAuthz := serviceauthz.Authz(s.broker)
	cosmeticAuditWorker := &cosmetics.WorkerAuditUser{Store: cosmeticStore, Authz: cosmeticAuthz}
	cosmeticDispatchWorker := &cosmetics.WorkerDispatchAudits{Store: cosmeticStore, Queue: q}
	riverqueue.AddWorker(q, cosmeticAuditWorker)
	riverqueue.AddWorker(q, cosmeticDispatchWorker)
	q.AddPeriodicJob(
		river.NewPeriodicJob(
			river.PeriodicInterval(24*time.Hour),
			func() (river.JobArgs, *river.InsertOpts) {
				return cosmetics.ArgsDispatchAudits{}, nil
			},
			&river.PeriodicJobOpts{ID: "cosmetics-daily-audit", RunOnStart: false},
		),
	)
	billingService.Billing.SetCosmeticAuditEnqueuer(func(ctx context.Context, userID uuid.UUID) error {
		return cosmetics.EnqueueUserAudit(ctx, q, userID)
	})

	// Source-integrated D1/D2 dispatch is enabled. Periodic scans only existing
	// dirt; no startup discovery or historical backfill is scheduled.
	ratings := serviceratings.Ratings(s.broker)
	ratings.Dispatcher.Queue = q
	ratings.CareerDispatcher.Queue = q
	riverqueue.AddWorker(q, ratings.CareerDispatcher)
	riverqueue.AddWorker(q, ratings.CareerDrainWorker)
	q.AddPeriodicJob(river.NewPeriodicJob(river.PeriodicInterval(30*time.Second), func() (river.JobArgs, *river.InsertOpts) { return serviceratings.ArgsCareerDispatch{}, nil }, &river.PeriodicJobOpts{ID: "leaderboard-career-dispatch", RunOnStart: false}))
	q.AddPeriodicJob(river.NewPeriodicJob(river.PeriodicInterval(time.Hour), func() (river.JobArgs, *river.InsertOpts) { return serviceratings.ArgsCareerDispatch{Sweep: true}, nil }, &river.PeriodicJobOpts{ID: "leaderboard-career-sweep", RunOnStart: false}))
	ratings.HighlightDispatcher.Queue = q
	riverqueue.AddWorker(q, ratings.HighlightDispatcher)
	riverqueue.AddWorker(q, ratings.HighlightWorker)
	q.AddPeriodicJob(river.NewPeriodicJob(river.PeriodicInterval(time.Hour), func() (river.JobArgs, *river.InsertOpts) { return serviceratings.ArgsHighlightDispatch{}, nil }, &river.PeriodicJobOpts{ID: "leaderboard-highlights-hourly", RunOnStart: false}))
	ratings.OperationDispatcher.Queue = q
	ratings.OperationWorker.Queue = q
	ratings.RepairWorker.Queue = q
	riverqueue.AddWorker(q, ratings.OperationDispatcher)
	riverqueue.AddWorker(q, ratings.OperationWorker)
	q.AddPeriodicJob(river.NewPeriodicJob(river.PeriodicInterval(serviceratings.DispatchInterval), func() (river.JobArgs, *river.InsertOpts) { return serviceratings.ArgsOperationDispatch{}, nil }, &river.PeriodicJobOpts{ID: "leaderboard-operation-dispatch", RunOnStart: false}))
	ratings.RepairDispatcher.Queue = q
	riverqueue.AddWorker(q, ratings.RepairDispatcher)
	riverqueue.AddWorker(q, ratings.RepairWorker)
	riverqueue.AddWorker(q, ratings.Dispatcher)
	riverqueue.AddWorker(q, ratings.TenantWorker)
	if serviceratings.DispatchEnabled {
		q.AddPeriodicJob(river.NewPeriodicJob(river.PeriodicInterval(serviceratings.DispatchInterval), func() (river.JobArgs, *river.InsertOpts) { return serviceratings.ArgsRepairDispatch{}, nil }, &river.PeriodicJobOpts{ID: "leaderboard-d1-dispatch", RunOnStart: false}))
		q.AddPeriodicJob(river.NewPeriodicJob(
			river.PeriodicInterval(serviceratings.DispatchInterval),
			func() (river.JobArgs, *river.InsertOpts) { return serviceratings.ArgsDispatch{}, nil },
			&river.PeriodicJobOpts{ID: "leaderboard-d2-dispatch", RunOnStart: false},
		))
	}

	// Register retention workers and periodic job.
	ret := serviceretention.RetentionService(s.broker)
	ret.Worker.Queue = q
	ret.RealmWorker.Queue = q
	riverqueue.AddWorker(q, ret.Worker)
	riverqueue.AddWorker(q, ret.RealmWorker)
	riverqueue.AddWorker(q, ret.RawLogWorker)
	q.AddQueue(riverqueue.QueueRetention, river.QueueConfig{
		MaxWorkers: 3,
	})
	if ret.Schedule > 0 {
		q.AddPeriodicJob(
			river.NewPeriodicJob(
				river.PeriodicInterval(ret.Schedule),
				func() (river.JobArgs, *river.InsertOpts) {
					return retention.ArgsRetention{DryRun: false}, nil
				},
				&river.PeriodicJobOpts{RunOnStart: false},
			),
		)
		q.AddPeriodicJob(
			river.NewPeriodicJob(
				river.PeriodicInterval(ret.Schedule),
				func() (river.JobArgs, *river.InsertOpts) {
					return retention.ArgsRawLogRetention{}, nil
				},
				&river.PeriodicJobOpts{RunOnStart: false},
			),
		)
	}

	customPanelCleanup := &custompanel.CleanupWorker{Store: chron.Zed}
	riverqueue.AddWorker(q, customPanelCleanup)
	q.AddPeriodicJob(
		river.NewPeriodicJob(
			custompanel.MidnightUTCSchedule{},
			func() (river.JobArgs, *river.InsertOpts) {
				return custompanel.ArgsCleanupReleases{}, nil
			},
			&river.PeriodicJobOpts{ID: "custom-panel-release-cleanup-midnight-utc", RunOnStart: false},
		),
	)

	analyticsCleanup := &guildanalytics.CleanupWorker{Store: chron.Zed}
	riverqueue.AddWorker(q, analyticsCleanup)
	q.AddPeriodicJob(
		river.NewPeriodicJob(
			river.PeriodicInterval(24*time.Hour),
			func() (river.JobArgs, *river.InsertOpts) {
				return guildanalytics.ArgsCleanup{}, nil
			},
			&river.PeriodicJobOpts{RunOnStart: false},
		),
	)

	riverqueue.AddWorker(q, &ratelimit.CleanupWorker{Store: cosmeticStore})
	q.AddPeriodicJob(
		river.NewPeriodicJob(
			river.PeriodicInterval(ratelimit.CleanupInterval),
			func() (river.JobArgs, *river.InsertOpts) {
				return ratelimit.ArgsCleanup{}, nil
			},
			&river.PeriodicJobOpts{ID: "rate-limit-bucket-cleanup", RunOnStart: false},
		),
	)

	// Register telemetry worker and periodic job.
	tel := servicetelemetry.TelemetryService(s.broker)
	riverqueue.AddWorker(q, tel.Worker)
	if tel.Schedule > 0 {
		q.AddPeriodicJob(
			river.NewPeriodicJob(
				river.PeriodicInterval(tel.Schedule),
				func() (river.JobArgs, *river.InsertOpts) {
					return servicetelemetry.ArgsTelemetryReport{}, nil
				},
				&river.PeriodicJobOpts{RunOnStart: true},
			),
		)
	}

	// Keep legacy Performances rankings summaries and logical-run representatives current.
	rank := servicerankings.Rankings(s.broker)
	rank.SummaryDispatchWorker.Queue = q
	riverqueue.AddWorker(q, rank.SummaryDispatchWorker)
	riverqueue.AddWorker(q, rank.SummaryTenantWorker)
	// Drain pre-windowed snapshot jobs with compatibility no-op workers.
	riverqueue.AddWorker(q, &servicerankings.WorkerRetiredPublishParseSnapshots{})
	riverqueue.AddWorker(q, &servicerankings.WorkerRetiredPublishParseSnapshotTenant{})
	riverqueue.AddWorker(q, rank.ComputeTimeParseScoresWorker)
	rank.BackfillTimeParseScoresWorker.Queue = q
	riverqueue.AddWorker(q, rank.BackfillTimeParseScoresWorker)
	rank.ComputeParseScoresWorker.Queue = q
	riverqueue.AddWorker(q, rank.ComputeParseScoresWorker)
	rank.RepairDispatchWorker.Queue = q
	riverqueue.AddWorker(q, rank.RepairDispatchWorker)
	rank.RepairParseScoresWorker.Queue = q
	riverqueue.AddWorker(q, rank.RepairParseScoresWorker)
	riverqueue.AddWorker(q, rank.RankingRunRefreshWorker)
	riverqueue.AddWorker(q, rank.RankingRunRepairWorker)
	q.AddQueue(riverqueue.QueueRankings, river.QueueConfig{MaxWorkers: int(s.rankingWorkers)})
	q.AddPeriodicJob(river.NewPeriodicJob(
		river.PeriodicInterval(time.Hour),
		func() (river.JobArgs, *river.InsertOpts) {
			return servicerankings.ArgsRefreshRankingsSummaries{}, nil
		},
		&river.PeriodicJobOpts{RunOnStart: true},
	))
	q.AddPeriodicJob(river.NewPeriodicJob(
		river.PeriodicInterval(24*time.Hour),
		func() (river.JobArgs, *river.InsertOpts) {
			return rankingargs.ArgsRepairRankingRuns{}, nil
		},
		&river.PeriodicJobOpts{RunOnStart: false},
	))

	// Daily bounded repair for parse-enabled tenants and root.
	q.AddPeriodicJob(river.NewPeriodicJob(
		river.PeriodicInterval(24*time.Hour),
		func() (river.JobArgs, *river.InsertOpts) {
			return servicerankings.ArgsDispatchParseScoreRepairs{}, nil
		},
		&river.PeriodicJobOpts{RunOnStart: false},
	))

	err = q.Start(ctx)
	if err != nil {
		return fmt.Errorf("starting river queues: %w", err)
	}

	s.Queues = q
	chron.SetQueue(s.Queues)
	return nil
}

func (s *Service) Close(ctx context.Context) error { return s.Queues.Close(ctx) }

func (s *Service) Options() serpent.OptionSet {
	return serpent.OptionSet{
		{
			Name:        "Ranking Worker Count",
			Description: "Number of workers for Performances ranking jobs.",
			Flag:        "ranking-worker-count",
			Env:         "CHRONICLE_RANKING_WORKERS",
			Default:     "1",
			Value:       serpent.Int64Of(&s.rankingWorkers),
		},
		{
			Name:        "Log Parsing Worker Count",
			Description: "Number of workers to use for parsing raid log files.",
			Required:    false,
			Flag:        "log-parse-worker-count",
			Env:         "CHRONICLE_LOG_PARSING_WORKERS",
			Default:     "1",
			Value:       serpent.Int64Of(&s.logParsingWorkers),
		},
	}
}

func (s *Service) Configures() []string {
	return []string{}
}
