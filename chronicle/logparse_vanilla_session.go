package chronicle

import (
	"context"
	"fmt"
	"io"
	"log/slog"
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/common/parsectx"
	"github.com/Emyrk/chronicle/combatlog/parser/common/registry"
	"github.com/Emyrk/chronicle/combatlog/parser/vanilla/nextsource"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/gamedb"
	"github.com/Emyrk/chronicle/internal/version"
)

// vanillaFileSession retains semantic state while consuming complete files in
// sequence. Only baseline parsernext uses it. Finalization and publication stay
// with the existing caller; this object cannot publish or snapshot anything.
type vanillaFileSession struct {
	pipeline *nextsource.Pipeline
	result   *parseResult
	failed   error
}

func newVanillaFileSession(ctx context.Context, logger *slog.Logger, gameDB gamedb.GameDB, reg *registry.Registry, identityMode bool, preRealmName string) (*vanillaFileSession, error) {
	flavor, _ := parsectx.Flavor(ctx)
	spells := overrideGameDB{GameDB: gameDB, spells: gameDB, flavor: flavor}
	state, err := newParseState(ctx, database.LogFormat112aCcAddon, logger, gameDB, spells, reg, identityMode, preRealmName)
	if err != nil {
		return nil, err
	}
	start := time.Now()
	pipeline, err := nextsource.New(ctx, logger, spells, gameDB, version.GitTag)
	if err != nil {
		return nil, fmt.Errorf("create parsernext Vanilla pipeline: %w", err)
	}
	state.report.parseDuration = time.Since(start)
	return &vanillaFileSession{pipeline: pipeline, result: state}, nil
}

// ProcessFile consumes one already-decompressed complete file synchronously.
// Callers must not use storage append parts as files without proving complete
// record boundaries. EOF commits progress, not fights. Recoverable malformed
// records retain Consumers' existing logging/continuation behavior. A fatal
// source error or consumer error invalidates this session: discard partial state.
func (s *vanillaFileSession) ProcessFile(ctx context.Context, input io.Reader) error {
	if s.failed != nil {
		return fmt.Errorf("vanilla file session is invalid: %w", s.failed)
	}
	start := time.Now()
	source, err := s.pipeline.OpenFile(input, 4<<20)
	if err != nil {
		s.failed = err
		return err
	}
	s.result.consumers.Advancer = source
	if err = s.result.consumers.ConsumeAll(ctx, source); err != nil {
		s.failed = err
		return fmt.Errorf("consume parsernext Vanilla log: %w", err)
	}
	s.result.report.totalLines += source.Summary().Lines
	s.result.report.parseDuration += time.Since(start)
	s.result.report.consumerTimes = s.result.consumers.Times()
	// Retain the existing missed-spell report behavior; correcting both engines'
	// named-type assertion remains a separate, explicitly deferred change.
	s.result.logCapabilities = initialLogCapabilities(database.LogFormat112aCcAddon)
	observed := s.pipeline.Capabilities()
	if observed.RaidGroup {
		s.result.logCapabilities = append(s.result.logCapabilities, "raidgroup")
	}
	s.result.logCapabilities = append(s.result.logCapabilities, observedUnitTelemetryCapabilities(observed.UnitResources, observed.UnitPosition)...)
	return nil
}
