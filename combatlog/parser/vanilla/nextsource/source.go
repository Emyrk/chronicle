// Package nextsource composes parsernext Vanilla records with the existing
// synthetic pipeline. It is an opt-in compatibility boundary, not a production
// parser selection. Consumers and publication remain outside parsernext.
package nextsource

import (
	"context"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"maps"
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/common/parsectx"
	"github.com/Emyrk/chronicle/combatlog/parser/vanilla/synthetic"
	next "github.com/Emyrk/chronicle/combatlog/parsernext/vanilla"
	"github.com/Emyrk/chronicle/database/gamedb"
	"github.com/Emyrk/chronicle/database/gamedb/chrondbc"
)

// Pipeline retains semantic state across consecutive complete files. Use one
// serial file source at a time. It owns no consumer, finalizer or write service.
type Pipeline struct {
	identity          *Compatibility
	activeSource      *Source
	boundary          bool
	buildVersion      string
	format            string
	flavor            string
	decoder           *next.Decoder
	synthetics        *synthetic.Synthetic
	spells            next.SpellLookup
	missed            map[chrondbc.SpellID]MissedSpell
	lineDuration      time.Duration
	syntheticDuration time.Duration
}

type MissedSpell struct {
	Count int
	Name  string
}

// New keeps the legacy read dependencies and constructor context for synthetics.
// GameDB is the existing read-only game-data interface, not a publication store.
func New(ctx context.Context, logger *slog.Logger, db gamedb.GameDB, gear gamedb.GearResolver, buildVersion string) (*Pipeline, error) {
	if db == nil {
		return nil, fmt.Errorf("wowDB cannot be nil")
	}
	if logger == nil {
		logger = slog.New(slog.NewTextHandler(io.Discard, nil))
	}
	_, trees := parsectx.DatasetTalents(ctx)
	format, _ := parsectx.Format(ctx)
	flavor, _ := parsectx.Flavor(ctx)
	p := &Pipeline{boundary: true, buildVersion: buildVersion, format: string(format), flavor: flavor.CanonicalKey(), spells: db, missed: make(map[chrondbc.SpellID]MissedSpell), synthetics: synthetic.New(ctx, logger, db, synthetic.WithAuraCastCorrelation())}
	p.decoder = next.NewDecoder(db, buildVersion, next.DecoderOptions{CountedSpells: p, Combatants: next.CombatantOptions{TalentTrees: trees, Gear: gear, Logger: logger}})
	return p, nil
}

func (p *Pipeline) Spell(ctx context.Context, id chrondbc.SpellID) (*chrondbc.Spell, error) {
	spell, err := p.spells.Spell(ctx, id)
	if err != nil {
		entry := p.missed[id]
		entry.Count++
		p.missed[id] = entry
		if chrondbc.IsSpellNotFound(err) {
			unknown := chrondbc.UnknownSpell(id)
			return &unknown, nil
		}
	}
	return spell, err
}

func (p *Pipeline) MissedSpells() map[chrondbc.SpellID]MissedSpell { return maps.Clone(p.missed) }
func (p *Pipeline) Capabilities() next.Capabilities                { return p.decoder.Capabilities() }
func (p *Pipeline) DetailedTimes() map[string]time.Duration {
	times := p.synthetics.DetailedTimes()
	times["parser.line_parse"] = p.lineDuration
	times["parser.synthetics"] = p.syntheticDuration
	return times
}

// Source is file-local. EOF does not finalize or reset its Pipeline. The embedded
// source exposes only physical ingestion Summary, never authoritative results.
type Source struct {
	*next.Source
	pipeline *Pipeline
}

func (p *Pipeline) OpenFile(reader io.Reader, maxLineBytes int) (*Source, error) {
	if !p.boundary {
		return nil, fmt.Errorf("previous file has not completed successfully")
	}
	source, err := next.NewSource(reader, maxLineBytes, p.decoder)
	if err != nil {
		return nil, err
	}
	p.boundary = false
	p.activeSource = &Source{Source: source, pipeline: p}
	return p.activeSource, nil
}

func (s *Source) Advance(ctx context.Context) ([]messages.Message, error) {
	if s.pipeline.activeSource != s {
		return nil, fmt.Errorf("source is no longer the active file")
	}
	now := time.Now()
	batch, err := s.Source.Advance(ctx)
	s.pipeline.lineDuration += time.Since(now)
	if err != nil {
		if errors.Is(err, io.EOF) {
			s.pipeline.boundary = true
		}
		return nil, err
	}
	now = time.Now()
	batch, err = s.pipeline.synthetics.ProcessMessages(batch)
	s.pipeline.syntheticDuration += time.Since(now)
	if err != nil {
		return nil, fmt.Errorf("processing synthetics: %w", err)
	}
	return batch, nil
}

func (s *Source) DetailedTimes() map[string]time.Duration { return s.pipeline.DetailedTimes() }

// MissedSpells exposes the pipeline's diagnostic counts without changing the
// legacy daemon's report conversion contract.
func (s *Source) MissedSpells() map[chrondbc.SpellID]MissedSpell {
	return s.pipeline.MissedSpells()
}
