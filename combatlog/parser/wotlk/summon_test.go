package wotlk

import (
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/types"
)

func TestSuffixSummonDoesNotOwnVehicles(t *testing.T) {
	t.Parallel()

	player := guid.GUID(0x000000000008CC7B)
	vehicle := guid.GUID(0xF150006C6B000107)
	p := &Parser{}

	parsed, err := p.suffixSummon(time.Time{}, nil, baseParams{
		sourceGUID: player,
		destGUID:   vehicle,
	}, &Matched{})
	require.NoError(t, err)
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
	p := &Parser{}

	parsed, err := p.suffixSummon(time.Time{}, nil, baseParams{
		sourceGUID: player,
		destGUID:   totem,
	}, &Matched{})
	require.NoError(t, err)
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
