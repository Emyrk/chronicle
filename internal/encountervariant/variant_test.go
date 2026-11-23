package encountervariant

import (
	"testing"

	"github.com/stretchr/testify/require"
)

func TestSupported(t *testing.T) {
	t.Parallel()
	keys := []string{"normal", "medium", "hard", "lights_0", "lights_1", "lights_2", "lights_3", "lights_4", "", "combined", "lights_5"}
	for _, boss := range []string{"Assembly of Iron", "Yogg-Saron", "Hodir", "XT-002 Deconstructor", "General Vezax", "Freya"} {
		for _, key := range keys {
			t.Run(boss+"/"+key, func(t *testing.T) {
				t.Parallel()
				lights := key == "lights_0" || key == "lights_1" || key == "lights_2" || key == "lights_3" || key == "lights_4"
				binary := key == "normal" || key == "hard"
				require.Equal(t, binary || key == "medium" || lights, Valid(key))
				want := boss == "Assembly of Iron" && (binary || key == "medium") || boss == "Yogg-Saron" && lights || (boss == "Hodir" || boss == "XT-002 Deconstructor" || boss == "General Vezax") && binary
				require.Equal(t, want, Supported("Ulduar", boss, key))
				require.False(t, Supported("Other", boss, key))
			})
		}
	}
}
