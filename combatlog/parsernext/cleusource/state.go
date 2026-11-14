package cleusource

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"slices"
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/common/parsectx"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/types/realmclock"
	"github.com/Emyrk/chronicle/combatlog/parsernext/formats/cleu"
	"github.com/Emyrk/chronicle/combatlog/parsernext/formats/cleu/companion"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/gamedb/chrondbc"
)

const StateVersion = 1

// State is a complete-file semantic snapshot. It contains neither runtime
// dependencies nor physical source state, timings, spells, or emitted damage.
type State struct {
	Format        database.LogFormat
	Flavor        database.WoWFlavor
	BaseYear      int
	RealmClock    *realmclock.Info
	LastDate      time.Time
	MaxRegression time.Duration
	Excluded      map[string]struct{}
	GUIDNames     map[guid.GUID]string
	Missed        map[chrondbc.SpellID]MissedSpell
	Decoder       cleu.State
	Companion     *companion.State
}

func (s State) validate() error {
	if s.Format == "" || len(s.Flavor) == 0 {
		return fmt.Errorf("missing pipeline metadata")
	}
	if s.Decoder.Context.Format != s.Format || !slices.Equal(s.Decoder.Context.Flavor, s.Flavor) {
		return fmt.Errorf("decoder metadata does not match pipeline")
	}
	if s.MaxRegression < 0 {
		return fmt.Errorf("negative timestamp regression")
	}
	if s.Excluded == nil || s.GUIDNames == nil || s.Missed == nil {
		return fmt.Errorf("missing pipeline maps")
	}
	for _, m := range s.Missed {
		if m.Count < 0 {
			return fmt.Errorf("negative missed spell count")
		}
	}
	if _, err := s.Decoder.Restore(); err != nil {
		return err
	}
	if s.Companion != nil {
		if _, err := s.Companion.Restore(); err != nil {
			return err
		}
	}
	return nil
}

func (p *Pipeline) CaptureState() (State, error) {
	if !p.boundary || !p.cleanEOF {
		return State{}, fmt.Errorf("pipeline snapshot requires successful consumed EOF")
	}
	if p.decoder == nil {
		return State{}, fmt.Errorf("missing decoder")
	}
	s := State{Format: p.format, Flavor: p.flavor, BaseYear: p.baseYear, RealmClock: p.realmClock,
		LastDate: p.lastDate, MaxRegression: p.maxRegression, Excluded: p.excluded, GUIDNames: p.guidNames,
		Missed: p.missed, Decoder: p.decoder.CaptureState()}
	if p.companion != nil {
		c, err := p.companion.CaptureState()
		if err != nil {
			return State{}, err
		}
		s.Companion = &c
	}
	payload, err := s.Encode()
	if err != nil {
		return State{}, err
	}
	return DecodeState(StateVersion, payload)
}

func (s State) Encode() ([]byte, error) {
	if err := s.validate(); err != nil {
		return nil, err
	}
	return json.Marshal(s)
}

func DecodeState(version int, payload []byte) (State, error) {
	if version != StateVersion {
		return State{}, fmt.Errorf("unsupported CLEU state version %d", version)
	}
	var state *State
	if err := cleu.DecodeStateValue(payload, &state); err != nil {
		return State{}, err
	}
	if state == nil {
		return State{}, fmt.Errorf("null CLEU state")
	}
	if err := state.validate(); err != nil {
		return State{}, err
	}
	return *state, nil
}

// Restore allocates detached semantic state without calling a decoder factory,
// spell fetcher, logger, or any other runtime dependency.
func (s State) Restore() (*Pipeline, error) {
	payload, err := s.Encode()
	if err != nil {
		return nil, err
	}
	c, err := DecodeState(StateVersion, payload)
	if err != nil {
		return nil, err
	}
	decoder, err := c.Decoder.Restore()
	if err != nil {
		return nil, err
	}
	p := &Pipeline{format: c.Format, flavor: c.Flavor, baseYear: c.BaseYear, realmClock: c.RealmClock,
		lastDate: c.LastDate, maxRegression: c.MaxRegression, excluded: c.Excluded, guidNames: c.GUIDNames,
		missed: c.Missed, decoder: decoder, boundary: true, cleanEOF: true}
	if c.Companion != nil {
		p.companion, err = c.Companion.Restore()
		if err != nil {
			return nil, err
		}
	}
	return p, nil
}

// WireGraphRuntime validates metadata before invoking the format-owned factory.
// It is separate from semantic restoration so loading state has no callbacks.
func (p *Pipeline) WireGraphRuntime(ctx context.Context, logger *slog.Logger, spells SpellFetcher, factory DecoderFactory) error {
	resolved, ok := parsectx.FromContext(ctx)
	if !ok || resolved.Format != p.format || !slices.Equal(resolved.Flavor, p.flavor) {
		return fmt.Errorf("runtime parse metadata does not match CLEU state")
	}
	if !p.boundary {
		return fmt.Errorf("cannot wire runtime during an open file")
	}
	if spells == nil || factory == nil {
		return fmt.Errorf("spell fetcher and decoder factory required")
	}
	if logger == nil {
		logger = slog.New(slog.NewTextHandler(io.Discard, nil))
	}
	decoder, err := factory(cleu.Context{Format: p.format, Flavor: slices.Clone(p.flavor)}, cleu.Hooks{
		LookupSpell: p.lookupSpell, DecodeCompanion: p.decodeCompanion, RecordGUIDName: p.recordGUIDName,
		WarnUnparsed: func(raw string) { p.logger.Warn("Unparsed line", slog.String("line", raw)) },
	})
	if err != nil {
		return err
	}
	if decoder == nil {
		return fmt.Errorf("decoder factory returned nil")
	}
	ds := decoder.CaptureState()
	if ds.Context.Format != p.format || !slices.Equal(ds.Context.Flavor, p.flavor) {
		return fmt.Errorf("factory decoder metadata mismatch")
	}
	p.logger, p.spells, p.decoder, p.wired = logger, spells, decoder, true
	if p.companion != nil {
		p.companion.WireRuntime(logger)
	}
	return nil
}
