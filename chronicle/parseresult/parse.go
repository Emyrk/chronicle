package parseresult

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"io"
	"log/slog"

	"github.com/Emyrk/chronicle/combatlog/consumers"
	"github.com/Emyrk/chronicle/combatlog/parser/common/encounters"
	"github.com/Emyrk/chronicle/combatlog/parser/common/parsectx"
	"github.com/Emyrk/chronicle/combatlog/parser/common/registry"
	"github.com/Emyrk/chronicle/combatlog/parser/vanilla/parserv2"
	"github.com/Emyrk/chronicle/combatlog/parser/wotlk"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/gamedb"
	"github.com/Emyrk/chronicle/database/gamedb/chrondbc"
)

// InstanceFailure identifies one nonempty instance whose finalization or
// projection failed. Key matches the legacy worker's name_ordinal convention.
// Message is diagnostic text, not a stable machine-readable error code.
type InstanceFailure struct {
	Key     string `json:"key"`
	Stage   string `json:"stage"`
	Message string `json:"message"`
}

// ParseOutcome retains successful instances alongside labeled failures.
// A fatal parse/setup/context error still returns a non-nil error instead.
type ParseOutcome struct {
	Results  []Result          `json:"results"`
	Failures []InstanceFailure `json:"failures"`
}

// Parse keeps its original all-or-error semantics for existing callers.
func Parse(ctx context.Context, reader io.Reader, gameDB gamedb.GameDB, reg *registry.Registry, logger *slog.Logger) ([]Result, error) {
	outcome, err := parse(ctx, reader, gameDB, reg, logger, false)
	if err != nil {
		return nil, err
	}
	return outcome.Results, nil
}

// ParseWithFailures consumes a supported CC-addon log without persistence. It
// continues after a nonempty instance fails finalization or projection, as the
// legacy worker does. A fatal setup/consume/context error aborts the entire
// parse. Empty or nil finalized instances are skipped, including when their
// finalizer reports an error, matching the legacy worker's skip ordering.
func ParseWithFailures(ctx context.Context, reader io.Reader, gameDB gamedb.GameDB, reg *registry.Registry, logger *slog.Logger) (ParseOutcome, error) {
	return parse(ctx, reader, gameDB, reg, logger, true)
}

