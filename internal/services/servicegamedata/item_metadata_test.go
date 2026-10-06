package servicegamedata

import (
	"testing"

	"github.com/stretchr/testify/require"
)

func TestNormalizeItemMetadataIDs(t *testing.T) {
	t.Parallel()

	ids, ok := normalizeItemMetadataIDs([]int32{3, 0, 2, 3, -1, 1})
	require.True(t, ok)
	require.Equal(t, []int32{1, 2, 3}, ids)
}

func TestNormalizeItemMetadataIDsRejectsOversizedRequest(t *testing.T) {
	t.Parallel()

	ids := make([]int32, maxItemMetadataIDs+1)
	_, ok := normalizeItemMetadataIDs(ids)
	require.False(t, ok)
}
