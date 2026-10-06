package characters

import (
	"testing"
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/common/identifier"
	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/common/unitdb"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/stretchr/testify/require"
)

func TestActivityBumpsOthersKeepsActiveCharactersActive(t *testing.T) {
	t.Parallel()

	const (
		sourceEntry        = uint32(100)
		activeOtherEntry   = uint32(200)
		inactiveOtherEntry = uint32(300)
	)

	chars := NewCharacters(
		unitdb.New(),
		[]CharacterFactory{
			NewActivityBumpsOthers(sourceEntry, activeOtherEntry, inactiveOtherEntry),
		},
		identifier.NewIdentifier(map[uint32]identifier.Identity{}),
	)

	sourceID := entryGUID(0xF130000000000000, sourceEntry)
	activeOtherID := entryGUID(0xF130000000000000, activeOtherEntry)
	inactiveOtherID := entryGUID(0xF130000000000000, inactiveOtherEntry)
	playerID := guid.GUID(1)
	start := time.Date(2026, time.October, 6, 12, 0, 0, 0, time.UTC)

	activeOther, _ := chars.Add(activeOtherID, start)
	inactiveOther, _ := chars.Add(inactiveOtherID, start)
	activeOther.(CharacterBase).Start("test", messages.TimedOut(start))

	_, err := chars.Process(&messages.Damage{
		MessageBase: messages.Base(start.Add(55 * time.Second)),
		Caster:      &playerID,
		Target:      sourceID,
		Amount:      1,
	})
	require.NoError(t, err)

	source, ok := chars.Get(sourceID)
	require.True(t, ok)
	require.IsType(t, &ActivityBumpsOthers{}, source)
	require.True(t, activeOther.IsActive())
	require.False(t, inactiveOther.IsActive(), "linked activity must not start an inactive character")

	_, err = chars.Process(messages.TimedOut(start.Add(70 * time.Second)))
	require.NoError(t, err)
	require.True(t, activeOther.IsActive(), "source activity should extend the linked character timeout")

	_, err = chars.Process(&messages.Slain{
		MessageBase: messages.Base(start.Add(80 * time.Second)),
		Victim:      activeOtherID,
	})
	require.NoError(t, err)
	_, err = chars.Process(&messages.Damage{
		MessageBase: messages.Base(start.Add(85 * time.Second)),
		Caster:      &playerID,
		Target:      sourceID,
		Amount:      1,
	})
	require.NoError(t, err)

	require.False(t, activeOther.IsActive(), "source activity must not restart an inactive linked character")
	require.Len(t, activeOther.Periods(), 1)
}
