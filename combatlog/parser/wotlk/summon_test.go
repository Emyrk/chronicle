package wotlk

import (
	"testing"
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/types"
	"github.com/Emyrk/chronicle/combatlog/parsernext/formats/cleu"
	"github.com/Emyrk/chronicle/database"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func decodeSummon(t *testing.T, target string) []messages.Message {
	t.Helper()
	decoder, err := cleu.NewDecoder(cleu.Context{
		Format: database.LogFormat335aCcAddon,
		Flavor: database.WoWFlavor{database.FlavorWrath},
	}, cleu.Hooks{})
	require.NoError(t, err)
	decoded, err := decoder.Decode(time.Time{}, "SPELL_SUMMON", cleu.NewFields([]string{
		"0x000000000008CC7B", "Player", "0", target, "Summon", "0", "1", "Summon", "1",
	}), "")
	require.NoError(t, err)
	return decoded
}

func TestSuffixSummonDoesNotOwnVehicles(t *testing.T) {
	t.Parallel()
	vehicle := guid.GUID(0xF150006C6B000107)
	parsed := decodeSummon(t, "0xF150006C6B000107")
	require.Len(t, parsed, 1)
	classification, ok := parsed[0].(*messages.UnitClassificationEvent)
	require.True(t, ok, "expected *messages.UnitClassificationEvent, got %T", parsed[0])
	assert.Equal(t, vehicle, classification.Target)
	assert.Equal(t, types.UnitTypeVehicle, classification.UnitType)
	assert.Nil(t, classification.Owner)
}

func TestSuffixSummonOwnsNonVehicles(t *testing.T) {
	t.Parallel()
	player := guid.GUID(0x000000000008CC7B)
	totem := guid.GUID(0xF130006C6B000107)
	parsed := decodeSummon(t, "0xF130006C6B000107")
	require.Len(t, parsed, 2)
	owner, ok := parsed[0].(*messages.NewOwner)
	require.True(t, ok, "expected *messages.NewOwner, got %T", parsed[0])
	assert.Equal(t, totem, owner.Target)
	assert.Equal(t, player, owner.NewOwner)
	classification, ok := parsed[1].(*messages.UnitClassificationEvent)
	require.True(t, ok, "expected *messages.UnitClassificationEvent, got %T", parsed[1])
	assert.Equal(t, types.UnitTypeCreature, classification.UnitType)
	require.NotNil(t, classification.Owner)
	assert.Equal(t, player, *classification.Owner)
}
