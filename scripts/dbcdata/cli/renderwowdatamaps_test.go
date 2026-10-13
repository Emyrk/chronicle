package cli

import (
	"encoding/binary"
	"math"
	"testing"

	"github.com/stretchr/testify/require"
)

func wowTestChunk(tag string, payload []byte) []byte {
	data := make([]byte, 8+len(payload))
	for index := range tag {
		data[index] = tag[len(tag)-index-1]
	}
	binary.LittleEndian.PutUint32(data[4:], uint32(len(payload)))
	copy(data[8:], payload)
	return data
}

func TestParseWDTADTRootFileDataIDs(t *testing.T) {
	t.Parallel()

	payload := make([]byte, 64)
	binary.LittleEndian.PutUint32(payload[0:], 101)
	binary.LittleEndian.PutUint32(payload[32:], 202)

	tiles, err := parseWDTADTRootFileDataIDs(wowTestChunk("MAID", payload))
	require.NoError(t, err)
	require.Equal(t, []wdtADTTile{
		{FileDataID: 101, Column: 0, Row: 0},
		{FileDataID: 202, Column: 1, Row: 0},
	}, tiles)
}

func TestParseWMOGroupFileDataIDs(t *testing.T) {
	t.Parallel()

	payload := make([]byte, 8)
	binary.LittleEndian.PutUint32(payload[0:], 301)
	binary.LittleEndian.PutUint32(payload[4:], 302)

	ids, err := parseWMOGroupFileDataIDs(wowTestChunk("GFID", payload))
	require.NoError(t, err)
	require.Equal(t, []int32{301, 302}, ids)
}

func TestParseGlobalWMOPlacement(t *testing.T) {
	t.Parallel()

	payload := make([]byte, 64)
	binary.LittleEndian.PutUint32(payload[0:], 401)
	binary.LittleEndian.PutUint32(payload[8:], math.Float32bits(1.5))
	binary.LittleEndian.PutUint16(payload[62:], 1024)

	placements, rootID, err := parseGlobalWMOPlacement(wowTestChunk("MODF", payload))
	require.NoError(t, err)
	require.Equal(t, int32(401), rootID)
	require.Len(t, placements, 1)
	require.Equal(t, float32(1.5), placements[0].Position[0])
	require.Equal(t, float32(1), placements[0].Scale)
}
