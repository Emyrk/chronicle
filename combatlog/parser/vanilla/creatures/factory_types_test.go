package creatures

import (
	"testing"
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/common/characters"
	"github.com/Emyrk/chronicle/combatlog/parser/common/identifier"
	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/common/unitdb"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/types/unitinfo"
	"github.com/Emyrk/chronicle/database"
	"github.com/stretchr/testify/require"
)

func creatureEntryGUID(high uint64, entry uint32) guid.GUID {
	return guid.GUID(high | uint64(entry)<<24 | 1)
}

func TestUnrecognizedPetsPersistWithoutActivity(t *testing.T) {
	t.Parallel()

	factories := VanillaCharacterFactories(database.WoWFlavor{database.FlavorVanilla})
	db := unitdb.New()
	chars := characters.NewCharacters(
		db,
		factories,
		identifier.NewIdentifier(map[uint32]identifier.Identity{}),
	)

	petID := guid.GUID(0xF1400234DC000005)
	ownerID := guid.GUID(0x000000003B9BC56F)
	now := time.UnixMilli(1788657573465)
	db.Update(unitinfo.Info{
		Seen:         now,
		Guid:         petID,
		Name:         "Sproutling",
		CanCooperate: true,
		Owner:        &ownerID,
	})

	char, added := chars.Add(petID, now)
	require.True(t, added)
	pet, ok := char.(characters.InstanceUnitPersister)
	require.True(t, ok)
	require.True(t, pet.PersistInInstance())
	require.False(t, char.IsActive())

	_, err := chars.Process(&messages.Heal{
		MessageBase: messages.Base(now),
		Caster:      petID,
		Target:      ownerID,
		SpellName:   "Herbal Mend",
	})
	require.NoError(t, err)
	require.False(t, char.IsActive())

	info, ok := db.Get(petID)
	require.True(t, ok)
	require.Equal(t, "Sproutling", info.Name)
	require.Equal(t, ownerID, *info.Owner)
}

func TestUnrecognizedPetFallbackRunsAfterSpecializedFactories(t *testing.T) {
	t.Parallel()

	petID := guid.GUID(0xF140000001000001)
	factories := []characters.CharacterFactory{
		func(id guid.GUID, all *characters.Characters) (characters.Character, bool) {
			if id != petID {
				return nil, false
			}
			return characters.NewCommonCharacter(id, all), true
		},
		NewUnrecognizedPet,
	}
	chars := characters.NewCharacters(
		unitdb.New(),
		factories,
		identifier.NewIdentifier(map[uint32]identifier.Identity{}),
	)

	char, added := chars.Add(petID, time.Time{})
	require.True(t, added)
	require.IsType(t, &characters.Common{}, char)
}

func TestNewObjectRequiresObjectGUID(t *testing.T) {
	t.Parallel()

	chars := characters.NewCharacters(
		unitdb.New(),
		nil,
		identifier.NewIdentifier(map[uint32]identifier.Identity{}),
	)

	for _, entry := range []uint32{181102, 2561} {
		char, ok := NewObject(creatureEntryGUID(0xF140000000000000, entry), chars)
		require.False(t, ok)
		require.Nil(t, char)

		char, ok = NewObject(creatureEntryGUID(0xF110000000000000, entry), chars)
		require.True(t, ok)
		require.NotNil(t, char)
	}
}
