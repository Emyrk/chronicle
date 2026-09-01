package creatures

import (
	"testing"
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/common/characters"
	"github.com/Emyrk/chronicle/combatlog/parser/common/characters/period"
	"github.com/Emyrk/chronicle/combatlog/parser/common/identifier"
	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/common/unitdb"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/stretchr/testify/require"
)

func newMajordomoTestCharacters() *characters.Characters {
	return characters.NewCharacters(
		unitdb.New(),
		[]characters.CharacterFactory{NewMajordomoPartyCharacter},
		identifier.NewIdentifier(map[uint32]identifier.Identity{}),
	)
}

func majordomoTestCreatureGUID(entry uint32, spawnID uint64) guid.GUID {
	return guid.GUID(0xF130000000000000 | uint64(entry)<<24 | spawnID)
}

func TestMajordomoDefeatedAfterEightAddsDieWithExtraAddsTracked(t *testing.T) {
	t.Parallel()

	chars := newMajordomoTestCharacters()
	majordomoID := majordomoTestCreatureGUID(majorDomoEntry, 1)
	playerID := guid.GUID(1)
	base := time.Date(2026, time.August, 31, 18, 9, 18, 0, time.UTC)

	_, err := chars.Process(&messages.Damage{
		MessageBase: messages.Base(base),
		Caster:      &playerID,
		Target:      majordomoID,
		Amount:      1,
	})
	require.NoError(t, err)

	adds := make([]guid.GUID, 0, 14)
	for i := range 14 {
		entry := uint32(flamewakerHealer)
		if i >= 8 {
			entry = flamewakerElite
		}
		addID := majordomoTestCreatureGUID(entry, uint64(i+2))
		adds = append(adds, addID)

		_, err = chars.Process(&messages.Damage{
			MessageBase: messages.Base(base.Add(time.Duration(i+1) * time.Millisecond)),
			Caster:      &playerID,
			Target:      addID,
			Amount:      1,
		})
		require.NoError(t, err)
	}

	majordomo, ok := chars.Get(majordomoID)
	require.True(t, ok)
	require.True(t, majordomo.IsActive())

	for i, addID := range adds[:8] {
		_, err = chars.Process(&messages.Slain{
			MessageBase: messages.Base(base.Add(time.Duration(i+1) * time.Second)),
			Victim:      addID,
			Killer:      &playerID,
		})
		require.NoError(t, err)

		if i < 7 {
			require.True(t, majordomo.IsActive(), "Majordomo should remain active until eight adds are slain")
		}
	}

	for _, addID := range adds[8:] {
		add, ok := chars.Get(addID)
		require.True(t, ok)
		require.False(t, add.IsActive())
		activity, ok := add.CurrentPeriod()
		require.True(t, ok)
		require.Equal(t, period.EndStateSlain, activity.EndState)
		require.Equal(t, "majordomo_defeated", activity.End.Reason)
	}

	require.False(t, majordomo.IsActive())
	activity, ok := majordomo.CurrentPeriod()
	require.True(t, ok)
	require.Equal(t, period.EndStateSlain, activity.EndState)
	require.Equal(t, "all_adds_dead", activity.End.Reason)
}

func TestMajordomoResetRequiresEightFreshAddDeaths(t *testing.T) {
	t.Parallel()

	chars := newMajordomoTestCharacters()
	majordomoID := majordomoTestCreatureGUID(majorDomoEntry, 1)
	playerID := guid.GUID(1)
	base := time.Date(2026, time.August, 31, 18, 9, 18, 0, time.UTC)
	adds := make([]guid.GUID, 8)
	for i := range adds {
		entry := uint32(flamewakerHealer)
		if i >= 4 {
			entry = flamewakerElite
		}
		adds[i] = majordomoTestCreatureGUID(entry, uint64(i+2))
	}

	startAttempt := func(at time.Time) {
		_, err := chars.Process(&messages.Damage{
			MessageBase: messages.Base(at),
			Caster:      &playerID,
			Target:      majordomoID,
			Amount:      1,
		})
		require.NoError(t, err)
		for i, addID := range adds {
			_, err = chars.Process(&messages.Damage{
				MessageBase: messages.Base(at.Add(time.Duration(i+1) * time.Millisecond)),
				Caster:      &playerID,
				Target:      addID,
				Amount:      1,
			})
			require.NoError(t, err)
		}
	}
	killAdd := func(addID guid.GUID, at time.Time) {
		_, err := chars.Process(&messages.Slain{
			MessageBase: messages.Base(at),
			Victim:      addID,
			Killer:      &playerID,
		})
		require.NoError(t, err)
	}

	startAttempt(base)
	killAdd(adds[0], base.Add(time.Second))
	killAdd(adds[1], base.Add(2*time.Second))

	majordomo, ok := chars.Get(majordomoID)
	require.True(t, ok)
	require.True(t, majordomo.IsActive())

	resetAt := base.Add(characters.InactivityTimeout + time.Second)
	_, err := chars.Process(&messages.Slain{
		MessageBase: messages.Base(resetAt),
		Victim:      guid.GUID(999),
	})
	require.NoError(t, err)
	require.False(t, majordomo.IsActive())

	secondAttempt := resetAt.Add(time.Second)
	startAttempt(secondAttempt)
	for i, addID := range adds[:7] {
		killAdd(addID, secondAttempt.Add(time.Duration(i+1)*time.Second))
	}
	require.True(t, majordomo.IsActive(), "deaths from the reset attempt must not count toward the new attempt")

	killAdd(adds[7], secondAttempt.Add(8*time.Second))
	require.False(t, majordomo.IsActive())
	activity, ok := majordomo.CurrentPeriod()
	require.True(t, ok)
	require.Equal(t, period.EndStateSlain, activity.EndState)
	require.Equal(t, "all_adds_dead", activity.End.Reason)
}
