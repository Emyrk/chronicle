package creatures

import (
	"encoding/json"

	"github.com/Emyrk/chronicle/combatlog/parser/common/characters"
	"github.com/Emyrk/chronicle/internal/stategraph/ownergraph"
)

type nefarianGraphValue struct {
	State json.RawMessage `json:"state"`
	All   string          `json:"all"`
}

func (c *nefarian) captureGraphState(ctx *ownergraph.Capture) ([]byte, error) {
	s, e := c.CaptureState(ownergraph.Reference[*characters.RoomMechanic](ctx))
	if e != nil {
		return nil, e
	}
	b, e := s.Encode()
	if e != nil {
		return nil, e
	}
	all, e := ctx.Ref(c.all)
	if e != nil {
		return nil, e
	}
	return json.Marshal(nefarianGraphValue{b, all})
}

func (c *nefarian) restoreGraphState(v uint32, b []byte, ctx *ownergraph.Restore) error {
	var g nefarianGraphValue
	if e := decodeCreatureValue(b, &g); e != nil {
		return e
	}
	s, e := DecodeNefarianState(v, g.State)
	if e != nil {
		return e
	}
	all, e := ownergraph.ResolveAs[*characters.Characters](ctx, g.All)
	if e != nil {
		return e
	}
	return c.RestoreState(s, all, ownergraph.Loader[*characters.RoomMechanic](ctx))
}
