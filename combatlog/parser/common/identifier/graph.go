package identifier

import (
	"fmt"
	"maps"

	"github.com/Emyrk/chronicle/internal/stategraph/ownergraph"
)

// RegisterGraphOwner prepares an explicit allowlist of trusted static recipes.
// Factories run only during registration, never while restoring archive data.
// Every restore gets independent maps; trusted pure callbacks remain shared.
func RegisterGraphOwner(r *ownergraph.Registry, recipes ...TrustedRecipe) error {
	if len(recipes) == 0 {
		return fmt.Errorf("at least one trusted identifier recipe required")
	}
	prepared := make(map[string]*Identifier, len(recipes))
	for _, recipe := range recipes {
		if _, exists := prepared[recipe.ID]; exists {
			return fmt.Errorf("duplicate identifier recipe %q", recipe.ID)
		}
		definition, err := recipe.New()
		if err != nil {
			return fmt.Errorf("prepare identifier recipe %q: %w", recipe.ID, err)
		}
		prepared[recipe.ID] = definition
	}

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
		definition, ok := prepared[s.value.RecipeID]
		if !ok {
			return fmt.Errorf("unknown identifier recipe %q", s.value.RecipeID)
		}
		if definition.configuration != s.value.Configuration {
			return fmt.Errorf("identifier configuration mismatch")
		}
		*c = Identifier{
			byEntryId:     maps.Clone(definition.byEntryId),
			unknownUnits:  maps.Clone(s.value.UnknownUnits),
			recipeID:      definition.recipeID,
			configuration: definition.configuration,
		}
		return nil
	}})
}
