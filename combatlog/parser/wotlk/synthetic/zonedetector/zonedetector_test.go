package zonedetector_test

import (
	"log/slog"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/types/unitinfo"
	"github.com/Emyrk/chronicle/combatlog/parser/vanilla/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/vanilla/state/encounters/registry"
	"github.com/Emyrk/chronicle/combatlog/parser/wotlk/synthetic/zonedetector"
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

	reg := registry.WarmaneStaticRegistry(slog.Default())
	zd := zonedetector.New(reg)

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

func TestZoneDetector_EmitsZoneOnSupportedWarmaneRaidCreatures(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name         string
		entry        uint32
		expectedZone string
	}{
		{name: "oculus", entry: 27656, expectedZone: "the oculus"},
		{name: "forge of souls", entry: 36502, expectedZone: "forge of souls"},
		{name: "halls of reflection", entry: 38112, expectedZone: "halls of reflection"},
		{name: "vault of archavon", entry: 31125, expectedZone: "vault of archavon"},
		{name: "obsidian sanctum", entry: 28860, expectedZone: "the obsidian sanctum"},
		{name: "eye of eternity", entry: 28859, expectedZone: "the eye of eternity"},
		{name: "trial of the crusader", entry: 34780, expectedZone: "trial of the crusader"},
		{name: "ruby sanctum", entry: 39863, expectedZone: "the ruby sanctum"},
		{name: "naxxramas", entry: 15956, expectedZone: "naxxramas"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			reg := registry.WarmaneStaticRegistry(slog.Default())
			zd := zonedetector.New(reg)

			ts := time.Date(2025, 1, 1, 12, 0, 0, 0, time.UTC)
			msg := unitMsg(ts, creatureGUID(tt.entry))

			result := zd.ProcessMessages([]messages.Message{msg})
			require.Greater(t, len(result), 1, "should prepend a synthetic zone message")

			zoneMsg, ok := result[0].(*messages.Zone)
			require.True(t, ok, "first message should be *messages.Zone")
			assert.Equal(t, tt.expectedZone, zoneMsg.Name)
			assert.True(t, zoneMsg.IsInstance)
			assert.Equal(t, tt.expectedZone, zd.LastZone())
		})
	}
}

func TestZoneDetector_NoDuplicateZone(t *testing.T) {
	t.Parallel()

	reg := registry.WarmaneStaticRegistry(slog.Default())
	zd := zonedetector.New(reg)

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

	reg := registry.WarmaneStaticRegistry(slog.Default())
	zd := zonedetector.New(reg)

	ts := time.Date(2025, 1, 1, 12, 0, 0, 0, time.UTC)
	msg := unitMsg(ts, guid.GUID(0x0000000000000001)) // player

	result := zd.ProcessMessages([]messages.Message{msg})
	assert.Len(t, result, 1, "player GUID should not trigger zone detection")
	assert.Empty(t, zd.LastZone())
}
