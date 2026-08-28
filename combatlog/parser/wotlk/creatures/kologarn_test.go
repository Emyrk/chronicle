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

func newKologarnTestCharacters() *characters.Characters {
	return characters.NewCharacters(
		unitdb.New(),
		NewCharacterFactories(database.WoWFlavor{database.FlavorVanilla, database.FlavorWrath}),
		identifier.NewIdentifier(map[uint32]identifier.Identity{}),
	)
}

func kologarnVehicleGUID(entry uint32) guid.GUID {
	return guid.GUID(0xF150000000000001 | uint64(entry)<<24)
}

func TestKologarnObservedAuraCleanupMarksDefeatAsSlain(t *testing.T) {
	t.Parallel()

	all := newKologarnTestCharacters()
	player := guid.GUID(1)
	kologarnID := kologarnVehicleGUID(32930)
	lastDamage := time.Date(2026, time.June, 13, 17, 33, 52, 522000000, time.UTC)

	_, err := all.Process(&messages.Damage{
		MessageBase: messages.Base(lastDamage.Add(-time.Second)),
		Caster:      &player,
		Target:      kologarnID,
		Amount:      1,
		HitType:     types.HitTypeHit,
	})
	require.NoError(t, err)
	_, err = all.Process(&messages.Damage{
		MessageBase: messages.Base(lastDamage),
		Caster:      &player,
		Target:      kologarnID,
		Amount:      1431,
		HitType:     types.HitTypePeriodic,
	})
	require.NoError(t, err)

	// Observed instance owh28TPUBKVr5GWJ: seven distinct debuffs were removed
	// together 39ms after Kologarn's last damage event, with no overkill or evade.
	cleanupAt := lastDamage.Add(39 * time.Millisecond)
	for i := range kologarnAuraCleanupThreshold {
		_, err = all.Process(&messages.Aura{
			MessageBase: messages.Base(cleanupAt),
			Target:      kologarnID,
			SpellName:   fmt.Sprintf("Removed debuff %d", i),
			State:       types.AuraStateRemoved,
		})
		require.NoError(t, err)
	}

	kologarn, ok := all.Get(kologarnID)
	require.True(t, ok)
	require.False(t, kologarn.IsActive())
	require.Equal(t, period.EndStateSlain, kologarn.LastEndState())
	require.Equal(t, cleanupAt, kologarn.Periods()[0].End.Timestamp.Date())
}

func TestKologarnAuraCleanupBelowThresholdDoesNotMarkDefeat(t *testing.T) {
	t.Parallel()

	all := newKologarnTestCharacters()
	player := guid.GUID(1)
	kologarnID := kologarnVehicleGUID(32930)
	lastDamage := time.Date(2026, time.June, 13, 17, 33, 52, 522000000, time.UTC)

	_, err := all.Process(&messages.Damage{
		MessageBase: messages.Base(lastDamage),
		Caster:      &player,
		Target:      kologarnID,
		Amount:      1,
		HitType:     types.HitTypeHit,
	})
	require.NoError(t, err)

	for i := range kologarnAuraCleanupThreshold - 1 {
		_, err = all.Process(&messages.Aura{
			MessageBase: messages.Base(lastDamage.Add(39 * time.Millisecond)),
			Target:      kologarnID,
			SpellName:   fmt.Sprintf("Removed debuff %d", i),
			State:       types.AuraStateRemoved,
		})
		require.NoError(t, err)
	}

	kologarn, ok := all.Get(kologarnID)
	require.True(t, ok)
	require.True(t, kologarn.IsActive())
	require.Equal(t, period.EndStateNone, kologarn.LastEndState())
}

func TestKologarnEncounterFactoryAcceptsVehicleEntries(t *testing.T) {
	t.Parallel()

	all := newKologarnTestCharacters()
	for _, entry := range []uint32{32930, 33909} {
		character, ok := NewKologarnEncounterCharacter(kologarnVehicleGUID(entry), all)
		require.True(t, ok)
		require.IsType(t, &kologarnCharacter{}, character)
	}

	character, ok := NewKologarnEncounterCharacter(kologarnVehicleGUID(32845), all)
	require.False(t, ok)
	require.Nil(t, character)
}
