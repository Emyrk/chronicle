package characters

import (
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	"github.com/Emyrk/chronicle/combatlog/parser/common/identifier"
	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/common/unitdb"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
)

func TestRoomMechanicResetRoomRebuildsMembership(t *testing.T) {
	t.Parallel()

	all := NewCharacters(unitdb.New(), nil, identifier.NewIdentifier(map[uint32]identifier.Identity{}))
	bossID := guid.GUID(0xF130000000000001 | uint64(100)<<24)
	addID := guid.GUID(0xF130000000000001 | uint64(101)<<24)
	boss, ok := NewRoomMechanic(bossID, 100, all)
	require.True(t, ok)
	add, ok := NewRoomMechanic(addID, 100, all)
	require.True(t, ok)
	require.Len(t, boss.room.Units, 2)
	require.Same(t, boss, boss.room.boss)

	now := time.Date(2026, time.October, 5, 12, 0, 0, 0, time.UTC)
	death := messages.Message(&messages.Slain{MessageBase: messages.Base(now), Victim: addID})
	add.Start("test", death)
	add.Complete("test complete", death)
	require.NotContains(t, boss.room.Units, addID)

	add.pendingDeath = &death
	add.LastSlain = death
	boss.room.done = true
	boss.ResetRoom(boss, add)

	require.False(t, boss.room.done)
	require.Len(t, boss.room.Units, 2)
	require.Same(t, boss, boss.room.boss)
	require.Contains(t, boss.room.Units, addID)
	require.Nil(t, add.pendingDeath)
	require.Nil(t, add.LastSlain)
}
