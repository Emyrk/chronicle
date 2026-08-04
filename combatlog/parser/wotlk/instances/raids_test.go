package instances

import (
	"context"
	"log/slog"
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/Emyrk/chronicle/combatlog/parser/common/parsectx"
	"github.com/Emyrk/chronicle/combatlog/parser/common/unitdb"
	"github.com/Emyrk/chronicle/combatlog/parser/types/zone"
	"github.com/Emyrk/chronicle/database"
)

func TestOnyxiaZoneName(t *testing.T) {
	t.Parallel()

	azerothcoreClient := parsectx.WithType(context.Background(), database.LogTypeAzerothcoreClientside)
	azerothcoreFlavor := database.WoWFlavor{database.FlavorWrath, database.FlavorAzerothcore}

	tests := []struct {
		name   string
		ctx    context.Context
		flavor database.WoWFlavor
		zone   zone.Zone
		want   string
	}{
		{
			name:   "level 60 raid without size metadata",
			ctx:    azerothcoreClient,
			flavor: azerothcoreFlavor,
			zone: zone.Zone{
				Name:            "onyxia's lair",
				InstanceType:    "raid",
				DifficultyIndex: 3,
			},
			want: "Onyxia Classic",
		},
		{
			name:   "level 80 10 player raid",
			ctx:    azerothcoreClient,
			flavor: azerothcoreFlavor,
			zone: zone.Zone{
				Name:            "onyxia's lair",
				InstanceType:    "raid",
				DifficultyIndex: 1,
				DifficultyName:  "10 Player",
				MaxPlayers:      10,
			},
			want: "Onyxia's Lair",
		},
		{
			name:   "level 80 25 player raid",
			ctx:    azerothcoreClient,
			flavor: azerothcoreFlavor,
			zone: zone.Zone{
				Name:            "onyxia's lair",
				InstanceType:    "raid",
				DifficultyIndex: 2,
				DifficultyName:  "25 Player",
				MaxPlayers:      25,
			},
			want: "Onyxia's Lair",
		},
		{
			name:   "server-side AzerothCore without companion metadata",
			ctx:    parsectx.WithType(context.Background(), database.LogTypeAzerothcore),
			flavor: azerothcoreFlavor,
			zone: zone.Zone{
				Name:         "Onyxia's Lair",
				MapID:        249,
				InstanceType: "raid",
			},
			want: "Onyxia's Lair",
		},
		{
			name:   "non-AzerothCore WotLK",
			ctx:    parsectx.WithType(context.Background(), database.LogTypeWarmane),
			flavor: database.WoWFlavor{database.FlavorWrath},
			zone: zone.Zone{
				Name:         "onyxia's lair",
				InstanceType: "raid",
			},
			want: "Onyxia's Lair",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			instance := OnyxiaFactory.New(tt.ctx, slog.Default(), unitdb.New(), tt.zone, tt.flavor)
			require.Equal(t, tt.want, instance.Name())
		})
	}
}
