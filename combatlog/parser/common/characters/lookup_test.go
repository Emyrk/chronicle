package characters

import (
	"testing"
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/common/identifier"
	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/common/unitdb"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/stretchr/testify/require"
)

func entryGUID(high uint64, entry uint32) guid.GUID {
	return guid.GUID(high | uint64(entry)<<24 | 1)
}

func TestCreatureFactoriesRejectNonCreatureGUIDs(t *testing.T) {
	t.Parallel()

	calls := 0
	factory := func(id guid.GUID, _ *Characters) (Character, bool) {
		calls++
		return NewNeverActive(id), true
	}
	wrapped := CreatureFactories(factory)
	require.Len(t, wrapped, 1)

	const entry = 11583
	for _, id := range []guid.GUID{
		entryGUID(0xF140000000000000, entry), // Pet
		entryGUID(0xF150000000000000, entry), // Vehicle
		entryGUID(0xF110000000000000, entry), // Object
	} {
		char, ok := wrapped[0](id, nil)
		require.False(t, ok)
		require.Nil(t, char)
	}
	require.Zero(t, calls)

	creature := entryGUID(0xF130000000000000, entry)
	char, ok := wrapped[0](creature, nil)
	require.True(t, ok)
	require.Equal(t, creature, char.ID())
	require.Equal(t, 1, calls)
}

func TestNamedNeverActivePreservesUnitName(t *testing.T) {
	t.Parallel()

	chars := NewCharacters(
		unitdb.New(),
		nil,
		identifier.NewIdentifier(map[uint32]identifier.Identity{}),
	)
	id := entryGUID(0xF150000000000000, 33214)

	character := NewNamedNeverActive(id, chars, "Mechanolift 304-A")
	require.False(t, character.IsActive())
	require.True(t, character.PersistInInstance())
	require.False(t, NewNeverActive(id).PersistInInstance())

	info, ok := chars.DB().Get(id)
	require.True(t, ok)
	require.Equal(t, "Mechanolift 304-A", info.Name)
}

func TestCharactersByEntryOnlyIndexesCreatures(t *testing.T) {
	t.Parallel()

	chars := NewCharacters(
		unitdb.New(),
		nil,
		identifier.NewIdentifier(map[uint32]identifier.Identity{}),
	)
	const entry = 11583
	now := time.Date(2026, time.August, 8, 0, 0, 0, 0, time.UTC)

	pet, _ := chars.Add(entryGUID(0xF140000000000000, entry), now)
	vehicle, _ := chars.Add(entryGUID(0xF150000000000000, entry), now)
	object, _ := chars.Add(entryGUID(0xF110000000000000, entry), now)
	creature, _ := chars.Add(entryGUID(0xF130000000000000, entry), now)

	require.NotNil(t, pet)
	require.NotNil(t, vehicle)
	require.NotNil(t, object)
	require.Equal(t, []Character{creature}, chars.ByEntry[entry])
}

func TestCrittersRemainInactiveWithoutSuppressingOtherActivity(t *testing.T) {
	t.Parallel()
	chars := NewCharacters(unitdb.New(), nil, identifier.NewIdentifier(map[uint32]identifier.Identity{}))
	player := guid.GUID(1)
	rat := entryGUID(0xF130000000000000, 4075)
	boss := entryGUID(0xF130000000000000, 11583)
	at := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)
	damage := func(target guid.GUID, when time.Time) {
		_, err := chars.Process(&messages.Damage{MessageBase: messages.Base(when), Caster: &player, Target: target, Amount: 10})
		require.NoError(t, err)
	}
	damage(rat, at)
	ratChar, ok := chars.Get(rat)
	require.True(t, ok, "critter identity is retained")
	require.IsType(t, NeverActive{}, ratChar)
	require.False(t, ratChar.IsActive())
	require.Empty(t, ratChar.Periods())
	playerChar, ok := chars.Get(player)
	require.True(t, ok)
	require.True(t, playerChar.IsActive(), "critter combat still starts player activity")
	damage(boss, at.Add(time.Second))
	bossChar, _ := chars.Get(boss)
	require.True(t, bossChar.IsActive())
	damage(rat, at.Add(2*time.Second))
	after, ok := playerChar.CurrentPeriod()
	require.True(t, ok)
	require.Equal(t, at.Add(2*time.Second), after.LastActive.Timestamp.Date(), "critter damage refreshes player activity")
	damage(rat, at.Add(time.Hour))
	require.False(t, bossChar.IsActive(), "critter events still expire unrelated activity")
	require.True(t, playerChar.IsActive())
	require.False(t, ratChar.IsActive())
	require.Empty(t, ratChar.Periods(), "critters never gain their own activity periods")
	_, err := chars.Process(messages.TimedOut(at.Add(2 * time.Hour)))
	require.NoError(t, err)
	require.False(t, playerChar.IsActive(), "normal player timeouts still work")
}
