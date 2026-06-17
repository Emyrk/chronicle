package instances

import (
	"testing"
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/types"
	"github.com/Emyrk/chronicle/combatlog/parser/types/unitinfo"
	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/common/unitdb"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func mustGUID(t *testing.T, s string) guid.GUID {
	t.Helper()
	g, err := guid.FromString(s)
	require.NoError(t, err)
	return g
}

func TestClassificationEmitter_PossessionChange(t *testing.T) {
	t.Parallel()

	units := unitdb.New()
	playerGUID := mustGUID(t, "0x0000000000000001")
	creatureGUID := mustGUID(t, "0x0030000000000002")

	// Mark creature as hostile.
	units.Update(unitinfo.Info{Guid: creatureGUID, CanCooperate: false})

	var emitted []*messages.UnitClassificationEvent
	ce := &ClassificationEmitter{
		units: units,
		emit: func(evt *messages.UnitClassificationEvent) {
			emitted = append(emitted, evt)
		},
	}

	now := time.Date(2025, 1, 1, 0, 0, 0, 0, time.UTC)

	// Simulate a possession gain via ProcessMessage.
	pc := &messages.PossessionChange{
		MessageBase: messages.Base(now),
		Target:      creatureGUID,
		Controller:  playerGUID,
		Gained:      true,
	}
	// First update unit state so the emitter sees the possession.
	_ = units.ProcessMessage(pc)

	err := ce.ProcessMessage(true, uuid.New(), pc)
	require.NoError(t, err)

	require.Len(t, emitted, 1)
	assert.Equal(t, creatureGUID, emitted[0].Target)
	assert.Equal(t, types.AffiliationFriendly, emitted[0].Affiliation)
	assert.NotNil(t, emitted[0].Controller)
	assert.Equal(t, playerGUID, *emitted[0].Controller)

	// Simulate a possession release.
	emitted = nil
	release := &messages.PossessionChange{
		MessageBase: messages.Base(now.Add(time.Second)),
		Target:      creatureGUID,
		Controller:  playerGUID,
		Gained:      false,
	}
	_ = units.ProcessMessage(release)

	err = ce.ProcessMessage(true, uuid.New(), release)
	require.NoError(t, err)

	require.Len(t, emitted, 1)
	assert.Equal(t, creatureGUID, emitted[0].Target)
	assert.Equal(t, types.AffiliationHostile, emitted[0].Affiliation)
	assert.Nil(t, emitted[0].Controller)
}

func TestClassificationEmitter_EmitsRegardlessOfFightState(t *testing.T) {
	t.Parallel()

	units := unitdb.New()
	creatureGUID := mustGUID(t, "0x0030000000000002")
	units.Update(unitinfo.Info{Guid: creatureGUID, CanCooperate: false})

	var emitted []*messages.UnitClassificationEvent
	ce := &ClassificationEmitter{
		units: units,
		emit: func(evt *messages.UnitClassificationEvent) {
			emitted = append(emitted, evt)
		},
	}

	now := time.Date(2025, 1, 1, 0, 0, 0, 0, time.UTC)
	pc := &messages.PossessionChange{
		MessageBase: messages.Base(now),
		Target:      creatureGUID,
		Controller:  mustGUID(t, "0x0000000000000001"),
		Gained:      true,
	}
	_ = units.ProcessMessage(pc)

	// ProcessMessage emits even when active=false (emit callback gates on fight state).
	err := ce.ProcessMessage(false, uuid.New(), pc)
	require.NoError(t, err)
	require.Len(t, emitted, 1)
	assert.Equal(t, creatureGUID, emitted[0].Target)
}

func TestClassificationEmitter_NewOwner(t *testing.T) {
	t.Parallel()

	units := unitdb.New()
	creatureGUID := mustGUID(t, "0x0030000000000002")
	ownerGUID := mustGUID(t, "0x0000000000000001")
	units.Update(unitinfo.Info{Guid: creatureGUID, CanCooperate: true})

	var emitted []*messages.UnitClassificationEvent
	ce := &ClassificationEmitter{
		units: units,
		emit: func(evt *messages.UnitClassificationEvent) {
			emitted = append(emitted, evt)
		},
	}

	now := time.Date(2025, 1, 1, 0, 0, 0, 0, time.UTC)
	no := &messages.NewOwner{
		MessageBase: messages.Base(now),
		Target:      creatureGUID,
		NewOwner:    ownerGUID,
	}
	_ = units.ProcessMessage(no)

	err := ce.ProcessMessage(true, uuid.New(), no)
	require.NoError(t, err)
	require.Len(t, emitted, 1)
	assert.Equal(t, creatureGUID, emitted[0].Target)
	require.NotNil(t, emitted[0].Owner)
	assert.Equal(t, ownerGUID, *emitted[0].Owner)
}
