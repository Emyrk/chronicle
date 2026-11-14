package wotlk

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/common/parsectx"
	"github.com/Emyrk/chronicle/combatlog/parser/common/registry"
	vanilla "github.com/Emyrk/chronicle/combatlog/parser/vanilla"
	"github.com/Emyrk/chronicle/combatlog/parser/wotlk/synthetic"
	"github.com/Emyrk/chronicle/combatlog/parsernext/cleusource"
	"github.com/Emyrk/chronicle/combatlog/parsernext/formats/cleu"
	"github.com/Emyrk/chronicle/combatlog/parsernext/snapshot"
	nexttbc "github.com/Emyrk/chronicle/combatlog/parsernext/tbc"
	nextwrath "github.com/Emyrk/chronicle/combatlog/parsernext/wotlk"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/gamedb"
	"github.com/Emyrk/chronicle/database/gamedb/chrondbc"
	"github.com/Emyrk/chronicle/internal/stategraph"
	"github.com/Emyrk/chronicle/internal/stategraph/ownergraph"
)

const NextPipelineStateType = "wotlk.NextPipeline"
const NextPipelineStateVersion uint32 = 1

type nextPipelineValue struct {
	Compatibility snapshot.Compatibility  `json:"compatibility"`
	Native        stategraph.ValuePayload `json:"native"`
	Synthetics    stategraph.ValuePayload `json:"synthetics"`
	Lines         int64                   `json:"lines"`
}

func nextConstructionIdentity(ctx context.Context) (*snapshot.Compatibility, error) {
	identity, ok := snapshot.FromContext(ctx)
	if !ok {
		return nil, nil
	}
	if e := identity.Validate(); e != nil {
		return nil, e
	}
	metadata, ok := parsectx.FromContext(ctx)
	if !ok || identity.Format != string(metadata.Format) || identity.Flavor != metadata.Flavor.CanonicalKey() {
		return nil, fmt.Errorf("construction identity differs from format/flavor")
	}
	if metadata.DatasetID.String() != "00000000-0000-0000-0000-000000000000" && metadata.DatasetID.String() != identity.DatasetID {
		return nil, fmt.Errorf("construction dataset mismatch")
	}
	return &identity, nil
}

