package modern

import (
	"fmt"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"testing"
)

func TestGUIDNormalizerResolvesWorldGUIDCollision(t *testing.T) {
	t.Parallel()

	n := NewGUIDNormalizer()
	raw := "Creature-0-1-564-1-15479-01001E1033"
	prefix := legacyCreatureHigh<<48 | uint64(15479)<<24
	initial := prefix | uint64(CompatibilityHash24(raw))
	n.valueToRaw[initial] = "Creature-0-1-564-1-15479-0000000001"

	normalized, err := n.Normalize(raw)
	require.NoError(t, err)
	expected := prefix | uint64((CompatibilityHash24(raw)+1)&0xFFFFFF)
	assert.Equal(t, fmt.Sprintf("0x%016X", expected), normalized)
	assert.Equal(t, raw, n.valueToRaw[expected])
	assert.Equal(t, expected, n.rawToValue[raw])

	again, err := n.Normalize(raw)
	require.NoError(t, err)
	assert.Equal(t, normalized, again, "repeated GUIDs must keep their allocated identity")
}