func parse(ctx context.Context, reader io.Reader, gameDB gamedb.GameDB, reg *registry.Registry, logger *slog.Logger, continueFailures bool) (ParseOutcome, error) {
	if reader == nil || gameDB == nil || reg == nil || logger == nil {
		return ParseOutcome{}, fmt.Errorf("reader, game database, registry and logger are required")
	}
	// Preserve a caller-supplied resolved context (including dataset talents).
	// For standalone callers, stamp the known transport and registry flavor;
	// dataset identity and talent trees remain unavailable until configured.
	format := database.LogFormat112aCcAddon
	if configured, ok := parsectx.FromContext(ctx); ok {
		format = configured.Format
	} else {
		ctx = parsectx.With(ctx, parsectx.Context{
			Type: database.LogTypeV2, Format: format, Flavor: reg.Flavor(),
		})
	}
	switch format {
	case database.LogFormat112aCcAddon, database.LogFormat243CcAddon, database.LogFormat335aCcAddon:
	default:
		return ParseOutcome{}, fmt.Errorf("unsupported parse-result format %q", format)
	}
	state := encounters.New(ctx, logger, reg)
	modifiers, err := gameDB.DurationModifiers(ctx)
	if err != nil {
		return ParseOutcome{}, fmt.Errorf("load aura duration modifiers: %w", err)
	}
	state.Auras.SetDurationModifiers(modifiers)
	state.SetSpellFetcher(gameDB)
	// Match the legacy parser's optional catalog initialization when the
	// read-only game database implements it.
	if fetcher, ok := gameDB.(interface {
		Consumables(context.Context) (*chrondbc.ConsumableCatalog, error)
	}); ok {
		catalog, err := fetcher.Consumables(ctx)
		if err != nil {
			return ParseOutcome{}, fmt.Errorf("load consumable catalog: %w", err)
		}
		state.ConsumeTracker.SetCatalog(catalog)
	}
	consumer := consumers.New(logger, state)
	capabilities := []string{"overheal", "absorb"}
	switch format {
	case database.LogFormat112aCcAddon:
		parser, err := parserv2.New(ctx, logger, reader, gameDB, gameDB)
		if err != nil {
			return ParseOutcome{}, fmt.Errorf("create v2 parser: %w", err)
		}
		consumer.Advancer = parser
		if err := consumer.ConsumeAll(ctx, parser); err != nil && !errors.Is(err, io.EOF) {
			return ParseOutcome{}, fmt.Errorf("consume v2 log: %w", err)
		}
		if parser.SawRaidGroup() {
			capabilities = append(capabilities, "raidgroup")
		}
		if parser.SawUnitResources() {
			capabilities = append(capabilities, "unit-resources")
		}
		if parser.SawUnitPosition() {
			capabilities = append(capabilities, "unit-position")
		}
	case database.LogFormat243CcAddon, database.LogFormat335aCcAddon:
		capabilities = append(capabilities, "interrupt")
		data, err := io.ReadAll(reader)
		if err != nil {
			return ParseOutcome{}, fmt.Errorf("read CLEU log: %w", err)
		}
		var parser *wotlk.Parser
		if format == database.LogFormat243CcAddon {
			parser, err = wotlk.NewTBC(ctx, logger, bytes.NewReader(data), gameDB, gameDB, reg)
		} else {
			parser, err = wotlk.New(ctx, logger, bytes.NewReader(data), gameDB, gameDB, reg)
		}
		if err != nil {
			return ParseOutcome{}, fmt.Errorf("create CLEU parser: %w", err)
		}
		parser.SetRealmClockInfo(scanCompanionClock(data))
		consumer.Advancer = parser
		if err := consumer.ConsumeAll(ctx, parser); err != nil && !errors.Is(err, io.EOF) {
			return ParseOutcome{}, fmt.Errorf("consume CLEU log: %w", err)
		}
		if parser.SawRaidGroup() {
			capabilities = append(capabilities, "raidgroup")
		}
	}
	tasks := make([]instanceTask, 0, len(state.Instances))
	for _, inst := range state.Instances {
		tasks = append(tasks, instanceTask{name: inst.Name(), run: func() (Result, bool, string, error) {
			fin, err := inst.Finalize(ctx)
			if fin == nil || len(fin.Encounters) == 0 {
				return Result{}, false, "", nil
			}
			if err != nil {
				return Result{}, true, "finalize", err
			}
			result, err := Build(Input{
				Format: format, Name: inst.Name(), Finalized: fin, Events: inst.Events(),
				Category: string(inst.Category), DifficultyName: inst.CurrentZone.DifficultyName,
				MaxPlayers: int32(inst.CurrentZone.MaxPlayers), DynamicDifficulty: int32(inst.CurrentZone.DynamicDifficulty),
				Capabilities: capabilities, Units: state.Units, IdentifyUnit: inst.IdentifyUnit, Armory: fin.Guilds,
			})
			if err != nil {
				return Result{}, true, "project", err
			}
			return *result, true, "", nil
		}})
	}
	return collectInstances(ctx, tasks, continueFailures)
}

// collectInstances separates per-instance failures from fatal context errors.
// The ordinal counts every parsed instance, including skipped empty ones.
type instanceTask struct {
	name string
	run  func() (Result, bool, string, error)
}

func collectInstances(ctx context.Context, tasks []instanceTask, continueFailures bool) (ParseOutcome, error) {
	out := ParseOutcome{Results: make([]Result, 0, len(tasks))}
	for ordinal, task := range tasks {
		if err := ctx.Err(); err != nil {
			return ParseOutcome{}, err
		}
		result, nonempty, stage, err := task.run()
		if ctxErr := ctx.Err(); ctxErr != nil {
			return ParseOutcome{}, ctxErr
		}
		if !nonempty {
			continue
		}
		if err != nil {
			if !continueFailures {
				return ParseOutcome{}, fmt.Errorf("%s instance %q: %w", stage, task.name, err)
			}
			out.Failures = append(out.Failures, InstanceFailure{
				Key: fmt.Sprintf("%s_%d", task.name, ordinal), Stage: stage, Message: err.Error(),
			})
			continue
		}
		out.Results = append(out.Results, result)
	}
	return out, nil
}
