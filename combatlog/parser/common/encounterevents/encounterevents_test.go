package encounterevents_test

import (
	"testing"
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/common/encounterevents"
	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/types"
	"github.com/Emyrk/chronicle/database/gamedb/chrondbc"
	"github.com/stretchr/testify/require"
)

func TestUnitTelemetryRoutesToDedicatedStreams(t *testing.T) {
	t.Parallel()

	ts := time.Date(2026, time.September, 20, 12, 0, 0, 0, time.UTC)
	events := encounterevents.New(false)
	require.NoError(t, events.Process(&messages.UnitPosition{
		MessageBase: messages.Base(ts),
		Unit:        guid.GUID(1),
		X:           1,
		Y:           2,
		MapID:       3,
		Facing:      4,
	}))
	require.NoError(t, events.Process(&messages.UnitResources{
		MessageBase:   messages.Base(ts),
		Unit:          guid.GUID(1),
		CurrentHealth: 10,
		MaximumHealth: 20,
		PowerType:     types.ResourceMana,
		CurrentPower:  30,
		MaximumPower:  40,
	}))

	require.Equal(t, int64(1), events.UnitPosition.Count)
	require.Equal(t, int64(1), events.UnitResources.Count)
	require.Equal(t, ts, events.UnitPosition.First)
	require.Equal(t, ts, events.UnitResources.First)
}

func TestUnitTelemetryDeduplicationIsEncounterScoped(t *testing.T) {
	t.Parallel()

	ts := time.Date(2026, time.October, 5, 12, 0, 0, 0, time.UTC)
	unit := guid.GUID(1)
	position := &messages.UnitPosition{
		MessageBase: messages.Base(ts),
		Unit:        unit,
		X:           -107.55,
		Y:           180.18,
		Facing:      0.636,
	}
	resources := &messages.UnitResources{
		MessageBase:   messages.Base(ts),
		Unit:          unit,
		CurrentHealth: 54,
		MaximumHealth: 100,
		PowerType:     types.ResourceMana,
		CurrentPower:  20,
		MaximumPower:  40,
	}

	firstEncounter := encounterevents.New(false)
	require.NoError(t, firstEncounter.Process(position))
	require.NoError(t, firstEncounter.Process(resources))
	require.NoError(t, firstEncounter.Process(&messages.UnitPosition{
		MessageBase: messages.Base(ts.Add(time.Second)),
		Unit:        unit,
		X:           position.X,
		Y:           position.Y,
		MapID:       position.MapID,
		Facing:      position.Facing,
	}))
	require.NoError(t, firstEncounter.Process(&messages.UnitResources{
		MessageBase:   messages.Base(ts.Add(time.Second)),
		Unit:          unit,
		CurrentHealth: resources.CurrentHealth,
		MaximumHealth: resources.MaximumHealth,
		Absorb:        resources.Absorb,
		PowerType:     resources.PowerType,
		CurrentPower:  resources.CurrentPower,
		MaximumPower:  resources.MaximumPower,
		AttackPower:   resources.AttackPower,
		SpellPower:    resources.SpellPower,
		Armor:         resources.Armor,
	}))
	require.NoError(t, firstEncounter.Process(&messages.UnitPosition{
		MessageBase: messages.Base(ts.Add(2 * time.Second)),
		Unit:        unit,
		X:           position.X + 1,
		Y:           position.Y,
		MapID:       position.MapID,
		Facing:      position.Facing,
	}))
	require.NoError(t, firstEncounter.Process(&messages.UnitResources{
		MessageBase:   messages.Base(ts.Add(2 * time.Second)),
		Unit:          unit,
		CurrentHealth: resources.CurrentHealth - 1,
		MaximumHealth: resources.MaximumHealth,
		Absorb:        resources.Absorb,
		PowerType:     resources.PowerType,
		CurrentPower:  resources.CurrentPower,
		MaximumPower:  resources.MaximumPower,
		AttackPower:   resources.AttackPower,
		SpellPower:    resources.SpellPower,
		Armor:         resources.Armor,
	}))
	require.Equal(t, int64(2), firstEncounter.UnitPosition.Count)
	require.Equal(t, int64(2), firstEncounter.UnitResources.Count)

	secondEncounter := encounterevents.New(false)
	require.NoError(t, secondEncounter.Process(position))
	require.NoError(t, secondEncounter.Process(resources))
	require.Equal(t, int64(1), secondEncounter.UnitPosition.Count)
	require.Equal(t, int64(1), secondEncounter.UnitResources.Count)
}

func TestFirstEventEstablishesZero(t *testing.T) {
	t.Parallel()
	ts := time.Date(2026, time.July, 29, 12, 0, 0, 0, time.UTC)
	events := encounterevents.New(false)

	err := events.Process(&messages.Aura{
		MessageBase: messages.Base(ts, messages.WithSynthetic()),
		Target:      guid.GUID(1),
		SpellData:   &chrondbc.Spell{ID: 1},
		SpellName:   "Pre-pull aura",
		State:       types.AuraStateAdded,
	})
	require.NoError(t, err)
	require.Equal(t, ts, events.Aura.First,
		"first event processed sets the builder zero")
}
