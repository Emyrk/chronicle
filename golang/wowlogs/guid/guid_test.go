package guid

import (
	"testing"

	"github.com/stretchr/testify/require"
)

func TestGUID(t *testing.T) {
	tests := []struct {
		name          string
		guid          GUID
		isPlayer      bool
		isVehicle     bool
		isPet         bool
		isCreature    bool
		isAnyCreature bool
		isUnit        bool
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
