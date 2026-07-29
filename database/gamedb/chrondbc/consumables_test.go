package chrondbc

import (
	"testing"

	"github.com/stretchr/testify/require"
)

func TestConsumableCatalog(t *testing.T) {
	t.Parallel()

	catalog := NewConsumableCatalog(
		[]int32{13442, 13461},
		map[SpellID][]int32{
			17528: {13442},
			17538: {13461, 99999},
		},
	)

	require.True(t, catalog.IsConsumableItem(13442))
	require.False(t, catalog.IsConsumableItem(12345))

	items, ok := catalog.IsConsumableBuff(17538)
	require.True(t, ok)
	require.Equal(t, []int32{13461, 99999}, items)

	items[0] = 0
	itemsAgain, ok := catalog.IsConsumableBuff(17538)
	require.True(t, ok)
	require.Equal(t, []int32{13461, 99999}, itemsAgain, "lookup must return a defensive copy")
}
