package synthetic

import (
	"testing"
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/common/characters"
	"github.com/Emyrk/chronicle/combatlog/parser/common/identifier"
	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/common/unitdb"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/types/unitinfo"
	"github.com/Emyrk/chronicle/combatlog/parser/vanilla/creatures"
	"github.com/Emyrk/chronicle/database"
	"github.com/stretchr/testify/require"
)

func TestLightwellCategoryPreservesOwnershipAndActivity(t *testing.T) {
	t.Parallel()
	lightwell, err := guid.FromString("0xF11002C36E4D39B0")
	require.NoError(t, err)
	owner := guid.GUID(1)
	units := unitdb.New(database.WoWFlavor{database.FlavorVanilla, database.FlavorNightmareOfUrsol})
	info := &messages.Unit{MessageBase: messages.Base(hazardTime), Info: unitinfo.Info{Guid: lightwell, Charm: &owner}}
	result := newKnownObjects().ProcessMessages([]messages.Message{info})
	require.Len(t, result, 2)
	require.Equal(t, &owner, info.Owner)
	change, ok := result[1].(*messages.NewOwner)
	require.True(t, ok)
	require.Equal(t, lightwell, change.Target)
	require.Equal(t, owner, change.NewOwner)
	units.Update(info.Info)
	require.Equal(t, unitdb.CategoryObject, units.Category(lightwell))
	chars := characters.NewCharacters(units, []characters.CharacterFactory{creatures.NewObject}, identifier.NewIdentifier(nil))
	_, err = chars.Process(&messages.Heal{MessageBase: messages.Base(hazardTime), Caster: lightwell, Target: owner, Amount: 10})
	require.NoError(t, err)
	char, ok := chars.Get(lightwell)
	require.True(t, ok)
	require.IsType(t, &creatures.Object{}, char)
	require.True(t, char.IsActive())
	_, err = chars.Process(messages.TimedOut(hazardTime.Add(61 * time.Second)))
	require.NoError(t, err)
	require.False(t, char.IsActive())
}
