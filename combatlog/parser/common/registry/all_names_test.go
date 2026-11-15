package registry_test

import (
	"slices"
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/Emyrk/chronicle/combatlog/parser/common/registry"
)

func TestAllInstanceNames(t *testing.T) {
	t.Parallel()

	names := registry.AllInstanceNames()
	require.True(t, slices.IsSorted(names))
	for _, want := range []string{
		"Molten Core",
		"Naxxramas",
		"Ulduar",                    // Wrath only
		"Serpentshrine Cavern",      // TBC only
		"Emerald Sanctum",           // Nightmare of Ursol only
		"Upper Tower of Karazhan",   // derived name
		"Lower Tower of Karazhan",   // derived name
		"Scarlet Monastery Library", // VanillaPlus removes it, other flavors keep it
	} {
		require.Contains(t, names, want)
	}
	require.NotContains(t, names, "Not A Raid")
}
