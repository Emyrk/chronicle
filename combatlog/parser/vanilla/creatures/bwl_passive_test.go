package creatures

import (
	"testing"
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/common/characters"
	"github.com/Emyrk/chronicle/combatlog/parser/common/identifier"
	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/common/unitdb"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/database"
	"github.com/stretchr/testify/require"
)

func TestBWLPassiveControllersNeverActive(t *testing.T) {
	t.Parallel()
	now := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)
	for _, flavor := range []database.WoWFlavor{{database.FlavorVanilla, database.FlavorNightmareOfUrsol}, {database.FlavorTurtle}, {database.FlavorVanillaPlus}, {database.FlavorVanilla}} {
		for _, entry := range []uint32{10162, 14453} {
			all := characters.NewCharacters(unitdb.New(flavor), VanillaCharacterFactories(flavor), identifier.NewIdentifier(nil))
			id := creatureEntryGUID(0xF130000000000000, entry)
			char, _ := all.Add(id, now)
			require.IsType(t, characters.NeverActive{}, char)
			player := guid.GUID(1)
			for _, msg := range []messages.Message{
				&messages.UnitCombatState{MessageBase: messages.Base(now), Unit: id, InCombat: true},
				&messages.UnitTarget{MessageBase: messages.Base(now), Unit: id, Target: &player},
				&messages.SpellStart{MessageBase: messages.Base(now), Caster: id, Target: &player},
				&messages.SpellGo{MessageBase: messages.Base(now), Caster: id, Target: &player},
				&messages.Damage{MessageBase: messages.Base(now), Caster: &id, Target: player, Amount: 1},
				&messages.Damage{MessageBase: messages.Base(now), Caster: &player, Target: id, Amount: 1},
			} {
				require.NoError(t, char.Process(msg))
				require.False(t, char.IsActive())
				require.Empty(t, char.Periods())
			}
			for _, high := range []uint64{0xF110000000000000, 0xF140000000000000, 0xF150000000000000} {
				c, ok := NewBWLPassiveController(creatureEntryGUID(high, entry), all)
				require.False(t, ok)
				require.Nil(t, c)
			}
		}
	}
}
