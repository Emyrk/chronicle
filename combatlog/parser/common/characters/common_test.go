package characters

import (
	"testing"
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/common/characters/period"
	"github.com/Emyrk/chronicle/combatlog/parser/common/identifier"
	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/common/unitdb"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/types/unitinfo"
	"github.com/stretchr/testify/require"
)

// TestOwnerSlain_PermanentPetDies verifies that a permanent pet dies with its
// owner (owner_slain).
func TestOwnerSlain_PermanentPetDies(t *testing.T) {
	t.Parallel()

	db := unitdb.New()
	chars := NewCharacters(db, nil, identifier.NewIdentifier(map[uint32]identifier.Identity{}))

	owner := guid.GUID(0x0000000000000001)
	pet := guid.GUID(0xF140000844000002)
	enemy := guid.GUID(0xF130000000000003)

	db.Update(unitinfo.Info{Guid: pet, Name: "Broken Tooth", Owner: &owner})

	base := time.Date(2026, time.January, 1, 0, 0, 0, 0, time.UTC)
	_, err := chars.Process(&messages.Damage{
		MessageBase: messages.Base(base),
		Caster:      &pet,
		Target:      enemy,
		Amount:      1,
	})
	require.NoError(t, err)

	petChar, ok := chars.Get(pet)
	require.True(t, ok)
	require.True(t, petChar.IsActive(), "pet should be active after dealing damage")

	_, err = chars.Process(&messages.Slain{
		MessageBase: messages.Base(base.Add(5 * time.Second)),
		Victim:      owner,
	})
	require.NoError(t, err)

	require.False(t, petChar.IsActive(), "pet should die with its owner")
	p, ok := petChar.CurrentPeriod()
	require.True(t, ok)
	require.Equal(t, period.EndStateSlain, p.EndState)
	require.Equal(t, ReasonOwnerSlain, p.End.Reason)
}

// TestOwnerSlain_PossessedUnitSurvives verifies that a temporarily possessed
// unit (e.g. Razorgore Mind Controlled via the Orb of Dominion) does not die
// when its controller does, even if a stale UNIT_INFO recorded the controller
// as the unit's owner.
func TestOwnerSlain_PossessedUnitSurvives(t *testing.T) {
	t.Parallel()

	db := unitdb.New()
	chars := NewCharacters(db, nil, identifier.NewIdentifier(map[uint32]identifier.Identity{}))

	controller := guid.GUID(0x0000000000000001)
	boss := guid.GUID(0xF130000844000002)
	enemy := guid.GUID(0xF130000000000003)

	// Simulate a stale owner (e.g. the log started mid-possession).
	db.Update(unitinfo.Info{Guid: boss, Name: "Razorgore the Untamed", Owner: &controller})

	base := time.Date(2026, time.January, 1, 0, 0, 0, 0, time.UTC)
	db.SetPossessed(boss, controller, nil, base, 0)

	_, err := chars.Process(&messages.Damage{
		MessageBase: messages.Base(base),
		Caster:      &boss,
		Target:      enemy,
		Amount:      1,
	})
	require.NoError(t, err)

	bossChar, ok := chars.Get(boss)
	require.True(t, ok)
	require.True(t, bossChar.IsActive(), "boss should be active after dealing damage")

	_, err = chars.Process(&messages.Slain{
		MessageBase: messages.Base(base.Add(5 * time.Second)),
		Victim:      controller,
	})
	require.NoError(t, err)

	require.True(t, bossChar.IsActive(), "possessed unit must not die with its controller")
}
