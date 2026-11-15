package chronicle

import (
	"context"
	"errors"
	"fmt"

	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/internal/version"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/riverqueue/river"
	"github.com/riverqueue/river/rivertype"
)

var errNativeProfileUnsupported = errors.New("CPU profiling is not supported by the native checkpoint worker; select the legacy engine to profile")

func (c *Chronicle) enqueueNativeParse(ctx context.Context, db database.Store, tx pgx.Tx, args ArgsLogParse, opts *river.InsertOpts) (*rivertype.JobInsertResult, error) {
	if args.Profile {
		return nil, errNativeProfileUnsupported
	}
	if tx == nil {
		return nil, errors.New("native parse enqueue requires transaction")
	}
	if err := lockExpectedParseGeneration(ctx, db, args.LogID, effectiveParseGeneration(args.ParseGeneration)); err != nil {
		return nil, err
	}
	if err := db.EnsureParserHandoff(ctx, database.EnsureParserHandoffParams{LogGroupID: args.LogID, InitialGeneration: effectiveParseGeneration(args.ParseGeneration)}); err != nil {
		return nil, err
	}
	state, err := db.GetParserHandoff(ctx, args.LogID)
	if err != nil {
		return nil, err
	}
	if state.Generation != effectiveParseGeneration(args.ParseGeneration) {
		return nil, fmt.Errorf("native handoff generation %d differs from locked log generation %d", state.Generation, effectiveParseGeneration(args.ParseGeneration))
	}
	if err := db.SetParserHandoffNativeEnabled(ctx, database.SetParserHandoffNativeEnabledParams{LogGroupID: args.LogID, NativeEnabled: true}); err != nil {
		return nil, err
	}
	build, err := version.BinaryIdentity()
	if err != nil {
		return nil, fmt.Errorf("capture native parse executable: %w", err)
	}
	args.ParserEngine = chroniclesdk.ParserEngineNext
	return c.queue.InsertTx(ctx, tx, ArgsNativeLogParse{ArgsLogParse: args, BinaryIdentity: build, RequestID: uuid.New()}, opts)
}

// Append extends the same native generation. Its input parts are immutable and
// the worker serializes acceptance against the latest durable head, not serving
// publication. Explicit legacy selection remains legacy on subsequent appends.
func (c *Chronicle) enqueueAppendParse(ctx context.Context, db database.Store, tx pgx.Tx, logID, realmID uuid.UUID) (*rivertype.JobInsertResult, error) {
	// Serialize mode selection with explicit reparses. The legacy fallback also
	// needs the ranking lock, so take it before the log lock in either mode.
	if err := db.AcquireRankingRunRefreshLock(ctx); err != nil {
		return nil, err
	}
	if _, err := db.LockWoWLogGroupParseGeneration(ctx, logID); err != nil {
		return nil, err
	}
	state, err := db.GetParserHandoff(ctx, logID)
	if errors.Is(err, pgx.ErrNoRows) || (err == nil && !state.NativeEnabled) {
		return c.enqueueReParseLog(ctx, db, tx, logID, false, false, false, realmID)
	}
	if err != nil {
		return nil, err
	}
	args := newReplacementArgsLogParse(ctx, logID, state.Generation, false, false, false, realmID, nil)
	args.ParserEngine = chroniclesdk.ParserEngineNext
	// Do not deduplicate against running work: it may have frozen an earlier
	// prefix before this append was committed. Every append must get a successor.
	return c.enqueueNativeParse(ctx, db, tx, args, &river.InsertOpts{UniqueOpts: river.UniqueOpts{}})
}
