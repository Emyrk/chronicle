package db2sdk

import (
	"testing"

	"github.com/Emyrk/chronicle/combatlog/parser/common/vehicles"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/database"
	"github.com/stretchr/testify/require"
)

func TestUser(t *testing.T) {
	t.Parallel()

	user := database.ChronicleUser{
		Username: "User",
		Email:    "user@example.com",
	}

	t.Run("chronicle user", func(t *testing.T) {
		t.Parallel()

		converted := User(user, []string{"user"})
		require.Empty(t, converted.DiscordID)
	})

	t.Run("admin list row", func(t *testing.T) {
		t.Parallel()

		converted := User(database.ListAllUsersRow{
			ChronicleUser: user,
			DiscordID:     "123456789",
		}, []string{"user"})
		require.Equal(t, "123456789", converted.DiscordID)
	})
}

func TestVehicleControlMetadata(t *testing.T) {
	t.Parallel()

	releasedAt := int64(2000)
	activeController := guid.GUID(0x000000000000000C)
	converted := VehicleControlMetadata(vehicles.Metadata{
		Intervals: []vehicles.ControlInterval{{
			SessionID:       "session",
			VehicleGUID:     guid.GUID(0xF15000812400008F),
			ControllerGUID:  guid.GUID(0x000000000000000B),
			AssignedAtMs:    1000,
			ReleasedAtMs:    &releasedAt,
			AssignedOrdinal: 3,
			ReleaseReason:   vehicles.ReleaseReasonExplicit,
		}},
		Diagnostics: []vehicles.Diagnostic{{
			Kind:                 vehicles.DiagnosticStaleRelease,
			TimestampMs:          1500,
			VehicleGUID:          guid.GUID(0xF15000812400008F),
			ControllerGUID:       guid.GUID(0x000000000000000B),
			ActiveControllerGUID: &activeController,
		}},
	})

	require.Len(t, converted.Intervals, 1)
	require.Equal(t, "explicit", converted.Intervals[0].ReleaseReason)
	require.Equal(t, releasedAt, *converted.Intervals[0].ReleasedAtMs)
	require.Len(t, converted.Diagnostics, 1)
	require.Equal(t, "stale_release", converted.Diagnostics[0].Kind)
	require.Equal(t, activeController, *converted.Diagnostics[0].ActiveControllerGUID)
}
