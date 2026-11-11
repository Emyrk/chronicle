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
)

func newIcecrownTestCharacters() *characters.Characters {
	return characters.NewCharacters(
		unitdb.New(),
		NewCharacterFactories(database.WoWFlavor{database.FlavorWrath}),
		identifier.NewIdentifier(map[uint32]identifier.Identity{}),
	)
}

func TestGunshipPositiveOverkillMarksShipDefeated(t *testing.T) {
	t.Parallel()

	all := newIcecrownTestCharacters()
	player := guid.GUID(1)
	ship := creatureGUID(orgrimsHammerEntry)
	start := time.Date(2026, time.November, 5, 20, 28, 6, 0, time.UTC)

	_, err := all.Process(&messages.Damage{
		MessageBase: messages.Base(start),
		Caster:      &player,
		Target:      ship,
		Amount:      1500,
		HitType:     types.HitTypeHit,
	})
	require.NoError(t, err)

	_, err = all.Process(&messages.Damage{
		MessageBase: messages.Base(start.Add(4*time.Minute + 44*time.Second)),
		Caster:      &player,
		Target:      ship,
		Amount:      1500,
		Overkill:    1290,
		HitType:     types.HitTypeHit,
	})
	require.NoError(t, err)

	got, ok := all.Get(ship)
	require.True(t, ok)
	require.False(t, got.IsActive())
	require.Equal(t, period.EndStateSlain, got.LastEndState())
}

func TestValithriaDreamwalkersRageMarksVictory(t *testing.T) {
	t.Parallel()

	all := newIcecrownTestCharacters()
	attacker := creatureGUID(37868)
	valithria := creatureGUID(valithriaDreamwalkerEntry)
	start := time.Date(2026, time.November, 5, 22, 19, 40, 0, time.UTC)

	_, err := all.Process(&messages.Damage{
		MessageBase: messages.Base(start),
		Caster:      &attacker,
		Target:      valithria,
		Amount:      1,
		HitType:     types.HitTypeHit,
	})
	require.NoError(t, err)

	_, err = all.Process(&messages.SpellStart{
		MessageBase: messages.Base(start.Add(7*time.Minute + 38*time.Second)),
		Caster:      valithria,
		SpellID:     dreamwalkersRageSpellID,
	})
	require.NoError(t, err)

	got, ok := all.Get(valithria)
	require.True(t, ok)
	require.False(t, got.IsActive())
	require.Equal(t, period.EndStateSlain, got.LastEndState())
}
