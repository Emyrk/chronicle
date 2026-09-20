package guid_test

import (
	"encoding/json"
	"testing"

	"github.com/Emyrk/chronicle/combatlog/parser/guid"
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
		isObject      bool
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
			name:     "Object lava bomb",
			guid:     0xF11002B6284CB931,
			isObject: true,
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
		{
			name:          "Magma totem",
			guid:          0xF130001D29279306,
			isPlayer:      false,
			isVehicle:     false,
			isPet:         false,
			isCreature:    true,
			isAnyCreature: true,
			isUnit:        true,
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
			require.Equal(t, tt.isObject, tt.guid.IsObject(), "object")
		})
	}
}

func TestAsVehicle(t *testing.T) {
	t.Parallel()

	poolOfTar := guid.GUID(0xF1300081420007AD)
	vehicle := poolOfTar.AsVehicle()

	require.Equal(t, "0xF1500081420007AD", vehicle.String())
	require.True(t, vehicle.IsVehicle())
	entry, ok := vehicle.GetEntry()
	require.True(t, ok)
	require.Equal(t, uint32(33090), entry)
}

func TestGUIDJSON(t *testing.T) {
	t.Parallel()

	type TestStruct struct {
		ID guid.GUID `json:"id"`
	}

	testValue := TestStruct{
		ID: guid.GUID(0xF130000CE0000D3F),
	}

	jsonData, err := json.Marshal(testValue)
	require.NoError(t, err)
	require.JSONEq(t, `{"id":"0xF130000CE0000D3F"}`, string(jsonData))
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
