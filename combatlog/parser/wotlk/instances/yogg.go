package instances

import (
	"fmt"
	"slices"
	"strings"

	"github.com/Emyrk/chronicle/combatlog/parser/common/encounter"
)

var yoggKeepers = []struct {
	spell int32
	label string
}{
	{62670, "Freya: Resilience of Nature"},
	{62650, "Hodir: Fortitude of Frost"},
	{62702, "Thorim: Fury of the Storm"},
	{62671, "Mimiron: Speed of Invention"},
}

func yoggEncounterVariant(enc *encounter.Encounter) string {
	if enc.VariantAuras == nil || enc.Combat.Start.IsZero() || !enc.Combat.End.After(enc.Combat.Start) {
		return ""
	}
	var keepers []string
	for _, keeper := range yoggKeepers {
		if slices.Contains(enc.VariantAuras, keeper.spell) {
			keepers = append(keepers, keeper.label)
		}
	}
	// Absence requires earlier recorded encounter coverage in this instance.
	// This intentionally rejects standalone 0-3 Light logs. It is a heuristic,
	// not proof that recording was uninterrupted. All four is positive evidence.
	if len(keepers) < 4 && !enc.HasEarlierEncounter {
		return ""
	}
	enc.VariantTooltip = strings.Join(keepers, "\n")
	if len(keepers) == 0 {
		enc.VariantTooltip = "No keepers assisting."
	}
	return fmt.Sprintf("lights_%d", len(keepers))
}
