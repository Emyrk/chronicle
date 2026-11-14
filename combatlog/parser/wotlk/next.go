package wotlk

import (
	"bufio"
	"context"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/common/parsectx"
	"github.com/Emyrk/chronicle/combatlog/parser/common/parseerrors"
	"github.com/Emyrk/chronicle/combatlog/parser/common/registry"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/types/realmclock"
	parservanilla "github.com/Emyrk/chronicle/combatlog/parser/vanilla"
	"github.com/Emyrk/chronicle/combatlog/parser/wotlk/synthetic"
	"github.com/Emyrk/chronicle/combatlog/parsernext/cleusource"
	nexttbc "github.com/Emyrk/chronicle/combatlog/parsernext/tbc"
	nextwotlk "github.com/Emyrk/chronicle/combatlog/parsernext/wotlk"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/gamedb"
)

type nextSynthetic interface {
	ProcessMessages([]messages.Message) ([]messages.Message, error)
	DetailedTimes() map[string]time.Duration
}

// NextPipeline retains native CLEU decoder and synthetic state across
// consecutive complete files. Use one serial NextSource at a time.
type NextPipeline struct {
	native            *cleusource.Pipeline
	synthetics        nextSynthetic
	gear              gamedb.GearResolver
	activeSource      *NextSource
	boundary          bool
	fatal             error
	metrics           parservanilla.Metrics
	syntheticDuration time.Duration
}

// NextSource is one file-local view over a persistent NextPipeline.
type NextSource struct {
	pipeline *NextPipeline
	native   *cleusource.Source
}

// NewNextPipeline constructs the independent native TBC or Wrath composition
// selected by explicit parsectx metadata. It owns no reader, finalizer, consumer,
// publication, or database lifecycle.
func NewNextPipeline(ctx context.Context, logger *slog.Logger, gameDB gamedb.GameDB, gear gamedb.GearResolver, reg *registry.Registry) (*NextPipeline, error) {
	if gameDB == nil {
		return nil, fmt.Errorf("wowDB cannot be nil")
	}
	if logger == nil {
		logger = slog.Default()
	}
	format, ok := parsectx.Format(ctx)
	if !ok {
		return nil, fmt.Errorf("native CLEU source format is required")
	}

	var (
		native *cleusource.Pipeline
		err    error
	)
	switch format {
	case database.LogFormat243CcAddon:
		native, err = nexttbc.NewPipeline(ctx, logger, gameDB)
	case database.LogFormat335aCcAddon:
		native, err = nextwotlk.NewPipeline(ctx, logger, gameDB)
	default:
		return nil, fmt.Errorf("unsupported native CLEU format %q", format)
	}
	if err != nil {
		return nil, err
	}

	return &NextPipeline{
		native:     native,
		synthetics: synthetic.New(ctx, logger, gameDB, reg, pipelineNames{pipeline: native}),
		gear:       gear,
		boundary:   true,
		metrics: parservanilla.Metrics{
			MatchingTime:   make(map[string]time.Duration),
			UnmatchingTime: make(map[string]time.Duration),
		},
	}, nil
}

// NewNext preserves the single-reader compatibility constructor while using a
// persistent pipeline internally.
func NewNext(ctx context.Context, logger *slog.Logger, reader io.Reader, gameDB gamedb.GameDB, gear gamedb.GearResolver, reg *registry.Registry) (*NextSource, error) {
	pipeline, err := NewNextPipeline(ctx, logger, gameDB, gear, reg)
	if err != nil {
		return nil, err
	}
	return pipeline.OpenFile(reader)
}

// OpenFile opens the next complete file. Decoder, clock, companion, name,
// synthetic, metrics, and diagnostic state remain owned by the pipeline.
func (p *NextPipeline) OpenFile(reader io.Reader) (*NextSource, error) {
	if p.fatal != nil {
		return nil, fmt.Errorf("native CLEU pipeline cannot be reused after fatal error: %w", p.fatal)
	}
	if !p.boundary {
		return nil, fmt.Errorf("previous file has not completed successfully")
	}
	native, err := p.native.OpenFile(reader, bufio.MaxScanTokenSize)
	if err != nil {
		return nil, err
	}
	source := &NextSource{pipeline: p, native: native}
	p.activeSource = source
	p.boundary = false
	return source, nil
}

func (s *NextSource) Advance(ctx context.Context) ([]messages.Message, error) {
	p := s.pipeline
	if p.activeSource != s {
		return nil, parseerrors.AsFatalError(fmt.Errorf("source is no longer the active file"))
	}
	if p.fatal != nil {
		return nil, p.fatal
	}

	started := time.Now()
	batch, err := s.native.Advance(ctx)
	p.metrics.TotalParseDuration += time.Since(started)
	if err != nil {
		if errors.Is(err, io.EOF) {
			p.boundary = true
		} else if parseerrors.IsFatalError(err) {
			p.fatal = err
		}
		return nil, err
	}
	p.metrics.TotalLinesParsed++

	if p.gear != nil {
		for _, message := range batch {
			if combatant, ok := message.(*messages.Combatant); ok && len(combatant.GearSetups) > 0 {
				p.gear.ResolveGear(combatant.GearSetups)
			}
		}
	}
	started = time.Now()
	batch, err = p.synthetics.ProcessMessages(batch)
	p.syntheticDuration += time.Since(started)
	if err != nil {
		p.fatal = parseerrors.AsFatalError(fmt.Errorf("processing synthetics: %w", err))
		return nil, p.fatal
	}
	return batch, nil
}

func (p *NextPipeline) Metrics() parservanilla.Metrics { return p.metrics }
func (s *NextSource) Metrics() parservanilla.Metrics   { return s.pipeline.Metrics() }

func (p *NextPipeline) DetailedTimes() map[string]time.Duration {
	times := p.native.DetailedTimes()
	times["parser.synthetics"] = p.syntheticDuration
	for name, duration := range p.synthetics.DetailedTimes() {
		times[name] = duration
	}
	return times
}

func (s *NextSource) DetailedTimes() map[string]time.Duration {
	return s.pipeline.DetailedTimes()
}

func (p *NextPipeline) SetRealmClockInfo(info *realmclock.Info) {
	p.native.SetRealmClockInfo(info)
}

func (s *NextSource) SetRealmClockInfo(info *realmclock.Info) {
	s.pipeline.SetRealmClockInfo(info)
}

func (p *NextPipeline) SawRaidGroup() bool { return p.native.SawRaidGroup() }
func (s *NextSource) SawRaidGroup() bool   { return s.pipeline.SawRaidGroup() }

type pipelineNames struct{ pipeline *cleusource.Pipeline }

func (n pipelineNames) Get(id guid.GUID) (string, bool) {
	return n.pipeline.GUIDName(id)
}
