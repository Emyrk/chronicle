package servicewowdb

import (
	"testing"

	"github.com/stretchr/testify/require"
)

func TestApplyClassBuffIgnores(t *testing.T) {
	t.Parallel()
	byClass := map[string][]classBuffSpell{
		"Priest": {
			{ID: 1243, Name: "Power Word: Fortitude"},
			{ID: 1244, Name: " power word: fortitude "},
			{ID: 21562, Name: "Prayer of Fortitude"},
		},
	}

	applyClassBuffIgnores(byClass, []string{"power word: fortitude"})

	require.True(t, byClass["Priest"][0].Ignored)
	require.True(t, byClass["Priest"][1].Ignored)
	require.False(t, byClass["Priest"][2].Ignored)
}
