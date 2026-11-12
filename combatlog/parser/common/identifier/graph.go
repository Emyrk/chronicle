package identifier

import "github.com/Emyrk/chronicle/internal/stategraph/ownergraph"

func RegisterGraphOwner(r *ownergraph.Registry, recipe TrustedRecipe) error {
	return ownergraph.Register(r, ownergraph.Codec[Identifier]{Type: StateType, Version: StateVersion, Init: func() *Identifier { return new(Identifier) }, Capture: func(c *Identifier, _ *ownergraph.Capture) ([]byte, error) {
		s, e := c.CaptureState()
		if e != nil {
			return nil, e
		}
		return s.Encode()
	}, Restore: func(c *Identifier, v uint32, b []byte, _ *ownergraph.Restore) error {
		s, e := DecodeState(v, b)
		if e != nil {
			return e
		}
		fresh, e := s.Restore(recipe)
		if e != nil {
			return e
		}
		*c = *fresh
		return nil
	}})
}
