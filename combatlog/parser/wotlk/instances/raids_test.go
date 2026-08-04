package instances

import (
	"context"
	"log/slog"
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/Emyrk/chronicle/combatlog/parser/common/encounter"
	"github.com/Emyrk/chronicle/combatlog/parser/common/parsectx"
	"github.com/Emyrk/chronicle/combatlog/parser/common/unitdb"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/types/zone"
	"github.com/Emyrk/chronicle/database"
)

func TestOnyxiaZoneName(t *testing.T) {
	t.Parallel()

	azerothcoreClient := parsectx.WithType(context.Background(), database.LogTypeAzerothcoreClientside)
	azerothcoreFlavor := database.WoWFlavor{database.FlavorWrath, database.FlavorAzerothcore}
	progressionFlavor := database.WoWFlavor{
		database.FlavorWrath,
		database.FlavorAzerothcore,
		database.FlavorAzerothcoreProgression,
	}

	tests := []struct {
		name   string
		ctx    context.Context
		flavor database.WoWFlavor
		zone   zone.Zone
		want   string
	}{
		{
			name:   "progression level 60 raid without size metadata",
			ctx:    azerothcoreClient,
			flavor: progressionFlavor,
			zone: zone.Zone{
				Name:            "onyxia's lair",
				InstanceType:    "raid",
				DifficultyIndex: 3,
			},
			want: "Onyxia Classic",
		},
		{
			name:   "progression level 80 10 player raid",
			ctx:    azerothcoreClient,
			flavor: progressionFlavor,
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
			name:   "progression level 80 25 player raid",
			ctx:    azerothcoreClient,
			flavor: progressionFlavor,
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
			name:   "standard AzerothCore level 60 metadata remains unchanged",
			ctx:    azerothcoreClient,
			flavor: azerothcoreFlavor,
			zone: zone.Zone{
				Name:            "onyxia's lair",
				InstanceType:    "raid",
				DifficultyIndex: 3,
			},
			want: "Onyxia's Lair",
		},
		{
			name:   "progression server-side log without companion metadata",
			ctx:    parsectx.WithType(context.Background(), database.LogTypeAzerothcore),
			flavor: progressionFlavor,
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

func TestOnyxiaDerivedName(t *testing.T) {
	t.Parallel()

	progressionFlavor := database.WoWFlavor{
		database.FlavorWrath,
		database.FlavorAzerothcore,
		database.FlavorAzerothcoreProgression,
	}

	for _, tt := range []struct {
		name  string
		entry uint32
		want  string
	}{
		{name: "classic boss", entry: 301000, want: "Onyxia Classic"},
		{name: "classic whelp", entry: 301001, want: "Onyxia Classic"},
		{name: "classic warder", entry: 301002, want: "Onyxia Classic"},
		{name: "wrath boss", entry: 10184, want: "Onyxia's Lair"},
	} {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			gid := creatureGUID(tt.entry)
			resolver := onyxiaDerivedName(progressionFlavor)
			got, ok := resolver.Name([]encounter.Fight{{
				Hostiles: map[guid.GUID]encounter.CharacterFight{
					gid: {ID: gid},
				},
			}})
			require.True(t, ok)
			require.Equal(t, tt.want, got)
		})
	}

	require.Nil(t, onyxiaDerivedName(database.WoWFlavor{database.FlavorWrath, database.FlavorAzerothcore}))
}

func creatureGUID(entry uint32) guid.GUID {
	return guid.GUID(0xF130000000000001 | uint64(entry)<<24)
}
