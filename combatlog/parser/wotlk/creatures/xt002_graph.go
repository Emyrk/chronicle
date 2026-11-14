package creatures

import (
	"encoding/json"
	"fmt"

	"github.com/Emyrk/chronicle/combatlog/parser/common/characters"
	"github.com/Emyrk/chronicle/internal/stategraph/ownergraph"
)

type xt002GraphValue struct {
	Common string `json:"common"`
	All    string `json:"all"`
}

func (c *xt002Character) validateGraph() error {
	if c.Common == nil || c.all == nil || c.Lookup() != c.all {
		return fmt.Errorf("invalid XT-002 canonical character dependencies")
	}
	entry, ok := c.ID().GetEntry()
	if !ok || (entry != 33293 && entry != 33885) {
		return fmt.Errorf("invalid XT-002 identity")
	}
	return nil
}
func registerXT002GraphOwner(r *ownergraph.Registry) error {
	return ownergraph.Register(r, ownergraph.Codec[xt002Character]{Type: "wotlk.xt002Character", Version: 1, Init: func() *xt002Character { return new(xt002Character) },
		Capture: func(c *xt002Character, ctx *ownergraph.Capture) ([]byte, error) {
			if err := c.validateGraph(); err != nil {
				return nil, err
			}
			common, err := ctx.Ref(c.Common)
			if err != nil {
				return nil, err
			}
			all, err := ctx.Ref(c.all)
			if err != nil {
				return nil, err
			}
			return json.Marshal(xt002GraphValue{common, all})
		}, Restore: func(c *xt002Character, v uint32, b []byte, ctx *ownergraph.Restore) error {
			if v != 1 {
				return fmt.Errorf("unsupported XT-002 owner version")
			}
			var state xt002GraphValue
			if err := decodeExpansionValue(b, &state); err != nil {
				return err
			}
			common, err := ownergraph.LoadAs[*characters.Common](ctx, state.Common)
			if err != nil {
				return err
			}
			all, err := ownergraph.ResolveAs[*characters.Characters](ctx, state.All)
			if err != nil {
				return err
			}
			c.Common, c.all = common, all
			return nil
		}, Validate: (*xt002Character).validateGraph})
}
