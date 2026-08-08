package dbcdb

import (
	"encoding/binary"
	"testing"

	"github.com/Gophercraft/core/vsn"
	"github.com/stretchr/testify/require"
)

func TestSpellBuild(t *testing.T) {
	t.Parallel()

	stock := make([]byte, 16)
	binary.LittleEndian.PutUint32(stock[12:16], 936)
	require.Equal(t, vsn.V3_3_5a, spellBuild(stock, vsn.V3_3_5a))

	extended := make([]byte, 16)
	binary.LittleEndian.PutUint32(extended[12:16], 956)
	require.Equal(t, ExtendedSpellBuild, spellBuild(extended, vsn.V3_3_5a))

	require.Equal(t, vsn.V1_12_2, spellBuild(nil, vsn.V1_12_2))
}
