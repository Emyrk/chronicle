package critters

import (
	"github.com/stretchr/testify/require"
	"testing"
)

func TestKnownLabels(t *testing.T) {
	t.Parallel()
	require.Len(t, names, 17, "preserve the existing shared critter inventory")
	for entry, want := range names {
		got, known := Name(entry)
		require.True(t, known)
		require.NotEmpty(t, got)
		require.Equal(t, want, got)
	}
	for entry, want := range map[uint32]string{4075: "Rat", 10441: "Plagued Rat", 25254: "Cockroach", 263055: "Crab", 263061: "Toad", 263064: "Snake"} {
		got, known := Name(entry)
		require.True(t, known)
		require.Equal(t, want, got)
	}
	for _, entry := range []uint32{0, 999999} {
		name, known := Name(entry)
		require.False(t, known)
		require.Empty(t, name)
	}
}
