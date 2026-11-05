package parseresult

import (
	"context"
	"errors"
	"fmt"
	"io"
	"log/slog"

	"github.com/Emyrk/chronicle/combatlog/consumers"
	"github.com/Emyrk/chronicle/combatlog/parser/common/encounters"
	"github.com/Emyrk/chronicle/combatlog/parser/common/registry"
	"github.com/Emyrk/chronicle/combatlog/parser/vanilla/parserv2"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/gamedb"
	"github.com/Emyrk/chronicle/database/gamedb/chrondbc"
)

// Parse consumes a 1.12a CC-addon log and returns the bounded data-only
// projection for each nonempty finalized instance. gameDB is used only for
// game-data reads; this function never persists instances or event streams.
// Unlike the legacy worker, a finalization error aborts the parse rather than
// recording a per-instance failure and continuing.
func Parse(ctx context.Context, reader io.Reader, gameDB gamedb.GameDB, reg *registry.Registry, logger *slog.Logger) ([]Result, error) {
	if reader == nil || gameDB == nil || reg == nil || logger == nil {
		return nil, fmt.Errorf("reader, game database, registry and logger are required")
	}
	state := encounters.New(ctx, logger, reg)
	modifiers, err := gameDB.DurationModifiers(ctx)
	if err != nil {
		return nil, fmt.Errorf("load aura duration modifiers: %w", err)
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
			return nil, fmt.Errorf("load consumable catalog: %w", err)
		}
		state.ConsumeTracker.SetCatalog(catalog)
	}
	consumer := consumers.New(logger, state)
	parser, err := parserv2.New(ctx, logger, reader, gameDB, gameDB)
	if err != nil {
		return nil, fmt.Errorf("create v2 parser: %w", err)
	}
	consumer.Advancer = parser
	if err := consumer.ConsumeAll(ctx, parser); err != nil && !errors.Is(err, io.EOF) {
		return nil, fmt.Errorf("consume v2 log: %w", err)
	}

	capabilities := []string{"overheal", "absorb"}
	if parser.SawRaidGroup() {
		capabilities = append(capabilities, "raidgroup")
	}
	if parser.SawUnitResources() {
		capabilities = append(capabilities, "unit-resources")
	}
	if parser.SawUnitPosition() {
		capabilities = append(capabilities, "unit-position")
	}
	results := make([]Result, 0, len(state.Instances))
	for _, inst := range state.Instances {
		if err := ctx.Err(); err != nil {
			return nil, err
		}
		fin, err := inst.Finalize(ctx)
		if err != nil {
			return nil, fmt.Errorf("finalize instance %q: %w", inst.Name(), err)
		}
		if fin == nil || len(fin.Encounters) == 0 {
			continue
		}
		result, err := Build(Input{
			Format: database.LogFormat112aCcAddon, Name: inst.Name(), Finalized: fin, Events: inst.Events(),
			Category: string(inst.Category), DifficultyName: inst.CurrentZone.DifficultyName,
			MaxPlayers: int32(inst.CurrentZone.MaxPlayers), DynamicDifficulty: int32(inst.CurrentZone.DynamicDifficulty),
			Capabilities: capabilities, Units: state.Units, IdentifyUnit: inst.IdentifyUnit,
		})
		if err != nil {
			return nil, fmt.Errorf("project instance %q: %w", inst.Name(), err)
		}
		results = append(results, *result)
	}
	return results, nil
}
