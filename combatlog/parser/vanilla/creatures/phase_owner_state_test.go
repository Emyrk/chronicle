package creatures

import (
	"github.com/Emyrk/chronicle/combatlog/parser/common/characters"
	"github.com/Emyrk/chronicle/combatlog/parser/common/identifier"
	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/common/unitdb"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/stretchr/testify/require"
	"testing"
	"time"
)

func TestKelThuzadStatePreservesAliasesAndPhase(t *testing.T) {
	t.Parallel()
	all := characters.NewCharacters(unitdb.New(), nil, identifier.NewIdentifier(nil))
	room := new(characters.RoomMechanic)
	permanent := characters.NewPermanentDeath(room)
	original := &kelThuzad{PermanentDeath: permanent, room: room, all: all, p2Emitted: true}
	s, e := original.CaptureState(func(*characters.PermanentDeath) (string, error) { return "permanent", nil }, func(*characters.RoomMechanic) (string, error) { return "room", nil })
	require.NoError(t, e)
	b, e := s.Encode()
	require.NoError(t, e)
	s, e = DecodeKelThuzadState(KelThuzadStateVersion, b)
	require.NoError(t, e)
	restored := InitKelThuzad()
	p := func(string) (*characters.PermanentDeath, error) { return permanent, nil }
	require.NoError(t, restored.RestoreState(s, all, p, func(string) (*characters.RoomMechanic, error) { return room, nil }))
	require.Same(t, room, restored.room)
	require.Same(t, room, restored.CharacterBase)
	require.True(t, restored.p2Emitted)
	require.Same(t, all, restored.all)
	require.Empty(t, all.ByEntry)
	require.Zero(t, all.All.Len())
	require.Empty(t, all.DB().Info)
	require.Error(t, restored.RestoreState(s, all, p, func(string) (*characters.RoomMechanic, error) { return nil, nil }))
	require.Same(t, room, restored.room)
	require.True(t, restored.p2Emitted)
}
func TestMograineStateDeathContinuation(t *testing.T) {
	t.Parallel()
	for _, resurrected := range []bool{false, true} {
		all := characters.NewCharacters(unitdb.New(), nil, identifier.NewIdentifier(nil))
		common := characters.NewCommonCharacter(guid.GUID(1), all)
		at := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)
		common.Start("start", messages.TimedOut(at))
		original := &vanillaPlusMograineCharacter{Common: common, awaitingResurrection: !resurrected, resurrected: resurrected}
		s, e := original.CaptureState(func(*characters.Common) (string, error) { return "common", nil })
		require.NoError(t, e)
		b, e := s.Encode()
		require.NoError(t, e)
		s, e = DecodeVanillaPlusMograineState(VanillaPlusMograineStateVersion, b)
		require.NoError(t, e)
		restored := InitVanillaPlusMograine()
		require.NoError(t, restored.RestoreState(s, func(string) (*characters.Common, error) { return common, nil }))
		require.Equal(t, original.awaitingResurrection, restored.awaitingResurrection)
		require.Equal(t, original.resurrected, restored.resurrected)
		require.True(t, common.IsActive())
		require.Error(t, restored.RestoreState(s, func(string) (*characters.Common, error) { return nil, nil }))
		require.Same(t, common, restored.Common)
		m := messages.TimedOut(at.Add(time.Second))
		restored.Died("slain", m)
		require.Equal(t, !resurrected, common.IsActive())
		if !resurrected {
			require.True(t, restored.awaitingResurrection)
			require.Same(t, m, common.LastSlain)
		}
	}
}
func TestPhaseOwnerStateRejectsIncomplete(t *testing.T) {
	t.Parallel()
	for _, b := range []string{`null`, `{}`, `{"permanent_death":"p","room":"r"}`, `{"permanent_death":"p","room":"r","p2_emitted":null}`} {
		_, e := DecodeKelThuzadState(KelThuzadStateVersion, []byte(b))
		require.Error(t, e)
	}
	for _, b := range []string{`null`, `{}`, `{"common":"c"}`, `{"common":"c","awaiting_resurrection":false,"resurrected":null}`} {
		_, e := DecodeVanillaPlusMograineState(VanillaPlusMograineStateVersion, []byte(b))
		require.Error(t, e)
	}
}
