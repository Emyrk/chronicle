package characters

import (
	"testing"
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/vanilla/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/vanilla/state/unitdb"
	"github.com/stretchr/testify/require"
)

func TestCommonActivitySpellGoStartsCreature(t *testing.T) {
	t.Parallel()

	lookup := NewCharacters(unitdb.New(), nil)
	creatureID := guid.GUID(0xF130003E55000069)
	char, _ := lookup.Add(creatureID, time.Unix(0, 0))

	err := char.Process(&messages.SpellGo{
		MessageBase: messages.Base(time.Unix(5, 0)),
		Caster:      creatureID,
	})
	require.NoError(t, err)
	require.True(t, char.IsActive())

	_, ok := char.CurrentPeriod()
	require.True(t, ok)
}

func TestCommonActivitySpellGoDoesNotStartPlayer(t *testing.T) {
	t.Parallel()

	lookup := NewCharacters(unitdb.New(), nil)
	playerID := guid.GUID(0x0000000000015A2F)
	char, _ := lookup.Add(playerID, time.Unix(0, 0))

	err := char.Process(&messages.SpellGo{
		MessageBase: messages.Base(time.Unix(5, 0)),
		Caster:      playerID,
	})
	require.NoError(t, err)
	require.False(t, char.IsActive())
}
