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

func newFreyaTestCharacters() *characters.Characters {
	return characters.NewCharacters(
		unitdb.New(),
		NewCharacterFactories(database.WoWFlavor{database.FlavorVanilla, database.FlavorWrath}),
		identifier.NewIdentifier(map[uint32]identifier.Identity{}),
	)
}

func TestFreyaScriptedDefeatSignalsMarkSurrenderAsSlain(t *testing.T) {
	t.Parallel()

	for _, test := range []struct {
		name   string
		defeat func(time.Time, guid.GUID, guid.GUID) []messages.Message
	}{
		{
			name: "positive overkill",
			defeat: func(at time.Time, playerID, freyaID guid.GUID) []messages.Message {
				return []messages.Message{&messages.Damage{
					MessageBase: messages.Base(at),
					Caster:      &playerID,
					Target:      freyaID,
					Amount:      100,
					Overkill:    1,
					HitType:     types.HitTypeHit,
				}}
			},
		},
		{
			name: "evade after damage",
			defeat: func(at time.Time, playerID, freyaID guid.GUID) []messages.Message {
				return []messages.Message{
					&messages.Damage{
						MessageBase: messages.Base(at),
						Caster:      &playerID,
						Target:      freyaID,
						Amount:      1,
						HitType:     types.HitTypeHit,
					},
					&messages.Damage{
						MessageBase: messages.Base(at.Add(time.Second)),
						Caster:      &playerID,
						Target:      freyaID,
						HitType:     types.HitTypeEvade,
					},
					messages.TimedOut(at.Add(time.Second + characters.ScriptedDefeatEvadeConfirmationWindow)),
				}
			},
		},
	} {
		t.Run(test.name, func(t *testing.T) {
			t.Parallel()

			all := newFreyaTestCharacters()
			playerID := guid.GUID(1)
			freyaID := creatureGUID(freyaEntry)
			start := time.Date(2026, time.August, 28, 12, 0, 0, 0, time.UTC)

			for _, message := range test.defeat(start, playerID, freyaID) {
				_, err := all.Process(message)
				require.NoError(t, err)
			}

			freya, ok := all.Get(freyaID)
			require.True(t, ok)
			require.False(t, freya.IsActive())
			require.Equal(t, period.EndStateSlain, freya.LastEndState())
		})
	}
}

func TestFreyaDamageAfterEvadeDoesNotSplitEncounter(t *testing.T) {
	t.Parallel()

	all := newFreyaTestCharacters()
	playerID := guid.GUID(1)
	freyaID := creatureGUID(freyaEntry)
	start := time.Date(2026, time.August, 27, 2, 3, 16, 531000000, time.UTC)

	_, err := all.Process(&messages.Damage{
		MessageBase: messages.Base(start),
		Caster:      &freyaID,
		Target:      playerID,
		Amount:      1,
		HitType:     types.HitTypeHit,
	})
	require.NoError(t, err)

	evadeAt := time.Date(2026, time.August, 27, 2, 3, 37, 858000000, time.UTC)
	_, err = all.Process(&messages.Damage{
		MessageBase: messages.Base(evadeAt),
		Caster:      &playerID,
		Target:      freyaID,
		HitType:     types.HitTypeEvade,
	})
	require.NoError(t, err)

	// Damage within the confirmation window disproves the queued evade and must
	// not split the active encounter.
	_, err = all.Process(&messages.Damage{
		MessageBase: messages.Base(evadeAt.Add(400 * time.Millisecond)),
		Caster:      &playerID,
		Target:      freyaID,
		Amount:      897,
		HitType:     types.HitTypeHit,
	})
	require.NoError(t, err)
	_, err = all.Process(messages.TimedOut(evadeAt.Add(time.Second)))
	require.NoError(t, err)

	freya, ok := all.Get(freyaID)
	require.True(t, ok)
	require.True(t, freya.IsActive())
	require.Equal(t, period.EndStateNone, freya.LastEndState())
	require.Len(t, freya.Periods(), 1)
}

func TestFreyaMassAuraCleanupAfterDamageMarksSurrenderAsSlain(t *testing.T) {
	t.Parallel()

	all := newFreyaTestCharacters()
	playerID := guid.GUID(1)
	freyaID := creatureGUID(freyaEntry)
	start := time.Date(2026, time.August, 28, 12, 0, 0, 0, time.UTC)

	_, err := all.Process(&messages.Damage{
		MessageBase: messages.Base(start),
		Caster:      &playerID,
		Target:      freyaID,
		Amount:      1,
		HitType:     types.HitTypeHit,
	})
	require.NoError(t, err)

	for i := range scriptedKeeperAuraCleanupThreshold {
		_, err = all.Process(&messages.Aura{
			MessageBase: messages.Base(start.Add(50*time.Millisecond + time.Duration(i)*time.Millisecond)),
			Target:      freyaID,
			SpellName:   fmt.Sprintf("Removed aura %d", i),
			State:       types.AuraStateRemoved,
		})
		require.NoError(t, err)
	}

	freya, ok := all.Get(freyaID)
	require.True(t, ok)
	require.False(t, freya.IsActive())
	require.Equal(t, period.EndStateSlain, freya.LastEndState())
}

func TestFreyaObservedWipeCleanupDoesNotMarkSurrender(t *testing.T) {
	t.Parallel()

	all := newFreyaTestCharacters()
	playerID := guid.GUID(1)
	freyaID := creatureGUID(freyaEntry)
	start := time.Date(2026, time.June, 10, 21, 0, 1, 391000000, time.UTC)

	_, err := all.Process(&messages.Damage{
		MessageBase: messages.Base(start),
		Caster:      &playerID,
		Target:      freyaID,
		Amount:      1,
		HitType:     types.HitTypeHit,
	})
	require.NoError(t, err)

	// Observed wipe Igr50E8ZG5QkkBJX removed seven distinct auras during
	// Freya's reset, below the guarded scripted-defeat threshold.
	for i := range 7 {
		_, err = all.Process(&messages.Aura{
			MessageBase: messages.Base(start.Add(2*time.Second + 130*time.Millisecond)),
			Target:      freyaID,
			SpellName:   fmt.Sprintf("Reset aura %d", i),
			State:       types.AuraStateRemoved,
		})
		require.NoError(t, err)
	}

	freya, ok := all.Get(freyaID)
	require.True(t, ok)
	require.True(t, freya.IsActive())
	require.Equal(t, period.EndStateNone, freya.LastEndState())
}

func TestFreyaEncounterFactory(t *testing.T) {
	t.Parallel()

	all := newFreyaTestCharacters()
	character, ok := NewFreyaEncounterCharacter(creatureGUID(freyaEntry), all)
	require.True(t, ok)
	require.IsType(t, &freyaCharacter{}, character)

	for _, entry := range []uint32{33241, 33360, 33410} {
		character, ok = NewFreyaEncounterCharacter(creatureGUID(entry), all)
		require.False(t, ok)
		require.Nil(t, character)
	}
}
