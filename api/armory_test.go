package api

import (
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/Emyrk/chronicle/combatlog/parser/guid"
)

func TestParseArmoryPlayerGUID(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name       string
		identifier string
		expected   guid.GUID
	}{
		{
			name:       "canonical GUID",
			identifier: "0x000000000008C9B8",
			expected:   guid.GUID(0x000000000008C9B8),
		},
		{
			name:       "decimal uint32 game ID",
			identifier: "575928",
			expected:   guid.GUID(0x000000000008C9B8),
		},
		{
			name:       "player name",
			identifier: "Axm",
		},
		{
			name:       "decimal overflow",
			identifier: "4294967296",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			require.Equal(t, tt.expected, parseArmoryPlayerGUID(tt.identifier))
		})
	}
}
