package characters

import (
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	"github.com/Emyrk/chronicle/combatlog/parser/common/characters/period"
	"github.com/Emyrk/chronicle/combatlog/parser/common/identifier"
	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/common/unitdb"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
)

func TestIgnoreActivityMarkPreventsDamageBump(t *testing.T) {
	t.Parallel()

	chars := NewCharacters(unitdb.New(), nil, identifier.NewIdentifier(map[uint32]identifier.Identity{}))
	boss := guid.GUID(0xF130000001000001)
	player := guid.GUID(1)
	start := time.Date(2026, time.August, 9, 12, 0, 0, 0, time.UTC)

	_, err := chars.Process(&messages.Damage{
		MessageBase: messages.Base(start),
		Caster:      &boss,
		Target:      player,
		Amount:      1,
	})
	require.NoError(t, err)
	bossCharacter, ok := chars.Get(boss)
	require.True(t, ok)
	require.True(t, bossCharacter.IsActive())

	attributed := &messages.Damage{
		MessageBase: messages.Base(start.Add(30 * time.Second)),
		Caster:      &boss,
		Target:      player,
		Amount:      1,
	}
	attributed.MarkActivityIgnore("attributed environment damage", boss)
	_, err = chars.Process(attributed)
	require.NoError(t, err)

	_, err = chars.Process(messages.TimedOut(start.Add(70 * time.Second)))
	require.NoError(t, err)
	require.False(t, bossCharacter.IsActive(), "ignored damage must not extend the activity timeout")
}

func TestExplicitEncounterSuppressesTimeoutAndEndsActiveCharacters(t *testing.T) {
	t.Parallel()

	chars := NewCharacters(unitdb.New(), nil, identifier.NewIdentifier(map[uint32]identifier.Identity{}))
	boss := guid.GUID(0xF130000001000001)
	player := guid.GUID(1)
	start := time.Date(2026, time.September, 8, 12, 0, 0, 0, time.UTC)

	_, err := chars.Process(&messages.EncounterBoundary{
		MessageBase: messages.Base(start),
		Active:      true,
		EncounterID: 1,
	})
	require.NoError(t, err)
	_, err = chars.Process(&messages.Damage{
		MessageBase: messages.Base(start.Add(time.Second)),
		Caster:      &boss,
		Target:      player,
		Amount:      1,
	})
	require.NoError(t, err)

	bossCharacter, ok := chars.Get(boss)
	require.True(t, ok)
	require.True(t, bossCharacter.IsActive())

	_, err = chars.Process(messages.TimedOut(start.Add(2 * InactivityTimeout)))
	require.NoError(t, err)
	require.True(t, bossCharacter.IsActive(), "explicit encounter should suppress inactivity timeout")

	end := start.Add(3 * InactivityTimeout)
	changed, err := chars.Process(&messages.EncounterBoundary{
		MessageBase: messages.Base(end),
		Active:      false,
		EncounterID: 1,
	})
	require.NoError(t, err)
	require.True(t, changed)
	require.False(t, chars.ExplicitEncounterActive())
	require.False(t, bossCharacter.IsActive())
	activity := bossCharacter.Periods()
	require.Len(t, activity, 1)
	require.Equal(t, end, activity[0].End.Timestamp.Date())
	require.Equal(t, period.EndStateReset, activity[0].EndState)
}
