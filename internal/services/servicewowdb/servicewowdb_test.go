package servicewowdb

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestParseVulnerabilitySpellIDs(t *testing.T) {
	t.Parallel()

	t.Run("omitted", func(t *testing.T) {
		ids, err := parseVulnerabilitySpellIDs("")
		require.NoError(t, err)
		assert.Empty(t, ids)
	})

	t.Run("comma separated and deduplicated", func(t *testing.T) {
		ids, err := parseVulnerabilitySpellIDs("1490, 11721,1490")
		require.NoError(t, err)
		assert.Equal(t, []int32{1490, 11721}, ids)
	})

	for _, raw := range []string{"abc", "0", "-1", "1490,"} {
		raw := raw
		t.Run("rejects "+raw, func(t *testing.T) {
			_, err := parseVulnerabilitySpellIDs(raw)
			require.Error(t, err)
		})
	}
}
