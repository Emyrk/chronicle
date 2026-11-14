package unitdb

import (
	"github.com/Emyrk/chronicle/database/gamedb/chrondbc"
	"github.com/Emyrk/chronicle/internal/stategraph/ownergraph"
)

func RegisterGraphOwner(r *ownergraph.Registry) error {
	return ownergraph.Register(r, ownergraph.Codec[Units]{Type: StateType, Version: StateVersion, Init: func() *Units { return new(Units) }, Capture: func(c *Units, ctx *ownergraph.Capture) ([]byte, error) {
		s, e := c.CaptureState(ownergraph.Reference[*chrondbc.Spell](ctx))
		if e != nil {
			return nil, e
		}
		return s.Encode()
	}, Restore: func(c *Units, v uint32, b []byte, ctx *ownergraph.Restore) error {
		s, e := DecodeState(v, b)
		if e != nil {
			return e
		}
		fresh, e := s.Restore(ownergraph.Loader[*chrondbc.Spell](ctx))
		if e != nil {
			return e
		}
		*c = *fresh
		return nil
	}})
}
