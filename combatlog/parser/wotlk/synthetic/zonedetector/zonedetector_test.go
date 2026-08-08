package zonedetector_test

import (
	"log/slog"
	"testing"
	"time"

	"github.com/Emyrk/chronicle/database"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/common/registry"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/types/unitinfo"
	"github.com/Emyrk/chronicle/combatlog/parser/types/zone"
	"github.com/Emyrk/chronicle/combatlog/parser/wotlk/synthetic/zonedetector"
	"github.com/Emyrk/chronicle/internal/testutil"
)

// creatureGUID builds a GUID with the given creature entry ID.
func creatureGUID(entry uint32) guid.GUID {
	return guid.GUID(0x0030000000000001 | (uint64(entry) << 24))
}

func unitMsg(ts time.Time, g guid.GUID) messages.Message {
	return &messages.Unit{
		MessageBase: messages.Base(ts),
		Info:        unitinfo.Info{Guid: g, Seen: ts},
	}
}

func TestZoneDetector_EmitsZoneOnNexusCreature(t *testing.T) {
	t.Parallel()

	r := registry.NewRegistry(slog.Default(), database.WoWFlavor{database.FlavorWrath})
	reg := registry.RegisterWrath(r)
	zd := zonedetector.New(testutil.Logger(t), reg)

	ts := time.Date(2025, 1, 1, 12, 0, 0, 0, time.UTC)
	msg := unitMsg(ts, creatureGUID(26763)) // Anomalus

	result := zd.ProcessMessages([]messages.Message{msg})
	require.Greater(t, len(result), 1, "should prepend a synthetic zone message")

	zoneMsg, ok := result[0].(*messages.Zone)
	require.True(t, ok, "first message should be *messages.Zone")
	assert.Equal(t, "the nexus", zoneMsg.Name)
	assert.True(t, zoneMsg.IsInstance)
	assert.Equal(t, "the nexus", zd.LastZone())
}

func TestZoneDetector_NoDuplicateZone(t *testing.T) {
	t.Parallel()

	reg := registry.RegisterWrath(registry.NewRegistry(slog.Default(), database.WoWFlavor{database.FlavorWrath}))
	zd := zonedetector.New(testutil.Logger(t), reg)

	ts := time.Date(2025, 1, 1, 12, 0, 0, 0, time.UTC)
	msg := unitMsg(ts, creatureGUID(26731)) // Grand Magus Telestra

	// First call emits zone.
	result := zd.ProcessMessages([]messages.Message{msg})
	require.Greater(t, len(result), 1)

	// Second call with same zone should NOT emit again.
	result2 := zd.ProcessMessages([]messages.Message{msg})
	assert.Len(t, result2, 1, "should not emit duplicate zone message")
}

func TestZoneDetector_IgnoresPlayerGUID(t *testing.T) {
	t.Parallel()

	reg := registry.RegisterWrath(registry.NewRegistry(slog.Default(), database.WoWFlavor{database.FlavorWrath}))
	zd := zonedetector.New(testutil.Logger(t), reg)

	ts := time.Date(2025, 1, 1, 12, 0, 0, 0, time.UTC)
	msg := unitMsg(ts, guid.GUID(0x0000000000000001)) // player

	result := zd.ProcessMessages([]messages.Message{msg})
	assert.Len(t, result, 1, "player GUID should not trigger zone detection")
	assert.Empty(t, zd.LastZone())
}

func TestZoneDetector_PetDamageDoesNotChangeZone(t *testing.T) {
	t.Parallel()

	reg := registry.RegistryForFlavor(slog.Default(), database.WoWFlavor{database.FlavorTBC})
	zd := zonedetector.New(testutil.Logger(t), reg)

	ts := time.Date(2025, 1, 1, 12, 0, 0, 0, time.UTC)
	zd.ProcessMessages([]messages.Message{&messages.Zone{
		MessageBase: messages.Base(ts),
		Zone:        zone.Zone{Seen: ts, Name: "karazhan", IsInstance: true},
	}})

	// Felguard pet entry 11319 overlaps an NPC registered in Ragefire Chasm.
	// The target is Nightbane, so this damage must remain in Karazhan.
	pet := guid.GUID(0xF140002C37000009)
	nightbane := creatureGUID(17225)
	result := zd.ProcessMessages([]messages.Message{&messages.Damage{
		MessageBase: messages.Base(ts.Add(time.Second)),
		Caster:      &pet,
		Target:      nightbane,
	}})

	assert.Len(t, result, 1, "pet damage should not emit a synthetic zone change")
	assert.Equal(t, "karazhan", zd.LastZone())
}

func TestZoneDetector_ContinuesAfterRealZone(t *testing.T) {
	t.Parallel()

	reg := registry.RegisterWrath(registry.NewRegistry(slog.Default(), database.WoWFlavor{database.FlavorWrath}))
	zd := zonedetector.New(testutil.Logger(t), reg)

	ts := time.Date(2025, 1, 1, 12, 0, 0, 0, time.UTC)

	// First: a real (non-synthetic) zone message for "the nexus".
	realZone := &messages.Zone{
		MessageBase: messages.Base(ts),
		Zone:        zone.Zone{Seen: ts, Name: "the nexus", IsInstance: true},
	}
	result := zd.ProcessMessages([]messages.Message{realZone})
	require.Len(t, result, 1, "real zone message should pass through without prepending")
	assert.Equal(t, "the nexus", zd.LastZone())

	// Second: a creature from Utgarde Keep (different zone).
	ts2 := ts.Add(time.Minute)
	msg := unitMsg(ts2, creatureGUID(23953)) // Prince Keleseth
	result = zd.ProcessMessages([]messages.Message{msg})
	require.Greater(t, len(result), 1, "should prepend a synthetic zone message for the new zone")

	zoneMsg, ok := result[0].(*messages.Zone)
	require.True(t, ok, "first message should be *messages.Zone")
	assert.Equal(t, "utgarde keep", zoneMsg.Name)
	assert.True(t, zoneMsg.IsInstance)
	assert.True(t, zoneMsg.Synthetic)
	assert.Equal(t, "utgarde keep", zd.LastZone())
}

func TestZoneDetector_NoEmitForSameZoneAsReal(t *testing.T) {
	t.Parallel()

	reg := registry.RegisterWrath(registry.NewRegistry(slog.Default(), database.WoWFlavor{database.FlavorWrath}))
	zd := zonedetector.New(testutil.Logger(t), reg)

	ts := time.Date(2025, 1, 1, 12, 0, 0, 0, time.UTC)

	// A real zone message for "the nexus".
	realZone := &messages.Zone{
		MessageBase: messages.Base(ts),
		Zone:        zone.Zone{Seen: ts, Name: "the nexus", IsInstance: true},
	}
	result := zd.ProcessMessages([]messages.Message{realZone})
	require.Len(t, result, 1)

	// Now a creature from the nexus — should NOT emit synthetic (real already covers it).
	ts2 := ts.Add(time.Minute)
	msg := unitMsg(ts2, creatureGUID(26763)) // Anomalus (the nexus)
	result = zd.ProcessMessages([]messages.Message{msg})
	assert.Len(t, result, 1, "should not emit synthetic zone for same zone as real")
	assert.Equal(t, "the nexus", zd.LastZone())
}
