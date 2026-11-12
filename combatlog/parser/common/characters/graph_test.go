package characters

import (
	"github.com/Emyrk/chronicle/combatlog/parser/common/characters/period"
	"github.com/Emyrk/chronicle/combatlog/parser/common/identifier"
	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/common/unitdb"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/internal/stategraph/ownergraph"
	"github.com/stretchr/testify/require"
	"testing"
	"time"
)

func TestRegisteredRoomGraphCycle(t *testing.T) {
	t.Parallel()
	at := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)
	recipe := TrustedFactoryRecipe{ID: "room-test"}
	idRecipe := identifier.TrustedRecipe{ID: "empty", Factory: func() *identifier.Identifier { return identifier.NewIdentifier(nil) }}
	id, e := idRecipe.New()
	require.NoError(t, e)
	all, e := recipe.New(unitdb.New(), id)
	require.NoError(t, e)
	room := &Room{bossEntry: 100, Units: map[guid.GUID]*RoomMechanic{}}
	for _, id := range []guid.GUID{1, 2} {
		common := NewCommonCharacter(id, all)
		member := &RoomMechanic{Common: common, all: all, entry: 2, bossEntry: 100, room: room, key: "room", pendingDeathWindow: time.Minute}
		common.Start("start", messages.TimedOut(at))
		room.Units[id] = member
		all.All.Add(member, at)
	}
	all.Save("room", room)
	first := room.Units[1]
	m := messages.Message(messages.TimedOut(at))
	first.pendingDeath = &m
	first.LastSlain = m
	r := ownergraph.NewRegistry()
	require.NoError(t, RegisterGraphOwners(r, GraphOptions{recipe, idRecipe}))
	require.NoError(t, period.RegisterGraphOwners(r))
	require.NoError(t, unitdb.RegisterGraphOwner(r))
	require.NoError(t, identifier.RegisterGraphOwner(r, idRecipe))
	require.NoError(t, messages.RegisterDamageGraphOwner(r))
	snapshot, e := r.Capture(all)
	require.NoError(t, e)
	restored, e := r.Restore(snapshot)
	require.NoError(t, e)
	fresh := restored.(*Characters)
	require.NotSame(t, all, fresh)
	shared, ok := fresh.Load("room")
	require.True(t, ok)
	freshRoom := shared.(*Room)
	require.Len(t, freshRoom.Units, 2)
	for id, member := range freshRoom.Units {
		ch, ok := fresh.Get(id)
		require.True(t, ok)
		require.Same(t, member, ch)
		require.Same(t, freshRoom, member.room)
		require.Same(t, fresh, member.Lookup())
	}
	require.Same(t, freshRoom.Units[1].LastSlain, *freshRoom.Units[1].pendingDeath)
	require.NotSame(t, m, *freshRoom.Units[1].pendingDeath)
	require.NoError(t, fresh.WireGraphRuntime())
	_, e = fresh.Process(messages.TimedOut(at.Add(time.Minute)))
	require.NoError(t, e)
	_, e = all.Process(messages.TimedOut(at.Add(time.Minute)))
	require.NoError(t, e)
	require.Equal(t, len(room.Units), len(freshRoom.Units))
	restoredFirst, ok := fresh.Get(1)
	require.True(t, ok)
	require.Equal(t, first.IsActive(), restoredFirst.IsActive())
}
