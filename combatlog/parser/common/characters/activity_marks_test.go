package characters

import (
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	"github.com/Emyrk/chronicle/combatlog/parser/common/identifier"
	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/common/unitdb"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
)

func TestIgnoreActivityMarkPreventsDamageBump(t *testing.T) {
	t.Parallel()

	chars := NewCharacters(unitdb.New(), nil, identifier.NewIdentifier(map[uint32]identifier.Identity{}))
	boss := guid.GUID(0xF130000001000001)
	player := guid.GUID(1)
	start := time.Date(2026, time.August, 9, 12, 0, 0, 0, time.UTC)

	_, err := chars.Process(&messages.Damage{
		MessageBase: messages.Base(start),
		Caster:      &boss,
		Target:      player,
		Amount:      1,
	})
	require.NoError(t, err)
	bossCharacter, ok := chars.Get(boss)
	require.True(t, ok)
	require.True(t, bossCharacter.IsActive())

	attributed := &messages.Damage{
		MessageBase: messages.Base(start.Add(30 * time.Second)),
		Caster:      &boss,
		Target:      player,
		Amount:      1,
	}
	attributed.MarkActivityIgnore("attributed environment damage", boss)
	_, err = chars.Process(attributed)
	require.NoError(t, err)

	_, err = chars.Process(messages.TimedOut(start.Add(70 * time.Second)))
	require.NoError(t, err)
	require.False(t, bossCharacter.IsActive(), "ignored damage must not extend the activity timeout")
}
