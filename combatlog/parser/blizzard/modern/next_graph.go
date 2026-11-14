package modern

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"maps"
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/common/parsectx"
	"github.com/Emyrk/chronicle/combatlog/parser/common/registry"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/types/realmclock"
	vanilla "github.com/Emyrk/chronicle/combatlog/parser/vanilla"
	"github.com/Emyrk/chronicle/combatlog/parser/wotlk/synthetic"
	"github.com/Emyrk/chronicle/combatlog/parsernext/formats/cleu"
	"github.com/Emyrk/chronicle/combatlog/parsernext/formats/cleu/companion"
	native "github.com/Emyrk/chronicle/combatlog/parsernext/formats/modern"
	"github.com/Emyrk/chronicle/combatlog/parsernext/snapshot"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/gamedb"
	"github.com/Emyrk/chronicle/database/gamedb/chrondbc"
	"github.com/Emyrk/chronicle/internal/stategraph"
	"github.com/Emyrk/chronicle/internal/stategraph/ownergraph"
)

const NextPipelineStateType = "modern.NextPipeline"
const NextPipelineStateVersion uint32 = 1

type modernGraphValue struct {
	Compatibility snapshot.Compatibility  `json:"compatibility"`
	Decoder       stategraph.ValuePayload `json:"decoder"`
	Companion     stategraph.ValuePayload `json:"companion"`
	Synthetics    stategraph.ValuePayload `json:"synthetics"`
	Names         map[guid.GUID]string    `json:"names"`
	Year          int                     `json:"year"`
	Clock         *realmclock.Info        `json:"clock"`
	Latest        time.Time               `json:"latest"`
	Lines         int64                   `json:"lines"`
}

