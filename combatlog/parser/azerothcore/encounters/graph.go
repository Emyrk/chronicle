package encounters

import (
	"encoding/json"
	"fmt"
	"github.com/Emyrk/chronicle/combatlog/parser/common/identifier"
	"github.com/Emyrk/chronicle/combatlog/parser/common/instances"
	"github.com/Emyrk/chronicle/combatlog/parser/common/instances/instancehook"
	"github.com/Emyrk/chronicle/internal/stategraph/ownergraph"
)

// AzerothCoreHookGraphRecipe can be placed in PrefixHooks (fallback instance)
// or SuffixHooks (registry instance), matching the existing constructor order.
func AzerothCoreHookGraphRecipe() instances.HookGraphRecipe {
	return instances.HookGraphRecipe{ID: "azerothcore.instanceHook", New: func(id *identifier.Identifier) instancehook.Hook { return &AzerothCoreInstanceHook{ID: id} }, Validate: func(h instancehook.Hook, id *identifier.Identifier) bool {
		v, ok := h.(*AzerothCoreInstanceHook)
		return ok && v != nil && id != nil && v.ID == id
	}}
}

func RegisterAzerothCoreHookGraphOwner(r *ownergraph.Registry) error {
	return ownergraph.Register(r, ownergraph.Codec[AzerothCoreInstanceHook]{Type: "azerothcore.instanceHook", Version: 1, Init: func() *AzerothCoreInstanceHook { return new(AzerothCoreInstanceHook) }, Capture: func(h *AzerothCoreInstanceHook, c *ownergraph.Capture) ([]byte, error) {
		if h.ID == nil {
			return nil, fmt.Errorf("missing AzerothCore identifier")
		}
		ref, err := c.Ref(h.ID)
		if err != nil {
			return nil, err
		}
		return json.Marshal(ref)
	}, Restore: func(h *AzerothCoreInstanceHook, v uint32, b []byte, c *ownergraph.Restore) error {
		if v != 1 {
			return fmt.Errorf("unsupported AzerothCore hook version")
		}
		var ref string
		if err := json.Unmarshal(b, &ref); err != nil {
			return err
		}
		if ref == "" {
			return fmt.Errorf("missing AzerothCore identifier reference")
		}
		id, err := ownergraph.LoadAs[*identifier.Identifier](c, ref)
		if err != nil {
			return err
		}
		h.ID = id
		return nil
	}})
}
