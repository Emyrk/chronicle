package guid_test

import (
	"testing"

	"github.com/Emyrk/chronicle/golang/wowlogs/guid"
	"github.com/stretchr/testify/require"
)

func TestGUIDMarshalJSON(t *testing.T) {
	t.Parallel()

	for _, tc := range []string{
		`"0x00000000000F1A35"`,
		`"0xF13000ED2E2738EF"`,
		`"0xF14008449300903A"`,
	} {
		t.Run(tc, func(t *testing.T) {
			t.Parallel()

			var id guid.GUID
			err := id.UnmarshalJSON([]byte(tc))
			require.NoError(t, err)

			data, err := id.MarshalJSON()
			require.NoError(t, err)

			// Check that the marshaled data matches the original string
			require.Equal(t, tc, string(data))
		})
	}
}

func TestGUID(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name          string
		guid          guid.GUID
		isPlayer      bool
		isVehicle     bool
		isPet         bool
		isCreature    bool
		isAnyCreature bool
		isUnit        bool
		// TODO: Entry
	}{
		{
			name:     "player Doyd",
			guid:     0x000000000001C7AC,
			isPlayer: true,
			isUnit:   true,
		},
		{
			name:          "npc",
			guid:          0xF130000CE0000D3F,
			isPlayer:      false,
			isUnit:        true,
			isCreature:    true,
			isAnyCreature: true,
		},
		{
			name:          "npc_org_battlemaster",
			guid:          0xF130013C3B271480,
			isPlayer:      false,
			isUnit:        true,
			isCreature:    true,
			isAnyCreature: true,
		},
		{
			name:     "player",
			guid:     0x00000000000F1A35,
			isPlayer: true,
			isUnit:   true,
		},
		{
			name:          "maldrissa_imp",
			guid:          0xF14008449300903A,
			isPlayer:      false,
			isUnit:        true,
			isPet:         true,
			isAnyCreature: true,
		},
		{
			name:     "maldrissa",
			guid:     0x00000000000EB167,
			isPlayer: true,
			isUnit:   true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			require.Equal(t, tt.isPlayer, tt.guid.IsPlayer(), "player")
			require.Equal(t, tt.isVehicle, tt.guid.IsVehicle(), "vehicle")
			require.Equal(t, tt.isPet, tt.guid.IsPet(), "pet")
			require.Equal(t, tt.isCreature, tt.guid.IsCreature(), "creature")
			require.Equal(t, tt.isAnyCreature, tt.guid.IsAnyCreature(), "any creature")
			require.Equal(t, tt.isUnit, tt.guid.IsUnit(), "unit")
		})
	}
}

func TestFromString(t *testing.T) {
	t.Parallel()

	guidStr := "0xF130000CE0000D3F"
	expectedGUID := guid.GUID(0xF130000CE0000D3F)

	guid, err := guid.FromString(guidStr)
	require.NoError(t, err)
	require.Equal(t, expectedGUID, guid)
	require.Equal(t, expectedGUID.String(), guidStr)
}
