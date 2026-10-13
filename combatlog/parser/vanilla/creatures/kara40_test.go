package creatures

import (
	"testing"
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/common/characters"
	"github.com/Emyrk/chronicle/combatlog/parser/common/identifier"
	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/common/unitdb"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/stretchr/testify/require"
)

func TestKingAllowsExtendedChessPieceActivityGap(t *testing.T) {
	t.Parallel()

	all := characters.NewCharacters(
		unitdb.New(),
		nil,
		identifier.NewIdentifier(map[uint32]identifier.Identity{}),
	)
	kingID := guid.GUID(0xF130000000000000 | uint64(59967)<<24 | 1)
	playerID := guid.GUID(1)
	base := time.Date(2026, time.September, 27, 13, 14, 34, 0, time.UTC)

	king, ok := NewKing(kingID, all)
	require.True(t, ok)
	require.NoError(t, king.Process(&messages.Damage{
		MessageBase: messages.Base(base),
		Caster:      &playerID,
		Target:      kingID,
		Amount:      1,
	}))
	require.True(t, king.IsActive())

	// The reported encounter had a 69-second gap in direct King activity while
	// the raid continued fighting chess pieces. The default 60-second timeout
	// split the final seconds into a separate encounter.
	require.NoError(t, king.Process(&messages.Slain{
		MessageBase: messages.Base(base.Add(70 * time.Second)),
		Victim:      guid.GUID(2),
	}))
	require.True(t, king.IsActive())

	require.NoError(t, king.Process(&messages.Slain{
		MessageBase: messages.Base(base.Add(90*time.Second + time.Millisecond)),
		Victim:      guid.GUID(2),
	}))
	require.False(t, king.IsActive())
}
