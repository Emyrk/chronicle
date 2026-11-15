package chronicle

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/internal/services/servicetenant"
	"github.com/Emyrk/chronicle/internal/version"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/Emyrk/chronicle/combatlog/parser/common/registry"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/authz"
	"github.com/Emyrk/chronicle/database/gamedb"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/riverqueue/river"
)

const KindFinalizeLogParse = "log-parse-finalize"
const QueueLogFinalizing = "log-finalizing"

// ArgsFinalizeLogParse identifies exactly one immutable accepted checkpoint.
// A retry must never retag its producing binary or substitute another artifact.
type ArgsFinalizeLogParse struct {
	ArgsLogParse
	AttemptID      uuid.UUID `json:"attempt_id"`
	BinaryIdentity string    `json:"binary_identity"`
}

func (ArgsFinalizeLogParse) Kind() string { return KindFinalizeLogParse }
func (ArgsFinalizeLogParse) InsertOpts() river.InsertOpts {
	return river.InsertOpts{Queue: QueueLogFinalizing, MaxAttempts: 3, UniqueOpts: river.UniqueOpts{ByArgs: true}}
}

type nativeFinalization struct {
	args      ArgsLogParse
	realmID   uuid.UUID
	realmName string
	restore   func(context.Context, gamedb.GameDB, *registry.Registry, *parseIdentityFence) (*parseResult, error)
}

type publicationContextKey struct{}
type publicationAttemptKey struct{}

// WorkerFinalizeLogParse is primary-only. It never computes a replacement for a
// missing artifact; explicit new-build reparsing is the recovery mechanism.
type WorkerFinalizeLogParse struct {
	river.WorkerDefaults[ArgsFinalizeLogParse]
	parent     *Chronicle
	leaseTTL   time.Duration
	renewEvery time.Duration
}

// NativeFinalizeOptions controls renewable publication ownership. Zero values
// select conservative defaults. Invalid timing is rejected before taking a claim.
type NativeFinalizeOptions struct{ LeaseTTL, RenewEvery time.Duration }

func (c *Chronicle) NewWorkerFinalizeLogParse(options ...NativeFinalizeOptions) river.Worker[ArgsFinalizeLogParse] {
	config := NativeFinalizeOptions{LeaseTTL: 2 * time.Minute, RenewEvery: 20 * time.Second}
	if len(options) > 0 {
		if options[0].LeaseTTL != 0 {
			config.LeaseTTL = options[0].LeaseTTL
		}
		if options[0].RenewEvery != 0 {
			config.RenewEvery = options[0].RenewEvery
		}
	}
	return &WorkerFinalizeLogParse{parent: c, leaseTTL: config.LeaseTTL, renewEvery: config.RenewEvery}
}

