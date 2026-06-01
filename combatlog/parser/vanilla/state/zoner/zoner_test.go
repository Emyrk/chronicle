package zoner_test

import (
	"testing"

	"github.com/stretchr/testify/assert"

	"github.com/Emyrk/chronicle/combatlog/parser/types/zone"
	"github.com/Emyrk/chronicle/combatlog/parser/vanilla/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/vanilla/state/zoner"
)

func zoneMsg(name string, instanceID uint32, maxPlayers int, diffName string, diffIdx int, dynDiff int) messages.Zone {
	return messages.Zone{
		Zone: zone.Zone{
			Name:              name,
			InstanceID:        instanceID,
			MaxPlayers:        maxPlayers,
			DifficultyName:    diffName,
			DifficultyIndex:   diffIdx,
			DynamicDifficulty: dynDiff,
		},
	}
}

func TestLocationProcess(t *testing.T) {
	t.Parallel()

	t.Run("NoChange_EmptyName", func(t *testing.T) {
		t.Parallel()
		loc := zoner.NewLocation()
		result := loc.Process(zoneMsg("", 0, 0, "", 0, 0))
		assert.Equal(t, zone.NoChange, result)
	})

	t.Run("NoChange_SameZone", func(t *testing.T) {
		t.Parallel()
		loc := zoner.NewLocation()
		loc.Process(zoneMsg("molten core", 1, 0, "", 0, 0))
		result := loc.Process(zoneMsg("molten core", 1, 0, "", 0, 0))
		assert.Equal(t, zone.NoChange, result)
	})

	t.Run("ZoneChanged_DifferentName", func(t *testing.T) {
		t.Parallel()
		loc := zoner.NewLocation()
		loc.Process(zoneMsg("molten core", 1, 0, "", 0, 0))
		result := loc.Process(zoneMsg("blackwing lair", 2, 0, "", 0, 0))
		assert.Equal(t, zone.ZoneChanged, result)
		assert.Equal(t, "blackwing lair", loc.Name)
	})

	t.Run("ZoneChanged_DifferentInstanceID", func(t *testing.T) {
		t.Parallel()
		loc := zoner.NewLocation()
		loc.Process(zoneMsg("molten core", 1, 0, "", 0, 0))
		result := loc.Process(zoneMsg("molten core", 2, 0, "", 0, 0))
		assert.Equal(t, zone.ZoneChanged, result)
		assert.Equal(t, uint32(2), loc.InstanceID)
	})

	t.Run("InfoUpdated_LateArrivalDifficulty", func(t *testing.T) {
		t.Parallel()
		loc := zoner.NewLocation()
		// First message: no difficulty info
		loc.Process(zoneMsg("icecrown citadel", 5, 0, "", 0, 0))
		assert.Equal(t, 0, loc.MaxPlayers)

		// Second message: same zone with difficulty info
		result := loc.Process(zoneMsg("icecrown citadel", 5, 25, "25 Player", 2, 0))
		assert.Equal(t, zone.InfoUpdated, result)
		assert.Equal(t, 25, loc.MaxPlayers)
		assert.Equal(t, "25 Player", loc.DifficultyName)
		assert.Equal(t, 2, loc.DifficultyIndex)
	})

	t.Run("DifficultyChanged_DifferentDifficulty", func(t *testing.T) {
		t.Parallel()
		loc := zoner.NewLocation()
		// First message: 10-man normal
		loc.Process(zoneMsg("icecrown citadel", 5, 10, "10 Player", 1, 0))
		assert.Equal(t, 10, loc.MaxPlayers)

		// Second message: same zone, now 25-man
		result := loc.Process(zoneMsg("icecrown citadel", 5, 25, "25 Player", 2, 0))
		assert.Equal(t, zone.DifficultyChanged, result)
		assert.Equal(t, 25, loc.MaxPlayers)
		assert.Equal(t, "25 Player", loc.DifficultyName)
	})

	t.Run("NoChange_SameDifficulty", func(t *testing.T) {
		t.Parallel()
		loc := zoner.NewLocation()
		loc.Process(zoneMsg("icecrown citadel", 5, 25, "25 Player", 2, 0))
		result := loc.Process(zoneMsg("icecrown citadel", 5, 25, "25 Player", 2, 0))
		assert.Equal(t, zone.NoChange, result)
	})

	t.Run("DifficultyChanged_DynamicDifficultyToggle", func(t *testing.T) {
		t.Parallel()
		loc := zoner.NewLocation()
		// Normal mode
		loc.Process(zoneMsg("icecrown citadel", 5, 25, "25 Player", 2, 0))

		// Heroic toggle (DynamicDifficulty changes from 0 to 1)
		result := loc.Process(zoneMsg("icecrown citadel", 5, 25, "25 Player", 2, 1))
		assert.Equal(t, zone.DifficultyChanged, result)
		assert.Equal(t, 1, loc.DynamicDifficulty)
	})

	t.Run("SyntheticCanChangeToDifferentZoneAfterReal", func(t *testing.T) {
		t.Parallel()
		loc := zoner.NewLocation()
		// First: a real zone message for molten core.
		loc.Process(zoneMsg("molten core", 1, 0, "", 0, 0))
		// Second: a synthetic zone message for a different zone.
		synth := zoneMsg("blackwing lair", 2, 0, "", 0, 0)
		synth.MessageBase = messages.Base(synth.Date(), messages.WithSynthetic())
		result := loc.Process(synth)
		assert.Equal(t, zone.ZoneChanged, result)
		assert.Equal(t, "blackwing lair", loc.Name)
	})

	t.Run("SyntheticCannotOverrideSameZoneAfterReal", func(t *testing.T) {
		t.Parallel()
		loc := zoner.NewLocation()
		// First: a real zone message for icecrown citadel with difficulty.
		loc.Process(zoneMsg("icecrown citadel", 5, 25, "25 Player", 2, 0))
		// Second: a synthetic zone message for same zone, no difficulty.
		synth := zoneMsg("icecrown citadel", 5, 0, "", 0, 0)
		synth.MessageBase = messages.Base(synth.Date(), messages.WithSynthetic())
		result := loc.Process(synth)
		assert.Equal(t, zone.NoChange, result)
		// Difficulty should be preserved from the real message.
		assert.Equal(t, 25, loc.MaxPlayers)
		assert.Equal(t, "25 Player", loc.DifficultyName)
	})

	t.Run("NoChange_IncomingNoDifficulty_ExistingHasDifficulty", func(t *testing.T) {
		t.Parallel()
		loc := zoner.NewLocation()
		// Start with difficulty
		loc.Process(zoneMsg("icecrown citadel", 5, 25, "25 Player", 2, 0))

		// Incoming message has no difficulty → no change
		result := loc.Process(zoneMsg("icecrown citadel", 5, 0, "", 0, 0))
		assert.Equal(t, zone.NoChange, result)
		// Difficulty should be preserved
		assert.Equal(t, 25, loc.MaxPlayers)
		assert.Equal(t, "25 Player", loc.DifficultyName)
	})
}
