package creatures

import (
	"fmt"
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	"github.com/Emyrk/chronicle/combatlog/parser/common/characters"
	"github.com/Emyrk/chronicle/combatlog/parser/common/characters/period"
	"github.com/Emyrk/chronicle/combatlog/parser/common/identifier"
	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/common/unitdb"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/types"
	"github.com/Emyrk/chronicle/database"
)

func newHodirTestCharacters() *characters.Characters {
	return characters.NewCharacters(
		unitdb.New(),
		NewCharacterFactories(database.WoWFlavor{database.FlavorVanilla, database.FlavorWrath}),
		identifier.NewIdentifier(map[uint32]identifier.Identity{}),
	)
}

func TestHodirOverkillMarksSurrenderAsSlain(t *testing.T) {
	t.Parallel()

	all := newHodirTestCharacters()
	player := guid.GUID(1)
	hodirID := creatureGUID(hodirAlternateEntry)
	start := time.Date(2026, time.August, 28, 12, 0, 0, 0, time.UTC)

	defeat := &messages.Damage{
		MessageBase: messages.Base(start),
		Caster:      &player,
		Target:      hodirID,
		Amount:      100,
		Overkill:    1,
		HitType:     types.HitTypeHit,
	}
	_, err := all.Process(defeat)
	require.NoError(t, err)

	hodir, ok := all.Get(hodirID)
	require.True(t, ok)
	require.False(t, hodir.IsActive())
	require.Equal(t, period.EndStateSlain, hodir.LastEndState())
}

func TestHodirEvadeMarksSurrenderAsSlain(t *testing.T) {
	t.Parallel()

	all := newHodirTestCharacters()
	player := guid.GUID(1)
	hodirID := creatureGUID(hodirEntry)
	start := time.Date(2026, time.August, 28, 12, 0, 0, 0, time.UTC)

	_, err := all.Process(&messages.Damage{
		MessageBase: messages.Base(start),
		Caster:      &player,
		Target:      hodirID,
		Amount:      1,
		HitType:     types.HitTypeHit,
	})
	require.NoError(t, err)

	_, err = all.Process(&messages.Damage{
		MessageBase: messages.Base(start.Add(time.Second)),
		Caster:      &player,
		Target:      hodirID,
		HitType:     types.HitTypeEvade,
	})
	require.NoError(t, err)

	hodir, ok := all.Get(hodirID)
	require.True(t, ok)
	require.False(t, hodir.IsActive())
	require.Equal(t, period.EndStateSlain, hodir.LastEndState())
	require.Equal(t, start.Add(time.Second), hodir.Periods()[0].End.Timestamp.Date())
}

func TestHodirMassAuraCleanupAfterDamageMarksSurrenderAsSlain(t *testing.T) {
	t.Parallel()

	all := newHodirTestCharacters()
	player := guid.GUID(1)
	hodirID := creatureGUID(hodirEntry)
	start := time.Date(2026, time.August, 28, 12, 0, 0, 0, time.UTC)

	_, err := all.Process(&messages.Damage{
		MessageBase: messages.Base(start),
		Caster:      &player,
		Target:      hodirID,
		Amount:      5513,
		HitType:     types.HitTypeHit,
	})
	require.NoError(t, err)

	for i := range hodirAuraCleanupThreshold {
		_, err = all.Process(&messages.Aura{
			MessageBase: messages.Base(start.Add(50*time.Millisecond + time.Duration(i)*time.Millisecond)),
			Target:      hodirID,
			SpellName:   fmt.Sprintf("Debuff %d", i),
			State:       types.AuraStateRemoved,
		})
		require.NoError(t, err)
	}

	hodir, ok := all.Get(hodirID)
	require.True(t, ok)
	require.False(t, hodir.IsActive())
	require.Equal(t, period.EndStateSlain, hodir.LastEndState())
	require.Equal(t, start.Add(57*time.Millisecond), hodir.Periods()[0].End.Timestamp.Date())
}

func TestHodirAuraCleanupRequiresRecentDamageAndBurst(t *testing.T) {
	t.Parallel()

	for _, test := range []struct {
		name      string
		firstAura time.Duration
		auraStep  time.Duration
	}{
		{name: "cleanup too long after damage", firstAura: time.Second, auraStep: time.Millisecond},
		{name: "removals are not a burst", firstAura: 50 * time.Millisecond, auraStep: 20 * time.Millisecond},
	} {
		t.Run(test.name, func(t *testing.T) {
			t.Parallel()

			all := newHodirTestCharacters()
			player := guid.GUID(1)
			hodirID := creatureGUID(hodirEntry)
			start := time.Date(2026, time.August, 28, 12, 0, 0, 0, time.UTC)

			_, err := all.Process(&messages.Damage{
				MessageBase: messages.Base(start),
				Caster:      &player,
				Target:      hodirID,
				Amount:      1,
				HitType:     types.HitTypeHit,
			})
			require.NoError(t, err)

			for i := range hodirAuraCleanupThreshold {
				_, err = all.Process(&messages.Aura{
					MessageBase: messages.Base(start.Add(test.firstAura + time.Duration(i)*test.auraStep)),
					Target:      hodirID,
					SpellName:   fmt.Sprintf("Debuff %d", i),
					State:       types.AuraStateRemoved,
				})
				require.NoError(t, err)
			}

			hodir, ok := all.Get(hodirID)
			require.True(t, ok)
			require.True(t, hodir.IsActive())
			require.Equal(t, period.EndStateNone, hodir.LastEndState())
		})
	}
}

func TestHodirWipeAuraCleanupDoesNotMarkSurrender(t *testing.T) {
	t.Parallel()

	all := newHodirTestCharacters()
	player := guid.GUID(1)
	hodirID := creatureGUID(hodirEntry)
	start := time.Date(2026, time.June, 10, 20, 46, 46, 412000000, time.UTC)

	_, err := all.Process(&messages.Damage{
		MessageBase: messages.Base(start),
		Caster:      &player,
		Target:      hodirID,
		Amount:      1,
		HitType:     types.HitTypeHit,
	})
	require.NoError(t, err)

	// Observed wipe OACkHpz1QQIMUV5o: the reset cleanup began 513ms after
	// the last incoming damage and removed only five distinct auras per 100ms.
	for i := range 5 {
		_, err = all.Process(&messages.Aura{
			MessageBase: messages.Base(start.Add(513 * time.Millisecond)),
			Target:      hodirID,
			SpellName:   fmt.Sprintf("Reset aura %d", i),
			State:       types.AuraStateRemoved,
		})
		require.NoError(t, err)
	}

	hodir, ok := all.Get(hodirID)
	require.True(t, ok)
	require.True(t, hodir.IsActive())
	require.Equal(t, period.EndStateNone, hodir.LastEndState())
}

func TestHodirEncounterFactory(t *testing.T) {
	t.Parallel()

	all := newHodirTestCharacters()
	for _, entry := range []uint32{hodirEntry, hodirAlternateEntry} {
		character, ok := NewHodirEncounterCharacter(creatureGUID(entry), all)
		require.True(t, ok)
		require.IsType(t, &hodirCharacter{}, character)
	}

	character, ok := NewHodirEncounterCharacter(creatureGUID(33213), all)
	require.False(t, ok)
	require.Nil(t, character)
}
