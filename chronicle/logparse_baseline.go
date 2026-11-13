package chronicle

import (
	"context"
	"errors"
	"fmt"
	"github.com/Emyrk/chronicle/database"

	"github.com/riverqueue/river"
)

// RunLogParseBaseline runs the production parser and synchronous publication path
// without a River worker. It is intended only for baseline tooling against an
// isolated database with the same input objects and reference data as production.
// Construct Chronicle with New and do not attach a queue (including concurrently
// with this call). A configured queue is rejected before any parsing or writes.
//
// The database is the result channel. Ranking refreshes, computed scores and
// notifications are not queued. River output recording outside a worker returns
// an error, which the existing parse path ignores. All other parse behavior,
// including profiling, generation fencing, partial writes on failure, timestamps
// and durations, is unchanged. In particular, a stale-generation abort returns
// nil; callers must verify publication in the database rather than treating nil
// as proof that a baseline was produced. Cancellation errors are returned intact.
// BaselineEngine is a tooling-only choice. It is not persisted in River args or
// server configuration; production workers always retain the legacy zero value.
type BaselineEngine string

const (
	BaselineLegacy            BaselineEngine = "legacy"
	BaselineParserNext        BaselineEngine = "parsernext"
	BaselineParserNextVanilla BaselineEngine = "parsernext-vanilla"
)

func (e BaselineEngine) Validate() error {
	switch e {
	case BaselineLegacy, BaselineParserNextVanilla, BaselineParserNext:
		return nil
	}
	return fmt.Errorf("unsupported baseline engine %q", e)
}

func (e BaselineEngine) ValidateFormat(format database.LogFormat) error {
	if err := e.Validate(); err != nil {
		return err
	}
	if e == BaselineParserNextVanilla && format != database.LogFormat112aCcAddon {
		return fmt.Errorf("baseline engine %q does not support format %q", e, format)
	}
	if e == BaselineParserNext {
		switch format {
		case database.LogFormat112aCcAddon, database.LogFormat243CcAddon, database.LogFormat335aCcAddon,
			database.LogFormatAzerothcoreMod, database.LogFormatV9Cleu, database.LogFormatV22Cleu, database.LogFormatHermesproxy1142Cc:
			return nil
		default:
			return fmt.Errorf("baseline engine %q does not support format %q", e, format)
		}
	}
	return nil
}

func (c *Chronicle) RunLogParseBaseline(ctx context.Context, args ArgsLogParse) error {
	return c.RunLogParseBaselineWithEngine(ctx, args, BaselineLegacy)
}

// RunLogParseBaselineWithEngine selects an engine only for this synchronous call.
// Unsupported selections fail before entering the worker's write-capable path.
func (c *Chronicle) RunLogParseBaselineWithEngine(ctx context.Context, args ArgsLogParse, engine BaselineEngine) error {
	if err := engine.Validate(); err != nil {
		return err
	}
	if c.queue != nil {
		return errors.New("baseline parsing requires a Chronicle without a queue")
	}
	if engine == BaselineParserNextVanilla || engine == BaselineParserNext {
		group, err := c.Zed.GetWoWLogGroupByID(ctx, args.LogID)
		if err != nil {
			return fmt.Errorf("baseline format preflight: %w", err)
		}
		format := group.WoWLogGroup.LogType.Format()
		if group.WoWLogGroup.Format.Valid {
			format = group.WoWLogGroup.Format.LogFormat
		}
		if err := engine.ValidateFormat(format); err != nil {
			return err
		}
	}
	return (&WorkerLogParse{parent: c, baselineEngine: engine}).work(ctx, &river.Job[ArgsLogParse]{Args: args}, newRankingRunRefreshPlan(args))
}
