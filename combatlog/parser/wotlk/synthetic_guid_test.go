package wotlk

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestParseLineSynthesizesPoolOfTarAsVehicle(t *testing.T) {
	t.Parallel()
	line := `1/14 20:40:08.214  SWING_DAMAGE,0xF1300081420007AD,"Pool of Tar",0xa48,0x000000000005B319,"Anasui",0x10512,244,0,1,0,0,0,nil,nil,nil`

	_, event, m, err := ParseLine(line)
	require.NoError(t, err)
	assert.Equal(t, "SWING_DAMAGE", event)

	poolOfTar := m.Guid()
	assert.Equal(t, "0xF1500081420007AD", poolOfTar.String())
	assert.True(t, poolOfTar.IsVehicle())
	entry, ok := poolOfTar.GetEntry()
	require.True(t, ok)
	assert.Equal(t, uint32(33090), entry)
}
