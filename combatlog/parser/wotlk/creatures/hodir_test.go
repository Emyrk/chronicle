package creatures

import (
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
	"github.com/Emyrk/chronicle/database/gamedb/chrondbc"
)

func newHodirTestCharacters() *characters.Characters {
	return characters.NewCharacters(
		unitdb.New(),
		NewCharacterFactories(database.WoWFlavor{database.FlavorVanilla, database.FlavorWrath}),
		identifier.NewIdentifier(map[uint32]identifier.Identity{}),
	)
}

func TestHodirCreditSpellMarksSurrenderAsSlain(t *testing.T) {
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

	_, err = all.Process(&messages.SpellGo{
		MessageBase: messages.Base(start.Add(time.Second)),
		Caster:      hodirID,
		Target:      &hodirID,
		SpellData:   &chrondbc.Spell{ID: chrondbc.SpellID(hodirCreditSpell)},
	})
	require.NoError(t, err)

	hodir, ok := all.Get(hodirID)
	require.True(t, ok)
	require.False(t, hodir.IsActive())
	require.Equal(t, period.EndStateSlain, hodir.LastEndState())
	require.Equal(t, start.Add(time.Second), hodir.Periods()[0].End.Timestamp.Date())
}

func TestHodirUnrelatedSpellDoesNotEndEncounter(t *testing.T) {
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

	_, err = all.Process(&messages.SpellGo{
		MessageBase: messages.Base(start.Add(time.Second)),
		Caster:      hodirID,
		SpellData:   &chrondbc.Spell{ID: 62038},
	})
	require.NoError(t, err)

	hodir, ok := all.Get(hodirID)
	require.True(t, ok)
	require.True(t, hodir.IsActive())
	require.Equal(t, period.EndStateNone, hodir.LastEndState())
}

func TestHodirOverkillFallbackMarksSurrenderAsSlain(t *testing.T) {
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
