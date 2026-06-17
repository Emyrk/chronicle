package creatures_test

import (
	"testing"
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/common/identifier"
	"github.com/Emyrk/chronicle/combatlog/parser/vanilla/creatures"

	"github.com/Emyrk/chronicle/combatlog/parser/common/characters"
	"github.com/Emyrk/chronicle/combatlog/parser/common/characters/period"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/common/unitdb"
	"github.com/stretchr/testify/require"
)

func TestCthun_EyeDeathPendingUntilBodyActive(t *testing.T) {
	t.Parallel()

	chars := characters.NewCharacters(unitdb.New(), creatures.TurtleCharacterFactories(), identifier.NewIdentifier(map[uint32]identifier.Identity{}))

	player := guid.GUID(0x1)
	eye := cthunCreatureGUID(15589, 0x1)
	body := cthunCreatureGUID(15727, 0x2)

	base := time.Date(2026, time.January, 3, 0, 0, 0, 0, time.UTC)
	msgs := []messages.Message{
		cthunDamage(base, player, eye),
		cthunSlain(base.Add(1*time.Second), player, eye),
	}

	for _, msg := range msgs {
		_, err := chars.Process(msg)
		require.NoError(t, err)
	}

	eyeChar, ok := chars.Get(eye)
	require.True(t, ok)
	require.True(t, eyeChar.IsActive(), "eye should remain active while death is pending")

	_, err := chars.Process(cthunDamage(base.Add(2*time.Second), player, body))
	require.NoError(t, err)

	require.False(t, eyeChar.IsActive(), "eye should finalize once c'thun body activity begins")
	eyePeriods := eyeChar.Periods()
	require.Len(t, eyePeriods, 1)
	require.Equal(t, period.EndStateSlain, eyePeriods[0].EndState)
	require.Equal(t, "cthun_phase_transition", eyePeriods[0].End.Reason)
}

func TestCthun_EyePendingDeathTimesOutWithoutBody(t *testing.T) {
	t.Parallel()

	chars := characters.NewCharacters(unitdb.New(), creatures.TurtleCharacterFactories(), identifier.NewIdentifier(map[uint32]identifier.Identity{}))

	player := guid.GUID(0x1)
	eye := cthunCreatureGUID(15589, 0x10)
	dummyTarget := cthunCreatureGUID(16017, 0x20)

	base := time.Date(2026, time.January, 3, 1, 0, 0, 0, time.UTC)
	msgs := []messages.Message{
		cthunDamage(base, player, eye),
		cthunSlain(base.Add(1*time.Second), player, eye),
		cthunDamage(base.Add(65*time.Second), player, dummyTarget),
	}

	for _, msg := range msgs {
		_, err := chars.Process(msg)
		require.NoError(t, err)
	}

	eyeChar, ok := chars.Get(eye)
	require.True(t, ok)
	require.False(t, eyeChar.IsActive(), "eye should finalize after transition timeout")

	periods := eyeChar.Periods()
	require.Len(t, periods, 1)
	require.Equal(t, period.EndStateSlain, periods[0].EndState)
	require.Equal(t, "cthun_transition_timeout", periods[0].End.Reason)
}

func TestNewCthun_MatchesEyeAndBodyEntries(t *testing.T) {
	t.Parallel()

	chars := characters.NewCharacters(unitdb.New(), creatures.TurtleCharacterFactories(), identifier.NewIdentifier(map[uint32]identifier.Identity{}))

	for _, entry := range []uint32{15589, 15727} {
		id := cthunCreatureGUID(entry, entry)
		created, ok := creatures.NewCthun(id, chars)
		require.True(t, ok)
		require.NotNil(t, created)
	}

	created, ok := creatures.NewCthun(cthunCreatureGUID(16028, 0x99), chars)
	require.False(t, ok)
	require.Nil(t, created)

	created, ok = creatures.NewCthun(guid.GUID(0x1), chars)
	require.False(t, ok)
	require.Nil(t, created)
}

func cthunCreatureGUID(entry uint32, seed uint32) guid.GUID {
	return guid.GUID(0xF130000000000000 | uint64(entry&0xFFFFFF)<<24 | uint64(seed&0xFFFFFF))
}

func cthunDamage(ts time.Time, caster guid.GUID, target guid.GUID) *messages.Damage {
	return &messages.Damage{
		MessageBase: messages.Base(ts),
		Caster:      &caster,
		Target:      target,
		Amount:      1,
	}
}

func cthunSlain(ts time.Time, killer guid.GUID, victim guid.GUID) *messages.Slain {
	return &messages.Slain{
		MessageBase: messages.Base(ts),
		Victim:      victim,
		Killer:      &killer,
	}
}
