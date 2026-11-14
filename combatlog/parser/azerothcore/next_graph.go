package azerothcore

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/azerothcore/synthetic"
	"github.com/Emyrk/chronicle/combatlog/parser/common/parsectx"
	vanilla "github.com/Emyrk/chronicle/combatlog/parser/vanilla"
	native "github.com/Emyrk/chronicle/combatlog/parsernext/azerothcore"
	"github.com/Emyrk/chronicle/combatlog/parsernext/formats/cleu"
	"github.com/Emyrk/chronicle/combatlog/parsernext/formats/cleu/companion"
	"github.com/Emyrk/chronicle/combatlog/parsernext/snapshot"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/gamedb"
	"github.com/Emyrk/chronicle/internal/stategraph"
	"github.com/Emyrk/chronicle/internal/stategraph/ownergraph"
)

const NextPipelineStateType = "azerothcore.NextPipeline"
const NextPipelineStateVersion uint32 = 1

type acoreGraphValue struct {
	Compatibility snapshot.Compatibility   `json:"compatibility"`
	Decoder       stategraph.ValuePayload  `json:"decoder"`
	Companion     *stategraph.ValuePayload `json:"companion"`
	LastDate      time.Time                `json:"last_date"`
	Lines         int64                    `json:"lines"`
}

func acoreConstructionIdentity(ctx context.Context) (*snapshot.Compatibility, error) {
	identity, ok := snapshot.FromContext(ctx)
	if !ok {
		return nil, nil
	}
	if e := identity.Validate(); e != nil {
		return nil, e
	}
	meta, ok := parsectx.FromContext(ctx)
	if !ok || string(meta.Format) != identity.Format || meta.Flavor.CanonicalKey() != identity.Flavor {
		return nil, fmt.Errorf("ACore construction metadata mismatch")
	}
	if meta.DatasetID.String() != "00000000-0000-0000-0000-000000000000" && meta.DatasetID.String() != identity.DatasetID {
		return nil, fmt.Errorf("ACore dataset mismatch")
	}
	return &identity, nil
}

// RegisterNextPipelineGraphOwner archives only retained semantic state. ACore
// synthetics are stateless Judgement credit; extension callbacks bind at runtime.
func RegisterNextPipelineGraphOwner(r *ownergraph.Registry, expected snapshot.Compatibility) error {
	if e := expected.Validate(); e != nil {
		return e
	}
	if expected.Format != string(database.LogFormatAzerothcoreMod) {
		return fmt.Errorf("invalid ACore expected format")
	}
	return ownergraph.Register(r, ownergraph.Codec[NextPipeline]{Type: NextPipelineStateType, Version: NextPipelineStateVersion, Init: func() *NextPipeline { return new(NextPipeline) }, Capture: func(p *NextPipeline, _ *ownergraph.Capture) ([]byte, error) {
		if p == nil || p.graphPending || !p.boundary || !p.completedFile || p.fatal != nil || p.reader != nil || p.input != nil || p.construction == nil {
			return nil, fmt.Errorf("ACore snapshot requires successful complete-file EOF")
		}
		if e := expected.Check(*p.construction); e != nil {
			return nil, e
		}
		ds := p.decoder.CaptureState()
		if string(ds.Context.Format) != expected.Format || ds.Context.Flavor.CanonicalKey() != expected.Flavor {
			return nil, fmt.Errorf("ACore decoder metadata mismatch")
		}
		db, e := ds.Encode()
		if e != nil {
			return nil, e
		}
		value := acoreGraphValue{Compatibility: expected, Decoder: stategraph.ValuePayload{Type: "azerothcore.Decoder", Version: uint32(native.StateVersion), Payload: db}, LastDate: p.lastDate, Lines: p.metrics.TotalLinesParsed}
		if p.companion != nil {
			cs, e := p.companion.CaptureState()
			if e != nil {
				return nil, e
			}
			cb, e := cs.Encode()
			if e != nil {
				return nil, e
			}
			value.Companion = &stategraph.ValuePayload{Type: "cleu.Companion", Version: uint32(companion.StateVersion), Payload: cb}
		}
		return json.Marshal(value)
	}, Restore: func(p *NextPipeline, v uint32, b []byte, _ *ownergraph.Restore) error {
		if v != NextPipelineStateVersion {
			return fmt.Errorf("unsupported ACore pipeline version")
		}
		var g acoreGraphValue
		if e := cleu.DecodeStateValue(b, &g); e != nil {
			return e
		}
		if e := expected.Check(g.Compatibility); e != nil {
			return e
		}
		if g.Decoder.Type != "azerothcore.Decoder" || g.Lines < 0 {
			return fmt.Errorf("invalid ACore state envelope")
		}
		ds, e := native.DecodeState(int(g.Decoder.Version), g.Decoder.Payload)
		if e != nil {
			return e
		}
		if string(ds.Context.Format) != expected.Format || ds.Context.Flavor.CanonicalKey() != expected.Flavor {
			return fmt.Errorf("ACore nested identity mismatch")
		}
		decoder, e := native.RestoreState(ds)
		if e != nil {
			return e
		}
		var cp *companion.Parser
		if g.Companion != nil {
			if g.Companion.Type != "cleu.Companion" {
				return fmt.Errorf("invalid companion owner")
			}
			cs, e := companion.DecodeState(int(g.Companion.Version), g.Companion.Payload)
			if e != nil {
				return e
			}
			cp, e = cs.Restore()
			if e != nil {
				return e
			}
		}
		identity := expected
		*p = NextPipeline{construction: &identity, decoder: decoder, companion: cp, lastDate: g.LastDate, boundary: true, completedFile: true, graphPending: true, metrics: vanilla.Metrics{TotalLinesParsed: g.Lines}}
		return nil
	}})
}
func (p *NextPipeline) ValidateGraphRuntime(ctx context.Context, db gamedb.GameDB) error {
	if p == nil || !p.graphPending || p.construction == nil || db == nil {
		return fmt.Errorf("ACore runtime not ready")
	}
	identity, e := acoreConstructionIdentity(ctx)
	if e != nil {
		return e
	}
	if identity == nil {
		return fmt.Errorf("ACore runtime identity required")
	}
	return p.construction.Check(*identity)
}
func (p *NextPipeline) WireGraphRuntime(ctx context.Context, logger *slog.Logger, db gamedb.GameDB, gear gamedb.GearResolver) error {
	if e := p.ValidateGraphRuntime(ctx, db); e != nil {
		return e
	}
	if logger == nil {
		logger = slog.New(slog.NewTextHandler(io.Discard, nil))
	}
	p.logger = logger
	p.db = db
	p.gear = gear
	if e := p.wireDecoder(ctx); e != nil {
		return e
	}
	if p.companion != nil {
		p.companion.WireRuntime(logger)
	}
	p.synthetics = synthetic.New(ctx, logger, db)
	p.metrics.MatchingTime = map[string]time.Duration{}
	p.metrics.UnmatchingTime = map[string]time.Duration{}
	p.graphPending = false
	return nil
}
