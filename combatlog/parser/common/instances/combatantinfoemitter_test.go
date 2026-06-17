package instances

import (
	"testing"
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/common/characters"
	"github.com/Emyrk/chronicle/combatlog/parser/common/identifier"
	"github.com/Emyrk/chronicle/combatlog/parser/types/combatant"
	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/common/armory"
	"github.com/Emyrk/chronicle/combatlog/parser/vanilla/creatures"
	"github.com/Emyrk/chronicle/combatlog/parser/common/unitdb"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestCombatantInfoEmitter_FightStarted(t *testing.T) {
	t.Parallel()

	playerGUID := mustGUID(t, "0x0000000000000001")
	tracker := armory.New()
	tracker.Players[playerGUID] = combatant.Combatant{
		Name: "TestPlayer",
		Guid: playerGUID,
		GearSetups: []combatant.GearItem{
			{ItemID: 12345, EnchantID: intPtr(100)},
			{ItemID: 67890},
		},
	}

	units := unitdb.New()
	chars := characters.NewCharacters(units, creatures.TurtleCharacterFactories(), identifier.NewIdentifier(map[uint32]identifier.Identity{}))

	var emitted []*messages.Combatant
	cie := &CombatantInfoEmitter{
		armory:     tracker,
		characters: chars,
		emit: func(evt *messages.Combatant) {
			emitted = append(emitted, evt)
		},
	}

	now := time.Date(2025, 1, 1, 0, 0, 0, 0, time.UTC)
	msg := &messages.Damage{
		MessageBase: messages.Base(now),
		Caster:      &playerGUID,
		Target:      mustGUID(t, "0x0030000000000002"),
	}

	// Make the player active by processing a message that affects them.
	_, err := chars.Process(msg)
	require.NoError(t, err)

	// Now fire FightStarted.
	cie.FightStarted(uuid.New(), msg)

	require.Len(t, emitted, 1)
	assert.Equal(t, playerGUID, emitted[0].Guid)
	assert.Equal(t, "TestPlayer", emitted[0].Name)
	assert.Len(t, emitted[0].GearSetups, 2)
	assert.Equal(t, 12345, emitted[0].GearSetups[0].ItemID)
}

func TestCombatantInfoEmitter_NoDataInArmory(t *testing.T) {
	t.Parallel()

	playerGUID := mustGUID(t, "0x0000000000000001")
	tracker := armory.New()
	// Don't add any player data to the armory.

	units := unitdb.New()
	chars := characters.NewCharacters(units, creatures.TurtleCharacterFactories(), identifier.NewIdentifier(map[uint32]identifier.Identity{}))

	var emitted []*messages.Combatant
	cie := &CombatantInfoEmitter{
		armory:     tracker,
		characters: chars,
		emit: func(evt *messages.Combatant) {
			emitted = append(emitted, evt)
		},
	}

	now := time.Date(2025, 1, 1, 0, 0, 0, 0, time.UTC)
	msg := &messages.Damage{
		MessageBase: messages.Base(now),
		Caster:      &playerGUID,
		Target:      mustGUID(t, "0x0030000000000002"),
	}

	_, err := chars.Process(msg)
	require.NoError(t, err)

	cie.FightStarted(uuid.New(), msg)

	// No combatant info should be emitted since the armory has no data.
	assert.Empty(t, emitted)
}

func intPtr(i int) *int {
	return &i
}
