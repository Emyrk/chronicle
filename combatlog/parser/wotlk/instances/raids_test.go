package instances

import (
	"context"
	"log/slog"
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	"github.com/Emyrk/chronicle/combatlog/parser/common/encounter"
	commoninstances "github.com/Emyrk/chronicle/combatlog/parser/common/instances"
	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/common/parsectx"
	"github.com/Emyrk/chronicle/combatlog/parser/common/unitdb"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/types"
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

func TestOnyxiaHostilesFlavor(t *testing.T) {
	t.Parallel()

	standard := commoninstances.OnyxiaHostiles(database.WoWFlavor{database.FlavorWrath}).HostileEntries()
	_, ok := standard[49018]
	require.False(t, ok)

	nightmare := commoninstances.OnyxiaHostiles(database.WoWFlavor{database.FlavorNightmareOfUrsol}).HostileEntries()
	axelus, ok := nightmare[49018]
	require.True(t, ok)
	require.Equal(t, "Broodcommander Axelus", axelus.Name)
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

func TestUlduarThorimEncounterPhases(t *testing.T) {
	t.Parallel()

	ctx := parsectx.With(context.Background(), parsectx.Context{
		Flavor: database.WoWFlavor{database.FlavorWrath},
	})
	instance := UlduarFactory.New(
		ctx,
		slog.Default(),
		unitdb.New(),
		zone.Zone{Name: "Ulduar", MapID: 603},
		database.WoWFlavor{database.FlavorWrath},
	)
	player := guid.GUID(1)
	soldier := creatureGUID(32883)
	thorim := creatureGUID(32865)
	start := time.Date(2026, time.August, 28, 12, 0, 0, 0, time.UTC)

	require.NoError(t, instance.Process(&messages.Damage{
		MessageBase: messages.Base(start),
		Caster:      &player,
		Target:      soldier,
		Amount:      1,
		HitType:     types.HitTypeHit,
	}))
	require.NoError(t, instance.Process(&messages.Damage{
		MessageBase: messages.Base(start.Add(time.Second)),
		Caster:      &thorim,
		Target:      player,
		Amount:      1,
		HitType:     types.HitTypeHit,
	}))
	require.NoError(t, instance.Process(&messages.Slain{
		MessageBase: messages.Base(start.Add(10 * time.Second)),
		Victim:      soldier,
	}))
	require.NoError(t, instance.Process(&messages.Damage{
		MessageBase: messages.Base(start.Add(70 * time.Second)),
		Caster:      &player,
		Target:      thorim,
		Amount:      1,
		HitType:     types.HitTypeHit,
	}))
	require.NoError(t, instance.Process(&messages.Damage{
		MessageBase: messages.Base(start.Add(80 * time.Second)),
		Caster:      &player,
		Target:      thorim,
		Amount:      951,
		Overkill:    939,
		HitType:     types.HitTypePeriodic,
	}))

	result, err := instance.Finalize(context.Background())
	require.NoError(t, err)
	require.Len(t, result.Encounters, 1)

	got := result.Encounters[0]
	require.Equal(t, "Thorim", got.Name)
	require.True(t, got.Boss)
	require.Equal(t, encounter.KillTypeClean, got.KillType)
	require.Len(t, got.Phases, 2)
	require.Equal(t, "thorim_p1", got.Phases[0].Key)
	require.Equal(t, int64(0), got.Phases[0].StartOffsetMs)
	require.Equal(t, int64(70_000), got.Phases[0].EndOffsetMs)
	require.Equal(t, "thorim_p2", got.Phases[1].Key)
	require.Equal(t, int64(70_000), got.Phases[1].StartOffsetMs)
	require.Equal(t, int64(80_000), got.Phases[1].EndOffsetMs)
}

func TestUlduarThorimEncounterIdentities(t *testing.T) {
	t.Parallel()

	hostiles := UlduarHostiles()
	fight := encounter.Fight{}

	thorim, ok := hostiles[32865]
	require.True(t, ok)
	require.True(t, thorim.Boss)
	require.Equal(t, "Thorim", thorim.EncounterName)

	for _, entry := range []uint32{
		32872, 32873, 32874, 32875,
		32876, 32877, 32878,
		32882, 32883, 32885, 32886,
		32904, 32907, 32908,
		33110, 33138, 33196, 33378,
	} {
		identity, ok := hostiles[entry]
		require.True(t, ok, "entry %d must be registered", entry)
		require.False(t, identity.Boss, "entry %d must not be a separate boss", entry)
		require.NotNil(t, identity.EncounterNameFn)

		result := identity.EncounterNameFn(fight)
		require.NotNil(t, result)
		require.Equal(t, "Thorim", result.EncounterName)
		require.Equal(t, []uint32{32865}, result.Bosses)
	}

	keeper, ok := hostiles[33413]
	require.True(t, ok)
	require.Equal(t, "Thorim", keeper.Name)
	require.False(t, keeper.Boss)
	require.Nil(t, keeper.EncounterNameFn)
}

func TestUlduarYoggSaronEncounterPhases(t *testing.T) {
	t.Parallel()

	ctx := parsectx.With(context.Background(), parsectx.Context{
		Flavor: database.WoWFlavor{database.FlavorWrath},
	})
	instance := UlduarFactory.New(
		ctx,
		slog.Default(),
		unitdb.New(),
		zone.Zone{Name: "Ulduar", MapID: 603},
		database.WoWFlavor{database.FlavorWrath},
	)
	player := guid.GUID(1)
	guardian := creatureGUID(33136)
	sara := creatureGUID(33134)
	brain := creatureGUID(33890)
	tentacle := creatureGUID(33966)
	yogg := guid.GUID(0xF150000000000001 | uint64(33288)<<24)
	immortal := creatureGUID(33988)
	start := time.Date(2026, time.August, 26, 12, 0, 0, 0, time.UTC)

	processDamage := func(at time.Duration, target guid.GUID, hitType types.HitType) {
		t.Helper()
		require.NoError(t, instance.Process(&messages.Damage{
			MessageBase: messages.Base(start.Add(at)),
			Caster:      &player,
			Target:      target,
			Amount:      1,
			HitType:     hitType,
		}))
	}

	processDamage(0, guardian, types.HitTypeHit)
	processDamage(time.Second, sara, types.HitTypeHit)
	require.NoError(t, instance.Process(&messages.Slain{
		MessageBase: messages.Base(start.Add(2 * time.Second)),
		Victim:      guardian,
	}))
	processDamage(70*time.Second, tentacle, types.HitTypeHit)
	processDamage(75*time.Second, brain, types.HitTypeHit)
	processDamage(80*time.Second, yogg, types.HitTypeImmune)
	processDamage(90*time.Second, yogg, types.HitTypeHit)
	processDamage(100*time.Second, immortal, types.HitTypeHit)
	require.NoError(t, instance.Process(&messages.Slain{
		MessageBase: messages.Base(start.Add(110 * time.Second)),
		Victim:      yogg,
	}))

	result, err := instance.Finalize(context.Background())
	require.NoError(t, err)
	require.Len(t, result.Encounters, 1)

	got := result.Encounters[0]
	require.Equal(t, "Yogg-Saron", got.Name)
	require.True(t, got.Boss)
	require.Equal(t, encounter.KillTypeClean, got.KillType)
	require.Len(t, got.Phases, 3)
	require.Equal(t, "yogg_saron_p1", got.Phases[0].Key)
	require.Equal(t, int64(0), got.Phases[0].StartOffsetMs)
	require.Equal(t, int64(70_000), got.Phases[0].EndOffsetMs)
	require.Equal(t, "yogg_saron_p2", got.Phases[1].Key)
	require.Equal(t, int64(70_000), got.Phases[1].StartOffsetMs)
	require.Equal(t, int64(90_000), got.Phases[1].EndOffsetMs)
	require.Equal(t, "yogg_saron_p3", got.Phases[2].Key)
	require.Equal(t, int64(90_000), got.Phases[2].StartOffsetMs)
	require.Equal(t, int64(110_000), got.Phases[2].EndOffsetMs)
}

func TestUlduarYoggSaronEncounterIdentities(t *testing.T) {
	t.Parallel()

	hostiles := UlduarHostiles()
	fight := encounter.Fight{}

	yogg, ok := hostiles[33288]
	require.True(t, ok)
	require.True(t, yogg.Boss)
	require.Equal(t, "Yogg-Saron", yogg.EncounterName)

	for _, entry := range []uint32{33134, 34332, 33890} {
		identity, ok := hostiles[entry]
		require.True(t, ok)
		require.True(t, identity.Boss, "entry %d must be an encounter anchor", entry)
		require.Equal(t, "Yogg-Saron", identity.EncounterName)
	}

	for _, entry := range []uint32{
		33136,                      // Guardian of Yogg-Saron
		33943, 33966, 33983, 33985, // Phase-two tentacles
		33433, 33567, 33716, 33717, 33718, 33719, 33720, // Illusion forms
		33988, // Immortal Guardian
	} {
		identity, ok := hostiles[entry]
		require.True(t, ok, "entry %d must be registered", entry)
		require.False(t, identity.Boss, "entry %d must not be a separate boss", entry)
		require.NotNil(t, identity.EncounterNameFn)

		result := identity.EncounterNameFn(fight)
		require.NotNil(t, result)
		require.Equal(t, "Yogg-Saron", result.EncounterName)
		require.Equal(t, []uint32{33288}, result.Bosses)
	}
}

func creatureGUID(entry uint32) guid.GUID {
	return guid.GUID(0xF130000000000001 | uint64(entry)<<24)
}
