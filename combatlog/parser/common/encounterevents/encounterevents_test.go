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