// RegisterNextPipelineGraphOwner composes native and synthetic state into the
// enclosing ownergraph. Damage and Spell references never enter a side graph.
// Register shared message/prepared-spell codecs separately before capture.
func RegisterNextPipelineGraphOwner(r *ownergraph.Registry, expected snapshot.Compatibility) error {
	if e := expected.Validate(); e != nil {
		return e
	}
	if expected.Format != string(database.LogFormat243CcAddon) && expected.Format != string(database.LogFormat335aCcAddon) {
		return fmt.Errorf("unsupported CLEU pipeline identity")
	}
	return ownergraph.Register(r, ownergraph.Codec[NextPipeline]{Type: NextPipelineStateType, Version: NextPipelineStateVersion, Init: func() *NextPipeline { return new(NextPipeline) }, Capture: func(p *NextPipeline, ctx *ownergraph.Capture) ([]byte, error) {
		if p == nil || p.graphPending || !p.completedFile || !p.boundary || p.fatal != nil || p.construction == nil {
			return nil, fmt.Errorf("CLEU capture requires bound successful complete-file EOF")
		}
		if e := expected.Check(*p.construction); e != nil {
			return nil, e
		}
		native, e := p.native.CaptureState()
		if e != nil {
			return nil, e
		}
		if string(native.Format) != expected.Format || native.Flavor.CanonicalKey() != expected.Flavor {
			return nil, fmt.Errorf("native decoder differs from construction identity")
		}
		nativeBytes, e := native.Encode()
		if e != nil {
			return nil, e
		}
		synth, ok := p.synthetics.(*synthetic.Synthetic)
		if !ok {
			return nil, fmt.Errorf("unsupported synthetic owner %T", p.synthetics)
		}
		state, e := synth.CaptureState(ownergraph.Reference[*messages.Damage](ctx), ownergraph.Reference[*chrondbc.Spell](ctx))
		if e != nil {
			return nil, e
		}
		if e := state.ValidateFormat(native.Format); e != nil {
			return nil, e
		}
		synthBytes, e := state.Encode()
		if e != nil {
			return nil, e
		}
		return json.Marshal(nextPipelineValue{Compatibility: expected, Native: stategraph.ValuePayload{Type: "cleusource.Pipeline", Version: uint32(cleusource.StateVersion), Payload: nativeBytes}, Synthetics: stategraph.ValuePayload{Type: synthetic.StateType, Version: synthetic.StateVersion, Payload: synthBytes}, Lines: p.metrics.TotalLinesParsed})
	}, Restore: func(p *NextPipeline, v uint32, b []byte, ctx *ownergraph.Restore) error {
		if v != NextPipelineStateVersion {
			return fmt.Errorf("unsupported CLEU pipeline version")
		}
		var value nextPipelineValue
		if e := decodeNextValue(b, &value); e != nil {
			return e
		}
		if e := expected.Check(value.Compatibility); e != nil {
			return e
		}
		if value.Lines < 0 || value.Native.Type != "cleusource.Pipeline" || value.Synthetics.Type != synthetic.StateType {
			return fmt.Errorf("invalid retained owner envelope")
		}
		nativeState, e := cleusource.DecodeState(int(value.Native.Version), value.Native.Payload)
		if e != nil {
			return e
		}
		synthState, e := synthetic.DecodeState(value.Synthetics.Version, value.Synthetics.Payload)
		if e != nil {
			return e
		}
		if string(nativeState.Format) != expected.Format || nativeState.Flavor.CanonicalKey() != expected.Flavor {
			return fmt.Errorf("native decoder identity mismatch")
		}
		if e := synthState.ValidateFormat(nativeState.Format); e != nil {
			return e
		}
		native, e := nativeState.Restore()
		if e != nil {
			return e
		}
		synth, e := synthState.Restore(ownergraph.Loader[*messages.Damage](ctx), ownergraph.Loader[*chrondbc.Spell](ctx))
		if e != nil {
			return e
		}
		identity := expected
		*p = NextPipeline{native: native, synthetics: synth, boundary: true, completedFile: true, graphPending: true, construction: &identity, metrics: vanilla.Metrics{TotalLinesParsed: value.Lines}}
		return nil
	}})
}
func (p *NextPipeline) ValidateGraphRuntime(ctx context.Context, db gamedb.GameDB, reg *registry.Registry) error {
	if p == nil || !p.graphPending || p.construction == nil || db == nil {
		return fmt.Errorf("CLEU graph runtime not ready")
	}
	identity, e := nextConstructionIdentity(ctx)
	if e != nil {
		return e
	}
	if identity == nil {
		return fmt.Errorf("missing runtime identity")
	}
	if e := p.construction.Check(*identity); e != nil {
		return e
	}
	synth, ok := p.synthetics.(*synthetic.Synthetic)
	if !ok {
		return fmt.Errorf("unsupported synthetic owner")
	}
	return synth.ValidateGraphRuntime(ctx, db, reg, pipelineNames{p.native})
}
func (p *NextPipeline) WireGraphRuntime(ctx context.Context, logger *slog.Logger, db gamedb.GameDB, gear gamedb.GearResolver, reg *registry.Registry) error {
	if e := p.ValidateGraphRuntime(ctx, db, reg); e != nil {
		return e
	}
	if logger == nil {
		logger = slog.New(slog.NewTextHandler(io.Discard, nil))
	}
	var factory cleusource.DecoderFactory
	switch p.construction.Format {
	case string(database.LogFormat243CcAddon):
		factory = func(c cleu.Context, h cleu.Hooks) (*cleu.Decoder, error) {
			return nexttbc.NewDecoder(nexttbc.DecoderContext{Format: c.Format, Flavor: c.Flavor}, h)
		}
	case string(database.LogFormat335aCcAddon):
		factory = func(c cleu.Context, h cleu.Hooks) (*cleu.Decoder, error) {
			return nextwrath.NewDecoder(nextwrath.DecoderContext{Format: c.Format, Flavor: c.Flavor}, h)
		}
	default:
		return fmt.Errorf("unsupported runtime decoder")
	}
	if e := p.native.WireGraphRuntime(ctx, logger, db, factory); e != nil {
		return e
	}
	if e := p.synthetics.(*synthetic.Synthetic).WireGraphRuntime(ctx, logger, db, reg, pipelineNames{p.native}); e != nil {
		return e
	}
	p.gear = gear
	p.metrics.MatchingTime = map[string]time.Duration{}
	p.metrics.UnmatchingTime = map[string]time.Duration{}
	p.graphPending = false
	return nil
}
