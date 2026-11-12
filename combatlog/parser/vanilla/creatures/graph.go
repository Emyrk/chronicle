package creatures

import (
	"encoding/json"
	"github.com/Emyrk/chronicle/combatlog/parser/common/characters"
	"github.com/Emyrk/chronicle/internal/stategraph/ownergraph"
)

// RegisterNefarianGraphOwner is the explicit adapter for the bounded Nefarian
// character graph. Other concrete owners remain unsupported until registered.
func RegisterNefarianGraphOwner(r *ownergraph.Registry) error {
	type value struct {
		State json.RawMessage `json:"state"`
		All   string          `json:"all"`
	}
	return ownergraph.Register(r, ownergraph.Codec[nefarian]{Type: NefarianStateType, Version: NefarianStateVersion, Init: InitNefarian, Capture: func(c *nefarian, ctx *ownergraph.Capture) ([]byte, error) {
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
		return json.Marshal(value{b, all})
	}, Restore: func(c *nefarian, v uint32, b []byte, ctx *ownergraph.Restore) error {
		var g value
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
	}})
}
