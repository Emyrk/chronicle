package vehicles

import (
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
)

func TestTrackerBuildsDelayedVehicleTimeline(t *testing.T) {
	t.Parallel()
	tracker := New()
	tracker.Process(versionMessage("rfc-session", time.UnixMilli(1786243250000)))

	vehicle := guid.GUID(0xF15000812400008F)
	firstController := guid.GUID(0x000000000000000B)
	secondController := guid.GUID(0x000000000000000C)
	tracker.Process(vehicleMessage(messages.VehicleControlAssign, vehicle, firstController, 1786243259341, 0))
	tracker.Process(vehicleMessage(messages.VehicleControlRelease, vehicle, firstController, 1786243279753, 1))
	tracker.Process(vehicleMessage(messages.VehicleControlAssign, vehicle, secondController, 1786243299716, 2))

	metadata := tracker.MetadataForRange(time.UnixMilli(1786243260000), time.UnixMilli(1786243350000))
	require.Len(t, metadata.Intervals, 2)

	first := metadata.Intervals[0]
	assert.Equal(t, "rfc-session", first.SessionID)
	assert.Equal(t, firstController, first.ControllerGUID)
	assert.Equal(t, int64(1786243259341), first.AssignedAtMs)
	require.NotNil(t, first.ReleasedAtMs)
	assert.Equal(t, int64(1786243279753), *first.ReleasedAtMs)
	assert.Equal(t, ReleaseReasonExplicit, first.ReleaseReason)
	assert.False(t, first.InferredRelease)

	second := metadata.Intervals[1]
	assert.Equal(t, secondController, second.ControllerGUID)
	assert.Nil(t, second.ReleasedAtMs)
}

func TestTrackerUsesTimestampThenOrdinal(t *testing.T) {
	t.Parallel()
	tracker := New()
	vehicle := guid.GUID(0xF15000812B000090)
	firstController := guid.GUID(0x000000000000000B)
	secondController := guid.GUID(0x000000000000000C)

	tracker.Process(versionMessage("same-time", time.UnixMilli(1000)))
	tracker.Process(vehicleMessage(messages.VehicleControlAssign, vehicle, firstController, 2000, 0))
	// Feed assignment before release to prove the embedded ordinal, not arrival order,
	// determines which equal-timestamp change applies first.
	tracker.Process(vehicleMessage(messages.VehicleControlAssign, vehicle, secondController, 3000, 2))
	tracker.Process(vehicleMessage(messages.VehicleControlRelease, vehicle, firstController, 3000, 1))

	metadata := tracker.MetadataForRange(time.UnixMilli(1500), time.UnixMilli(4000))
	require.Len(t, metadata.Intervals, 2)
	require.NotNil(t, metadata.Intervals[0].ReleasedAtMs)
	assert.Equal(t, int64(3000), *metadata.Intervals[0].ReleasedAtMs)
	assert.Equal(t, firstController, metadata.Intervals[0].ControllerGUID)
	assert.Equal(t, secondController, metadata.Intervals[1].ControllerGUID)
	assert.Nil(t, metadata.Intervals[1].ReleasedAtMs)
	assert.Empty(t, metadata.Diagnostics)
}

func TestTrackerClosesOpenIntervalsAtSessionBoundary(t *testing.T) {
	t.Parallel()
	tracker := New()
	vehicle := guid.GUID(0xF15000812400008F)
	controller := guid.GUID(0x000000000000000B)

	tracker.Process(versionMessage("before-reload", time.UnixMilli(1000)))
	tracker.Process(vehicleMessage(messages.VehicleControlAssign, vehicle, controller, 2000, 0))
	tracker.Process(versionMessage("after-reload", time.UnixMilli(5000)))

	metadata := tracker.MetadataForRange(time.UnixMilli(1500), time.UnixMilli(6000))
	require.Len(t, metadata.Intervals, 1)
	interval := metadata.Intervals[0]
	require.NotNil(t, interval.ReleasedAtMs)
	assert.Equal(t, int64(5000), *interval.ReleasedAtMs)
	assert.Equal(t, ReleaseReasonSessionBoundary, interval.ReleaseReason)
	assert.True(t, interval.InferredRelease)
}

func TestTrackerRetainsVehicleDiagnostics(t *testing.T) {
	t.Parallel()
	tracker := New()
	vehicle := guid.GUID(0xF15000812400008F)
	controller := guid.GUID(0x000000000000000B)
	otherController := guid.GUID(0x000000000000000C)

	tracker.Process(versionMessage("diagnostics", time.UnixMilli(1000)))
	tracker.Process(vehicleMessage(messages.VehicleControlRelease, vehicle, controller, 2000, 0))
	tracker.Process(vehicleMessage(messages.VehicleControlAssign, vehicle, controller, 3000, 1))
	tracker.Process(vehicleMessage(messages.VehicleControlAssign, vehicle, controller, 4000, 2))
	tracker.Process(vehicleMessage(messages.VehicleControlRelease, vehicle, otherController, 5000, 3))

	metadata := tracker.MetadataForRange(time.UnixMilli(1500), time.UnixMilli(6000))
	require.Len(t, metadata.Diagnostics, 3)
	assert.Equal(t, DiagnosticUnmatchedRelease, metadata.Diagnostics[0].Kind)
	assert.Equal(t, DiagnosticDuplicateAssignment, metadata.Diagnostics[1].Kind)
	assert.Equal(t, DiagnosticStaleRelease, metadata.Diagnostics[2].Kind)
	require.NotNil(t, metadata.Diagnostics[2].ActiveControllerGUID)
	assert.Equal(t, controller, *metadata.Diagnostics[2].ActiveControllerGUID)
}

func versionMessage(sessionID string, at time.Time) *messages.Versions {
	return &messages.Versions{
		MessageBase: messages.Base(at),
		SessionID:   sessionID,
	}
}

func vehicleMessage(action messages.VehicleControlAction, vehicle, controller guid.GUID, timestampMs int64, ordinal uint64) *messages.VehicleControl {
	return &messages.VehicleControl{
		MessageBase:    messages.Base(time.UnixMilli(timestampMs)),
		Action:         action,
		VehicleGUID:    vehicle,
		ControllerGUID: controller,
		VehicleName:    "Vehicle",
		ControllerName: "Controller",
		Ordinal:        ordinal,
	}
}
