package chronicle

import (
	"context"
	"io"
	"strings"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

func TestSortUnixMillisReader_SortsOutOfOrderChunks(t *testing.T) {
	t.Parallel()

	rdr, err := sortUnixMillisReader(context.Background(), strings.NewReader(strings.Join([]string{
		"2000  CHRONICLE_ZONE_INFO,\"Blackrock Depths\",230,138,\"party\"",
		"1000  CHRONICLE_HEADER,\"Realm\",\"3.3.5a\",12340",
		"1500  SPELL_DAMAGE,0x1,\"A\",0x0,0x2,\"B\",0x0,1,\"Spell\",0x1,10,0,1,0,0,0,nil,nil,nil",
	}, "\n")), uuid.MustParse("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"))
	require.NoError(t, err)

	data, err := io.ReadAll(rdr)
	require.NoError(t, err)
	lines := strings.Split(string(data), "\n")
	require.Len(t, lines, 3)
	require.True(t, strings.HasPrefix(lines[0], "1000  CHRONICLE_HEADER"))
	require.True(t, strings.HasPrefix(lines[1], "1500  SPELL_DAMAGE"))
	require.True(t, strings.HasPrefix(lines[2], "2000  CHRONICLE_ZONE_INFO"))
}
