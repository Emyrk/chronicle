package vanilla

import (
	"testing"

	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/stretchr/testify/require"
)

func TestDecodeDeathHasNoAttribution(t *testing.T) {
	t.Parallel()
	batch, err := DecodeRecord(t.Context(), nil, "1771959313535|DEATH|0xF130002D9900DE15")
	require.NoError(t, err)
	require.Len(t, batch, 1)
	death, ok := batch[0].(*messages.Slain)
	require.True(t, ok)
	require.Equal(t, guid.GUID(0xF130002D9900DE15), death.Victim)
	require.Nil(t, death.Killer)
	// require.Nil accepts typed-nil pointers: test the interface itself.
	require.True(t, death.Attribution == nil)
}
