package encountervariant

import (
	"testing"

	"github.com/stretchr/testify/require"
)

func TestSupported(t *testing.T) {
	t.Parallel()
	keys := []string{"towers_0", "towers_1", "towers_2", "towers_3", "towers_4", "towers_5", "normal", "medium", "hard", "lights_0", "lights_1", "lights_2", "lights_3", "lights_4", "", "combined", "lights_5"}
	for _, boss := range []string{"Flame Leviathan", "Assembly of Iron", "Yogg-Saron", "Hodir", "XT-002 Deconstructor", "General Vezax", "Mimiron", "Thorim", "Freya"} {
		for _, key := range keys {
			t.Run(boss+"/"+key, func(t *testing.T) {
				t.Parallel()
				lights := key == "lights_0" || key == "lights_1" || key == "lights_2" || key == "lights_3" || key == "lights_4"
				towers := key == "towers_0" || key == "towers_1" || key == "towers_2" || key == "towers_3" || key == "towers_4"
				binary := key == "normal" || key == "hard"
				require.Equal(t, binary || key == "medium" || lights || towers, Valid(key))
				want := boss == "Flame Leviathan" && towers || boss == "Assembly of Iron" && (binary || key == "medium") || boss == "Yogg-Saron" && lights || (boss == "Mimiron" || boss == "Hodir" || boss == "XT-002 Deconstructor" || boss == "General Vezax" || boss == "Thorim") && binary
				require.Equal(t, want, Supported("Ulduar", boss, key))
				require.False(t, Supported("Other", boss, key))
			})
		}
	}
}
