package characters

import (
	"github.com/Emyrk/chronicle/combatlog/parser/common/identifier"
	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/common/unitdb"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/stretchr/testify/require"
	"testing"
	"time"
)

func TestRoomStateAliasesAndContinuation(t *testing.T) {
	t.Parallel()
	all := NewCharacters(unitdb.New(), nil, identifier.NewIdentifier(nil))
	at := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)
	m := messages.Message(messages.TimedOut(at))
	common := NewCommonCharacter(guid.GUID(1), all)
	common.Start("start", m)
	room := &Room{bossEntry: 100, Units: map[guid.GUID]*RoomMechanic{}}
	original := &RoomMechanic{Common: common, all: all, bossEntry: 100, entry: 2, pendingDeath: &m, pendingDeathWindow: time.Minute, room: room, key: "100"}
	room.Units[1] = original
	room.boss = original
	rs, e := room.CaptureState(func(c *RoomMechanic) (string, error) { require.Same(t, original, c); return "member", nil })
	require.NoError(t, e)
	rb, e := rs.Encode()
	require.NoError(t, e)
	rs, e = DecodeRoomState(RoomStateVersion, rb)
	require.NoError(t, e)
	cs, e := original.CaptureState(func(*Common) (string, error) { return "common", nil }, func(*Room) (string, error) { return "room", nil }, func(v messages.Message) (string, error) { require.Same(t, m, v); return "death", nil })
	require.NoError(t, e)
	cb, e := cs.Encode()
	require.NoError(t, e)
	cs, e = DecodeRoomMechanicState(RoomMechanicStateVersion, cb)
	require.NoError(t, e)
	restoredRoom := new(Room)
	restored := new(RoomMechanic)
	require.NoError(t, restoredRoom.RestoreState(rs, func(string) (*RoomMechanic, error) { return restored, nil }))
	require.NoError(t, restored.RestoreState(cs, all, func(string) (*Common, error) { return common, nil }, func(string) (*Room, error) { return restoredRoom, nil }, func(string) (messages.Message, error) { return m, nil }))
	require.Same(t, restored, restoredRoom.boss)
	require.Same(t, restored, restoredRoom.Units[1])
	require.Same(t, restoredRoom, restored.room)
	require.Same(t, m, *restored.pendingDeath)
	require.True(t, common.IsActive())
	require.Empty(t, all.ByEntry)
	require.Zero(t, all.All.Len())
	require.Empty(t, all.DB().Info)
	_, published := all.Load("100")
	require.False(t, published)
	prior := *restored
	require.Error(t, restored.RestoreState(cs, all, func(string) (*Common, error) { return common, nil }, func(string) (*Room, error) { return restoredRoom, nil }, func(string) (messages.Message, error) { return (*messages.Slain)(nil), nil }))
	require.Equal(t, prior, *restored)
	require.Error(t, restoredRoom.RestoreState(rs, func(string) (*RoomMechanic, error) { return nil, nil }))
	require.Same(t, restored, restoredRoom.boss)
	// The boss alias survives removal from membership; do not derive it from Units.
	restoredRoom.Remove(1)
	rs, e = restoredRoom.CaptureState(func(*RoomMechanic) (string, error) { return "member", nil })
	require.NoError(t, e)
	require.NoError(t, restoredRoom.RestoreState(rs, func(string) (*RoomMechanic, error) { return restored, nil }))
	require.Empty(t, restoredRoom.Units)
	require.Same(t, restored, restoredRoom.boss)
	// Runtime processing, not restoration, finalizes the retained pending death.
	restored.processPendingDeath(messages.TimedOut(at.Add(time.Minute)), false)
	require.Nil(t, restored.pendingDeath)
	require.False(t, common.IsActive())
}

func TestNewCommonOwnerStatesRejectIncompleteShape(t *testing.T) {
	t.Parallel()
	decoders := []func([]byte) error{
		func(b []byte) error { _, e := DecodeRoomState(RoomStateVersion, b); return e },
		func(b []byte) error { _, e := DecodeRoomMechanicState(RoomMechanicStateVersion, b); return e },
		func(b []byte) error {
			_, e := DecodeScriptedDefeatDetectorState(ScriptedDefeatDetectorStateVersion, b)
			return e
		},
		func(b []byte) error {
			_, e := DecodeScriptedDefeatCharacterState(ScriptedDefeatCharacterStateVersion, b)
			return e
		},
		func(b []byte) error {
			_, e := DecodePhaseProviderCharacterState(PhaseProviderCharacterStateVersion, b)
			return e
		},
	}
	for _, decode := range decoders {
		for _, payload := range []string{`null`, `{}`, `[]`, `{"unknown":0}`} {
			require.Error(t, decode([]byte(payload)))
		}
	}
}
