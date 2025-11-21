package types_test

import (
	"testing"

	"github.com/Emyrk/chronicle/golang/internal/ptr"
	"github.com/Emyrk/chronicle/golang/wowlogs/types"
	"github.com/stretchr/testify/require"
)

func TestParseSpell(t *testing.T) {
	t.Parallel()

	cases := []struct {
		name      string
		input     string
		expected  types.Spell
		expectErr bool
	}{
		{
			name:      "Empty",
			expectErr: true,
		},
		{
			name:  "WithID",
			input: "Heavy Silk Bandage(7929)",
			expected: types.Spell{
				Name: "Heavy Silk Bandage",
				ID:   7929,
			},
		},
		{
			name:  "WithRank",
			input: "Conjure Water(10140)(Rank 7)",
			expected: types.Spell{
				Name: "Conjure Water",
				ID:   10140,
				Rank: ptr.Ref(7),
			},
		},
		{
			name:      "NoEndParen",
			input:     "Heavy Silk Bandage(7929",
			expectErr: true,
		},
		{
			name:      "NoEndParenRank",
			input:     "Heavy Silk Bandage(7929)(Rank 3",
			expectErr: true,
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			spell, err := types.ParseSpell(tc.input)
			if tc.expectErr {
				require.Error(t, err)
				return
			}

			require.NoError(t, err)
			require.Equal(t, tc.expected, spell)
		})
	}
}