func (w *WorkerFinalizeLogParse) Work(ctx context.Context, job *river.Job[ArgsFinalizeLogParse]) error {
	if w.leaseTTL <= 0 || w.renewEvery <= 0 || w.renewEvery >= w.leaseTTL {
		return errors.New("invalid publication lease timing")
	}
	build, err := version.BinaryIdentity()
	if err != nil {
		return err
	}
	if job.Args.BinaryIdentity == "" || job.Args.BinaryIdentity != build {
		return river.JobCancel(fmt.Errorf("checkpoint build %q differs from primary %q; explicitly reparse with the current build", job.Args.BinaryIdentity, build))
	}
	args := job.Args.ArgsLogParse
	if args.ParserEngine != chroniclesdk.ParserEngineNext {
		return river.JobCancel(fmt.Errorf("native finalizer requires native engine"))
	}
	if args.TenantID != uuid.Nil {
		ctx = servicetenant.WithTenantID(ctx, args.TenantID)
	}
	attempt, err := w.parent.Zed.GetParserCheckpointAttempt(ctx, database.GetParserCheckpointAttemptParams{LogGroupID: args.LogID, AttemptID: job.Args.AttemptID})
	if err != nil {
		return err
	}
	if attempt.ProducingBinary != build || attempt.Generation != effectiveParseGeneration(args.ParseGeneration) || attempt.ParserEngine != string(args.ParserEngine) {
		return river.JobCancel(fmt.Errorf("checkpoint provenance does not match immutable finalize job; explicitly reparse"))
	}
	state, err := w.parent.Zed.GetParserHandoff(ctx, args.LogID)
	if err != nil {
		return err
	}
	if state.Generation != attempt.Generation || state.PublishedIteration >= attempt.Iteration || state.PublicationIteration > attempt.Iteration {
		return nil
	}
	prepared, err := loadNativeFinalization(ctx, w.parent.Storage, attempt, args)
	if err != nil {
		return river.JobCancel(fmt.Errorf("restore accepted checkpoint; explicitly reparse: %w", err))
	}
	// Publication options are part of the verified immutable artifact, not
	// reconstructed from queue defaults or mutable upload state.
	args = prepared.args
	if args.Profile {
		return river.JobCancel(errNativeProfileUnsupported)
	}
	if args.TenantID != uuid.Nil {
		ctx = servicetenant.WithTenantID(ctx, args.TenantID)
	}
	store := NewParseHandoffStore(w.parent.Zed.Store)
	token := uuid.New()
	ttl := pgtype.Interval{Microseconds: w.leaseTTL.Microseconds(), Valid: true}
	_, err = store.ClaimPublication(ctx, attempt.Generation, database.ClaimParserPublicationParams{LogGroupID: args.LogID, AttemptID: attempt.AttemptID, PublicationToken: token, LeaseDuration: ttl})
	if errors.Is(err, pgx.ErrNoRows) {
		return river.JobSnooze(5 * time.Second)
	}
	if err != nil {
		return err
	}
	fence := ParsePublicationFence{LogGroupID: args.LogID, Generation: attempt.Generation, Iteration: attempt.Iteration, Token: token}
	ctx = context.WithValue(ctx, publicationAttemptKey{}, attempt)
	ctx, cancel := context.WithCancelCause(context.WithValue(ctx, publicationContextKey{}, fence))
	defer cancel(nil)
	stop := make(chan struct{})
	stopped := make(chan struct{})
	go func() {
		defer close(stopped)
		ticker := time.NewTicker(w.renewEvery)
		defer ticker.Stop()
		for {
			select {
			case <-stop:
				return
			case <-ctx.Done():
				return
			case <-ticker.C:
				_, err := store.RenewPublication(ctx, database.RenewParserPublicationParams{LogGroupID: args.LogID, Generation: attempt.Generation, Iteration: attempt.Iteration, PublicationToken: token, LeaseDuration: ttl})
				if err != nil {
					cancel(fmt.Errorf("renew publication lease: %w", err))
					return
				}
			}
		}
	}()
	defer func() {
		close(stop)
		<-stopped
		releaseCtx, releaseCancel := context.WithTimeout(context.WithoutCancel(ctx), 5*time.Second)
		defer releaseCancel()
		_, _ = store.ReleasePublication(releaseCtx, database.ReleaseParserPublicationParams{LogGroupID: args.LogID, Generation: attempt.Generation, Iteration: attempt.Iteration, PublicationToken: token})
	}()
	execution := &WorkerLogParse{parent: w.parent, parserEngine: args.ParserEngine, finalization: prepared}
	originalJob := &river.Job[ArgsLogParse]{JobRow: job.JobRow, Args: args}
	return execution.work(ctx, originalJob, newRankingRunRefreshPlan(args))
}

// parsePublicationTx is the single entry point for native serving transactions.
// Legacy transactions retain their original behavior. The lock order matches
// generation changes: ranking refresh, log generation, then publication claim.
func (c *Chronicle) parsePublicationTx(ctx context.Context, complete bool, write func(*authz.AuthzTX) error, opts *pgx.TxOptions) error {
	fence, native := ctx.Value(publicationContextKey{}).(ParsePublicationFence)
	if !native {
		return c.Zed.InTx(ctx, write, opts)
	}
	return c.Zed.InTx(ctx, func(tx *authz.AuthzTX) error {
		if err := tx.AcquireRankingRunRefreshLock(ctx); err != nil {
			return err
		}
		if err := lockExpectedParseGeneration(ctx, tx, fence.LogGroupID, fence.Generation); err != nil {
			return err
		}
		params := database.LockParserPublicationParams{LogGroupID: fence.LogGroupID, Generation: fence.Generation, Iteration: fence.Iteration, PublicationToken: fence.Token}
		if _, err := tx.LockParserPublication(ctx, params); err != nil {
			return fmt.Errorf("publication authority: %w", err)
		}
		if err := write(tx); err != nil {
			return err
		}
		if complete {
			if _, err := tx.CompleteParserPublication(ctx, database.CompleteParserPublicationParams(params)); err != nil {
				return err
			}
			attempt, ok := ctx.Value(publicationAttemptKey{}).(database.ParserCheckpointAttempt)
			if c.queue != nil && ok && attempt.PredecessorAttemptID.Valid {
				pgxTx, ok := tx.PGXTx()
				if !ok {
					return errors.New("checkpoint GC enqueue requires transaction")
				}
				_, err := c.queue.InsertTx(ctx, pgxTx, ArgsNativeCheckpointGC{LogID: fence.LogGroupID, Cursor: attempt.PredecessorAttemptID.UUID}, &river.InsertOpts{ScheduledAt: time.Now().Add(24 * time.Hour)})
				if err != nil {
					return err
				}
			}
			return nil
		}
		_, err := tx.CheckParserPublication(ctx, database.CheckParserPublicationParams(params))
		return err
	}, opts)
}
