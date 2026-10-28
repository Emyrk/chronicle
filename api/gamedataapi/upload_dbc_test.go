package gamedataapi

import (
	"testing"

	"github.com/stretchr/testify/require"
)

func TestDBCFileSizeAllowed(t *testing.T) {
	t.Parallel()

	const epochSpellDBCSize = int64(61_637_636)
	require.True(t, dbcFileSizeAllowed(epochSpellDBCSize))
	require.True(t, dbcFileSizeAllowed(maxDBCFileSize))
	require.False(t, dbcFileSizeAllowed(maxDBCFileSize+1))
}
