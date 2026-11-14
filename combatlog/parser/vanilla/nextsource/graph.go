package nextsource

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"

	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/vanilla/synthetic"
	next "github.com/Emyrk/chronicle/combatlog/parsernext/vanilla"
	"github.com/Emyrk/chronicle/database/gamedb"
	"github.com/Emyrk/chronicle/database/gamedb/chrondbc"
	"github.com/Emyrk/chronicle/internal/stategraph"
	"github.com/Emyrk/chronicle/internal/stategraph/ownergraph"
)

type pipelineGraphValue struct {
	Compatibility Compatibility                               `json:"compatibility"`
	Decoder       stategraph.ValuePayload                     `json:"decoder"`
	Synthetics    map[stategraph.Path]stategraph.ValuePayload `json:"synthetics"`
	Source        pipelineValue                               `json:"source"`
}

// RegisterGraphOwner registers a file-boundary Pipeline in the caller's ONE
// ownergraph. Damage and Spell paths inside synthetic leaf values point directly
// into that registry, including objects retained by downstream consumers.
// Caller registers Damage and prepared compatible Spell owners separately.
func RegisterGraphOwner(r *ownergraph.Registry, expected Compatibility) error {
	if err := expected.validate(); err != nil {
		return err
	}
	return ownergraph.Register(r, ownergraph.Codec[Pipeline]{Type: pipelineType + ".shared", Version: 1, Init: func() *Pipeline { return new(Pipeline) }, Capture: func(p *Pipeline, c *ownergraph.Capture) ([]byte, error) {
		if p.graphPending || p.failed || !p.boundary || !p.completedFile || p.activeSource != nil {
			return nil, fmt.Errorf("pipeline requires successful EOF with no active reader")
		}
		if p.construction == nil {
			return nil, fmt.Errorf("unbound pipeline")
		}
		if err := p.construction.Check(expected.RuntimeIdentity()); err != nil {
			return nil, err
		}
		if p.format != expected.Format || p.flavor != expected.Flavor || p.buildVersion != expected.BuildVersion || (p.identity != nil && *p.identity != expected) {
			return nil, fmt.Errorf("pipeline construction identity mismatch")
		}
		values, err := p.synthetics.CaptureValues(func(_ guid.GUID, d *messages.Damage) (string, error) { return c.Ref(d) }, func(s *chrondbc.Spell) (string, error) { return c.Ref(s) })
		if err != nil {
			return nil, err
		}
		decoder, err := p.decoder.CaptureState().Encode()
		if err != nil {
			return nil, err
		}
		value := pipelineGraphValue{Compatibility: expected, Decoder: stategraph.ValuePayload{Type: next.DecoderStateType, Version: next.DecoderStateVersion, Payload: decoder}, Synthetics: values, Source: pipelineValue{BuildVersion: p.buildVersion, Missed: p.MissedSpells()}}
		bound := expected
		p.identity = &bound
		return json.Marshal(value)
	}, Restore: func(p *Pipeline, version uint32, b []byte, c *ownergraph.Restore) error {
		if version != 1 {
			return fmt.Errorf("unsupported shared pipeline version")
		}
		var value pipelineGraphValue
		d := json.NewDecoder(bytes.NewReader(b))
		d.DisallowUnknownFields()
		if err := d.Decode(&value); err != nil {
			return err
		}
		if err := d.Decode(new(any)); err != io.EOF {
			return fmt.Errorf("trailing shared pipeline state")
		}
		if value.Compatibility != expected || value.Source.BuildVersion != expected.BuildVersion {
			return fmt.Errorf("shared pipeline compatibility mismatch")
		}
		if value.Decoder.Type != next.DecoderStateType {
			return fmt.Errorf("invalid pipeline decoder type")
		}
		state, err := next.DecodeDecoderState(value.Decoder.Version, value.Decoder.Payload)
		if err != nil {
			return err
		}
		decoder, err := state.Restore(nil, expected.BuildVersion)
		if err != nil {
			return err
		}
		if _, ok := value.Synthetics["/root/synthetics/aura-owner"]; !ok {
			return fmt.Errorf("missing aura ownership state")
		}
		synth, err := synthetic.RestoreSemanticValues(value.Synthetics, ownergraph.Loader[*messages.Damage](c), ownergraph.Loader[*chrondbc.Spell](c))
		if err != nil {
			return err
		}
		identity := expected
		construction := expected.RuntimeIdentity()
		*p = Pipeline{graphPending: true, completedFile: true, boundary: true, construction: &construction, identity: &identity, format: expected.Format, flavor: expected.Flavor, buildVersion: expected.BuildVersion, decoder: decoder, synthetics: synth, missed: value.Source.Missed}
		if p.missed == nil {
			return fmt.Errorf("missing diagnostic counts")
		}
		return nil
	}})
}

func (p *Pipeline) ValidateGraphRuntime(ctx context.Context, db gamedb.GameDB) error {
	if !p.graphPending || p.identity == nil || db == nil {
		return fmt.Errorf("pipeline runtime not ready")
	}
	construction, err := constructionIdentity(ctx)
	if err != nil {
		return err
	}
	if construction == nil {
		return fmt.Errorf("missing runtime identity")
	}
	return construction.Check(p.identity.RuntimeIdentity())
}
func (p *Pipeline) WireGraphRuntime(ctx context.Context, logger *slog.Logger, db gamedb.GameDB, gear gamedb.GearResolver) error {
	if err := p.ValidateGraphRuntime(ctx, db); err != nil {
		return err
	}
	if logger == nil {
		logger = slog.New(slog.NewTextHandler(io.Discard, nil))
	}
	if err := p.synthetics.WireGraphRuntime(ctx, logger, db); err != nil {
		return err
	}
	p.spells = db
	p.decoder.WireGraphRuntime(db, next.DecoderOptions{CountedSpells: p, Combatants: decoderRuntimeOptions(ctx, logger, gear)})
	p.graphPending = false
	return nil
}
