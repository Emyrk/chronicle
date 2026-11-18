package creatures

import (
	"testing"
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/common/characters"
	"github.com/Emyrk/chronicle/combatlog/parser/common/identifier"
	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/common/unitdb"
	"github.com/Emyrk/chronicle/database"
	"github.com/stretchr/testify/require"
)

func TestShadeOfJindoNeverActive(t *testing.T) {
	t.Parallel()
	for _, flavor := range []database.WoWFlavor{{database.FlavorVanilla}, {database.FlavorVanilla, database.FlavorTurtle}} {
		all := characters.NewCharacters(unitdb.New(flavor), nil, identifier.NewIdentifier(map[uint32]identifier.Identity{}))
		id := creatureEntryGUID(0xF130000000000000, 14986)
		var shade characters.Character
		for _, factory := range VanillaCharacterFactories(flavor) {
			if c, ok := factory(id, all); ok {
				shade = c
				break
			}
		}
		require.IsType(t, characters.NeverActive{}, shade)
		require.Equal(t, id, shade.ID())
		now := time.Date(2026, time.November, 16, 0, 0, 0, 0, time.UTC)
		player := creatureEntryGUID(0, 0)
		for _, msg := range []messages.Message{
			&messages.Damage{MessageBase: messages.Base(now), Caster: &id, Target: player, Amount: 1},
			&messages.Damage{MessageBase: messages.Base(now.Add(time.Second)), Caster: &player, Target: id, Amount: 1},
			&messages.Slain{MessageBase: messages.Base(now.Add(2 * time.Second)), Victim: id},
		} {
			require.NoError(t, shade.Process(msg))
			require.False(t, shade.IsActive())
			require.Empty(t, shade.Periods())
		}
	}
	for _, high := range []uint64{0xF110000000000000, 0xF140000000000000, 0xF150000000000000} {
		c, ok := NewShadeOfJindo(creatureEntryGUID(high, 14986), nil)
		require.False(t, ok)
		require.Nil(t, c)
	}
	c, ok := NewShadeOfJindo(creatureEntryGUID(0xF130000000000000, 14987), nil)
	require.False(t, ok)
	require.Nil(t, c)
}
