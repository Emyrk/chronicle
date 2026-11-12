package messages

import (
	"github.com/Emyrk/chronicle/database/gamedb/chrondbc"
	"github.com/Emyrk/chronicle/internal/stategraph/ownergraph"
)

func RegisterDamageGraphOwner(r *ownergraph.Registry) error {
	return ownergraph.Register(r, ownergraph.Codec[Damage]{Type: DamageStateType, Version: DamageStateVersion, Init: func() *Damage { return new(Damage) }, Capture: func(d *Damage, c *ownergraph.Capture) ([]byte, error) {
		var ref string
		var e error
		if d.SpellData != nil {
			ref, e = c.Ref(d.SpellData)
			if e != nil {
				return nil, e
			}
		}
		s, e := d.CaptureState(ref)
		if e != nil {
			return nil, e
		}
		return s.Encode()
	}, Restore: func(d *Damage, v uint32, b []byte, c *ownergraph.Restore) error {
		s, e := DecodeDamageState(v, b)
		if e != nil {
			return e
		}
		fresh, e := s.Restore(ownergraph.Loader[*chrondbc.Spell](c))
		if e != nil {
			return e
		}
		*d = *fresh
		return nil
	}})
}
