package db2sdk

import (
	"testing"

	"github.com/Emyrk/chronicle/combatlog/parser/common/vehicles"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/database"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/stretchr/testify/require"
)

func TestPositionCoordinateSpace(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name   string
		format database.NullLogFormat
		want   string
	}{
		{name: "missing", want: ""},
		{name: "TBC companion", format: database.NullLogFormat{LogFormat: database.LogFormat243CcAddon, Valid: true}, want: "ui-map-normalized"},
		{name: "Wrath companion", format: database.NullLogFormat{LogFormat: database.LogFormat335aCcAddon, Valid: true}, want: "ui-map-normalized"},
		{name: "world positions", format: database.NullLogFormat{LogFormat: database.LogFormatAzerothcoreMod, Valid: true}, want: "world"},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			t.Parallel()
			require.Equal(t, test.want, string(positionCoordinateSpace(test.format)))
		})
	}
}

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

func TestWoWLogGroupRowIncludesOwnerName(t *testing.T) {
	t.Parallel()

	converted := WoWLogGroupRow(database.GetWoWLogGroupByIDRow{
		OwnerName: "LogUploader",
	})

	require.Equal(t, "LogUploader", converted.OwnerName)
}

func TestWoWEncounterIncludesMapID(t *testing.T) {
	t.Parallel()

	require.Equal(t, 43, WoWEncounter(database.LogInstanceEncounter{MapID: 43}).MapID)
}

func TestWoWEncounterRankingWindow(t *testing.T) {
	t.Parallel()
	require.Nil(t, WoWEncounter(database.LogInstanceEncounter{}).RankingWindow)
	converted := WoWEncounter(database.LogInstanceEncounter{
		RankingStartOffsetMs: pgtype.Int8{Int64: 10000, Valid: true},
		RankingEndOffsetMs:   pgtype.Int8{Int64: 70000, Valid: true},
	})
	require.NotNil(t, converted.RankingWindow)
	require.Equal(t, "selected-unit-activity", converted.RankingWindow.Basis)
	require.Equal(t, int64(10000), converted.RankingWindow.StartOffsetMs)
	require.Equal(t, int64(70000), converted.RankingWindow.EndOffsetMs)
	require.Equal(t, int64(60000), converted.RankingWindow.DurationMs)
}

func TestInstanceUnitsCompactsNamesAndOwners(t *testing.T) {
	t.Parallel()

	owner := guid.GUID(0x0000000000000001)
	firstTotem := guid.GUID(0xF130001D00000002)
	secondTotem := guid.GUID(0xF130001D00000001)
	boss := guid.GUID(0xF13000007B000001)
	conflictA := guid.GUID(0xF130000009000001)
	conflictB := guid.GUID(0xF130000009000002)

	converted, namesByEntry, summonsByOwner := InstanceUnits([]database.LogInstanceUnit{
		{UnitGuid: firstTotem, Name: "Fire Resistance Totem", Entry: 7424, OwnerGuid: &owner},
		{UnitGuid: secondTotem, Name: "Fire Resistance Totem", Entry: 7424, OwnerGuid: &owner},
		{UnitGuid: boss, Name: "Boss", Entry: 123},
		{UnitGuid: conflictA, Name: "First Name", Entry: 9},
		{UnitGuid: conflictB, Name: "Second Name", Entry: 9},
	})

	require.Equal(t, map[uint32]string{7424: "Fire Resistance Totem"}, namesByEntry)
	require.Empty(t, converted[firstTotem].Name)
	require.Empty(t, converted[secondTotem].Name)
	require.Equal(t, "Boss", converted[boss].Name)
	require.Equal(t, "First Name", converted[conflictA].Name)
	require.Equal(t, "Second Name", converted[conflictB].Name)
	require.Nil(t, converted[firstTotem].Owner)
	require.Equal(t, []guid.GUID{secondTotem, firstTotem}, summonsByOwner[owner])
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