func modernConstructionIdentity(ctx context.Context) (*snapshot.Compatibility, error) {
	identity, ok := snapshot.FromContext(ctx)
	if !ok {
		return nil, nil
	}
	if e := identity.Validate(); e != nil {
		return nil, e
	}
	metadata, ok := parsectx.FromContext(ctx)
	if !ok || identity.Format != string(metadata.Format) || identity.Flavor != metadata.Flavor.CanonicalKey() {
		return nil, fmt.Errorf("construction metadata differs from identity")
	}
	if metadata.DatasetID.String() != "00000000-0000-0000-0000-000000000000" && metadata.DatasetID.String() != identity.DatasetID {
		return nil, fmt.Errorf("construction dataset mismatch")
	}
	return &identity, nil
}
func RegisterNextPipelineGraphOwner(r *ownergraph.Registry, expected snapshot.Compatibility) error {
	if e := expected.Validate(); e != nil {
		return e
	}
	switch database.LogFormat(expected.Format) {
	case database.LogFormatV9Cleu, database.LogFormatV22Cleu, database.LogFormatHermesproxy1142Cc:
	default:
		return fmt.Errorf("unsupported modern identity format")
	}
	return ownergraph.Register(r, ownergraph.Codec[NextPipeline]{Type: NextPipelineStateType, Version: NextPipelineStateVersion, Init: func() *NextPipeline { return new(NextPipeline) }, Capture: func(p *NextPipeline, ctx *ownergraph.Capture) ([]byte, error) {
		if p == nil || p.graphPending || !p.boundary || !p.completedFile || p.fatal != nil || p.reader != nil || len(p.pending) != 0 || p.construction == nil {
			return nil, fmt.Errorf("modern snapshot requires successful drained EOF")
		}
		if e := expected.Check(*p.construction); e != nil {
			return nil, e
		}
		decoder, e := p.decoder.CaptureState()
		if e != nil {
			return nil, e
		}
		if string(decoder.Format) != expected.Format || decoder.Flavor.CanonicalKey() != expected.Flavor {
			return nil, fmt.Errorf("modern decoder identity mismatch")
		}
		db, e := decoder.Encode()
		if e != nil {
			return nil, e
		}
		cp, e := p.companion.CaptureState()
		if e != nil {
			return nil, e
		}
		cb, e := cp.Encode()
		if e != nil {
			return nil, e
		}
		sy, e := p.synthetics.CaptureState(ownergraph.Reference[*messages.Damage](ctx), ownergraph.Reference[*chrondbc.Spell](ctx))
		if e != nil {
			return nil, e
		}
		if e := sy.ValidateOptions(p.format, modernSyntheticOptions()); e != nil {
			return nil, e
		}
		sb, e := sy.Encode()
		if e != nil {
			return nil, e
		}
		var clock *realmclock.Info
		if p.clock != nil {
			c := *p.clock
			clock = &c
		}
		return json.Marshal(modernGraphValue{Compatibility: expected, Decoder: stategraph.ValuePayload{Type: "modern.Decoder", Version: native.StateVersion, Payload: db}, Companion: stategraph.ValuePayload{Type: "cleu.Companion", Version: uint32(companion.StateVersion), Payload: cb}, Synthetics: stategraph.ValuePayload{Type: synthetic.StateType, Version: synthetic.StateVersion, Payload: sb}, Names: maps.Clone(p.names.values), Year: p.year, Clock: clock, Latest: p.latest, Lines: p.lines})
	}, Restore: func(p *NextPipeline, v uint32, b []byte, ctx *ownergraph.Restore) error {
		if v != NextPipelineStateVersion {
			return fmt.Errorf("unsupported modern pipeline version")
		}
		var g modernGraphValue
		if e := cleu.DecodeStateValue(b, &g); e != nil {
			return e
		}
		if e := expected.Check(g.Compatibility); e != nil {
			return e
		}
		if g.Decoder.Type != "modern.Decoder" || g.Companion.Type != "cleu.Companion" || g.Synthetics.Type != synthetic.StateType || g.Names == nil || g.Year < 1 || g.Lines < 0 {
			return fmt.Errorf("invalid modern state envelope")
		}
		ds, e := native.DecodeState(g.Decoder.Version, g.Decoder.Payload)
		if e != nil {
			return e
		}
		if string(ds.Format) != expected.Format || ds.Flavor.CanonicalKey() != expected.Flavor {
			return fmt.Errorf("modern nested identity mismatch")
		}
		cs, e := companion.DecodeState(int(g.Companion.Version), g.Companion.Payload)
		if e != nil {
			return e
		}
		ss, e := synthetic.DecodeState(g.Synthetics.Version, g.Synthetics.Payload)
		if e != nil {
			return e
		}
		if e := ss.ValidateOptions(ds.Format, modernSyntheticOptions()); e != nil {
			return e
		}
		decoder, e := ds.Restore()
		if e != nil {
			return e
		}
		cp, e := cs.Restore()
		if e != nil {
			return e
		}
		sy, e := ss.Restore(ownergraph.Loader[*messages.Damage](ctx), ownergraph.Loader[*chrondbc.Spell](ctx))
		if e != nil {
			return e
		}
		identity := expected
		*p = NextPipeline{decoder: decoder, companion: cp, synthetics: sy, names: &pipelineNames{values: maps.Clone(g.Names)}, year: g.Year, clock: g.Clock, latest: g.Latest, lines: g.Lines, format: ds.Format, construction: &identity, boundary: true, completedFile: true, graphPending: true}
		return nil
	}})
}
func (p *NextPipeline) ValidateGraphRuntime(ctx context.Context, db gamedb.GameDB, reg *registry.Registry) error {
	if p == nil || !p.graphPending || p.construction == nil || db == nil {
		return fmt.Errorf("modern runtime not ready")
	}
	identity, e := modernConstructionIdentity(ctx)
	if e != nil {
		return e
	}
	if identity == nil {
		return fmt.Errorf("runtime identity required")
	}
	if e := p.construction.Check(*identity); e != nil {
		return e
	}
	if e := p.decoder.ValidateGraphRuntime(ctx); e != nil {
		return e
	}
	return p.synthetics.ValidateGraphRuntimeWithOptions(ctx, db, reg, p.names, modernSyntheticOptions())
}
func (p *NextPipeline) WireGraphRuntime(ctx context.Context, logger *slog.Logger, db gamedb.GameDB, gear gamedb.GearResolver, reg *registry.Registry) error {
	_ = gear
	if e := p.ValidateGraphRuntime(ctx, db, reg); e != nil {
		return e
	}
	if logger == nil {
		logger = slog.New(slog.NewTextHandler(io.Discard, nil))
	}
	p.logger = logger
	p.db = db
	if e := p.decoder.WireGraphRuntime(ctx, p.decoderOptions()); e != nil {
		return e
	}
	p.companion.WireRuntime(logger)
	if e := p.synthetics.WireGraphRuntimeWithOptions(ctx, logger, db, reg, p.names, modernSyntheticOptions()); e != nil {
		return e
	}
	p.graphPending = false
	return nil
}
func (p *NextPipeline) GUIDMappings() []GUIDMapping             { return p.decoder.GUIDMappings() }
func (p *NextPipeline) SawRaidGroup() bool                      { return p.companion.SawRaidGroup() }
func (p *NextPipeline) SetRealmClockInfo(info *realmclock.Info) { p.setRealmClock(info) }
func (p *NextPipeline) Metrics() vanilla.Metrics {
	return vanilla.Metrics{TotalParseDuration: p.parseDuration, TotalLinesParsed: p.lines}
}
func (p *NextPipeline) DetailedTimes() map[string]time.Duration {
	result := p.synthetics.DetailedTimes()
	result["parser.line_parse"] = p.parseDuration
	result["parser.synthetics"] = p.syntheticDuration
	return result
}
