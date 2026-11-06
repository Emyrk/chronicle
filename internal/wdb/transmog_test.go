package wdb

import (
	"testing"

	"github.com/Emyrk/chronicle/database"
)

func TestIsLikelySyntheticTransmog(t *testing.T) {
	t.Parallel()

	base := database.WorldItemTemplate{
		Entry:         3346,
		Name:          "Monster - Item, Shovel",
		Class:         2,
		Subclass:      14,
		DisplayID:     743,
		Quality:       1,
		InventoryType: 17,
		Bonding:       0,
		Delay:         2000,
		DmgMin1:       1,
		DmgMax1:       2,
	}

	tests := []struct {
		name      string
		observed  database.WorldItemTemplate
		candidate database.WorldItemTemplate
		want      bool
	}{
		{
			name: "high ID clone with transmog display and binding",
			observed: func() database.WorldItemTemplate {
				item := base
				item.Entry = 103346
				item.DisplayID = 12345
				item.Bonding = 1
				return item
			}(),
			candidate: base,
			want:      true,
		},
		{
			name: "low observed ID is ignored",
			observed: func() database.WorldItemTemplate {
				item := base
				item.Entry = 99999
				item.DisplayID = 12345
				item.Bonding = 1
				return item
			}(),
			candidate: base,
		},
		{
			name: "different gameplay field is not a clone",
			observed: func() database.WorldItemTemplate {
				item := base
				item.Entry = 103346
				item.DisplayID = 12345
				item.Bonding = 1
				item.Delay++
				return item
			}(),
			candidate: base,
		},
		{
			name: "same high ID shape without BOP is not synthetic",
			observed: func() database.WorldItemTemplate {
				item := base
				item.Entry = 103346
				item.DisplayID = 12345
				return item
			}(),
			candidate: base,
		},
		{
			name: "different name is not a collision",
			observed: func() database.WorldItemTemplate {
				item := base
				item.Entry = 103346
				item.Name = "Custom Shovel"
				item.DisplayID = 12345
				item.Bonding = 1
				return item
			}(),
			candidate: base,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			if got := IsLikelySyntheticTransmog(tt.observed, tt.candidate); got != tt.want {
				t.Fatalf("IsLikelySyntheticTransmog() = %t, want %t", got, tt.want)
			}
		})
	}
}
