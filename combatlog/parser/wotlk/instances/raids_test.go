package instances

import (
	"context"
	"fmt"
	"log/slog"
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	"github.com/Emyrk/chronicle/combatlog/parser/common/characters/period"
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

func TestUlduarNonBossMechanicIdentities(t *testing.T) {
	t.Parallel()

	hostiles := UlduarHostiles()

	cannon, ok := hostiles[33264]
	require.True(t, ok)
	require.Equal(t, "Ironwork Cannon", cannon.Name)
	require.Equal(t, types.AffiliationHostile, cannon.Affiliation)
	require.False(t, cannon.Boss)
	require.Empty(t, cannon.EncounterName)

	for _, entry := range []uint32{33241, 33242, 33244} {
		keeper, ok := hostiles[entry]
		require.True(t, ok)
		require.Equal(t, types.AffiliationFriendly, keeper.Affiliation)
		require.False(t, keeper.Boss)
		require.Empty(t, keeper.EncounterName)
	}
}

func TestUlduarRazorscaleFriendlyHelpersDoNotExtendEncounter(t *testing.T) {
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
	defender := creatureGUID(33816)
	razorscale := creatureGUID(33186)
	start := time.Date(2026, time.August, 28, 12, 0, 0, 0, time.UTC)

	// Expedition Defenders actively fight Razorscale's adds. Their activity is
	// friendly and must not start the encounter before Razorscale participates.
	require.NoError(t, instance.Process(&messages.Damage{
		MessageBase: messages.Base(start),
		Caster:      &defender,
		Target:      player,
		Amount:      1,
		HitType:     types.HitTypeHit,
	}))
	require.NoError(t, instance.Process(&messages.Damage{
		MessageBase: messages.Base(start.Add(20 * time.Second)),
		Caster:      &razorscale,
		Target:      player,
		Amount:      1,
		HitType:     types.HitTypeHit,
	}))
	require.NoError(t, instance.Process(&messages.Slain{
		MessageBase: messages.Base(start.Add(60 * time.Second)),
		Victim:      razorscale,
		Killer:      &player,
	}))

	result, err := instance.Finalize(context.Background())
	require.NoError(t, err)
	require.Len(t, result.Encounters, 1)

	got := result.Encounters[0]
	require.Equal(t, "Razorscale", got.Name)
	require.True(t, got.Boss)
	require.Equal(t, encounter.KillTypeClean, got.KillType)
	require.Equal(t, 40*time.Second, got.Combat.End.Sub(got.Combat.Start))
	require.Len(t, got.Combat.Hostiles, 1)
	require.Contains(t, got.Combat.Hostiles, razorscale)
}

func TestUlduarRazorscaleIdentities(t *testing.T) {
	t.Parallel()

	hostiles := UlduarHostiles()
	for _, entry := range []uint32{33186, 33724} {
		razorscale, ok := hostiles[entry]
		require.True(t, ok)
		require.Equal(t, "Razorscale", razorscale.Name)
		require.True(t, razorscale.Boss)
		require.Equal(t, "Razorscale", razorscale.EncounterName)
	}

	for _, entry := range []uint32{33210, 33259, 33282, 33287, 33816} {
		identity, ok := hostiles[entry]
		require.True(t, ok, "entry %d must be registered", entry)
		require.Equal(t, types.AffiliationFriendly, identity.Affiliation)
		require.False(t, identity.Boss)
		require.Empty(t, identity.EncounterName)
		require.Nil(t, identity.EncounterNameFn)
	}
}

func TestUlduarHodirScriptedDefeat(t *testing.T) {
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
	players := []guid.GUID{1, 2, 3}
	hodir := creatureGUID(32845)
	start := time.Date(2026, time.August, 28, 12, 0, 0, 0, time.UTC)

	for offset, player := range players {
		require.NoError(t, instance.Process(&messages.Damage{
			MessageBase: messages.Base(start.Add(time.Duration(offset) * time.Millisecond)),
			Caster:      &player,
			Target:      hodir,
			Amount:      1,
			HitType:     types.HitTypeHit,
		}))
	}
	require.NoError(t, instance.Process(&messages.Damage{
		MessageBase: messages.Base(start.Add(10 * time.Second)),
		Caster:      &players[0],
		Target:      hodir,
		Amount:      5513,
		HitType:     types.HitTypeHit,
	}))
	for i, spellName := range []string{
		"Faerie Fire", "Shadow Mastery", "Judgement of Light", "Heart of the Crusader",
		"Vindication", "Holy Vengeance", "Deep Wounds", "Ignite",
	} {
		require.NoError(t, instance.Process(&messages.Aura{
			MessageBase: messages.Base(start.Add(10*time.Second + 50*time.Millisecond + time.Duration(i)*time.Millisecond)),
			Target:      hodir,
			SpellName:   spellName,
			State:       types.AuraStateRemoved,
		}))
	}

	result, err := instance.Finalize(context.Background())
	require.NoError(t, err)
	require.Len(t, result.Encounters, 1)

	got := result.Encounters[0]
	require.Equal(t, "Hodir", got.Name)
	require.True(t, got.Boss)
	require.Equal(t, encounter.KillTypeClean, got.KillType)
	require.Equal(t, 10*time.Second+57*time.Millisecond, got.Combat.End.Sub(got.Combat.Start))
}

func TestUlduarHodirIdentities(t *testing.T) {
	t.Parallel()

	hostiles := UlduarHostiles()
	for _, entry := range []uint32{32845, 32846} {
		hodir, ok := hostiles[entry]
		require.True(t, ok)
		require.Equal(t, "Hodir", hodir.Name)
		require.True(t, hodir.Boss)
		require.Equal(t, "Hodir", hodir.EncounterName)
	}

	for _, entry := range []uint32{
		32893, 32897, 32900, 32901,
		32941, 32946, 32948, 32950,
		33213,
		33325, 33326, 33327, 33328,
		33330, 33331, 33332, 33333,
		33411,
	} {
		identity, ok := hostiles[entry]
		require.True(t, ok, "entry %d must be registered", entry)
		require.Equal(t, types.AffiliationFriendly, identity.Affiliation)
		require.False(t, identity.Boss)
		require.Empty(t, identity.EncounterName)
		require.Nil(t, identity.EncounterNameFn)
	}
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
	guard := creatureGUID(32874)
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
		MessageBase: messages.Base(start.Add(30 * time.Second)),
		Caster:      &player,
		Target:      guard,
		Amount:      1,
		HitType:     types.HitTypeHit,
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
	require.Len(t, got.Phases, 3)
	require.Equal(t, "thorim_p1", got.Phases[0].Key)
	require.Equal(t, int64(0), got.Phases[0].StartOffsetMs)
	require.Equal(t, int64(30_000), got.Phases[0].EndOffsetMs)
	require.Equal(t, "thorim_p2", got.Phases[1].Key)
	require.Equal(t, int64(30_000), got.Phases[1].StartOffsetMs)
	require.Equal(t, int64(70_000), got.Phases[1].EndOffsetMs)
	require.Equal(t, "thorim_p3", got.Phases[2].Key)
	require.Equal(t, int64(70_000), got.Phases[2].StartOffsetMs)
	require.Equal(t, int64(80_000), got.Phases[2].EndOffsetMs)
}

func TestUlduarThorimEncounterIdentities(t *testing.T) {
	t.Parallel()

	hostiles := UlduarHostiles()
	thorimGUID := creatureGUID(32865)
	fight := encounter.Fight{
		Hostiles: map[guid.GUID]encounter.CharacterFight{
			thorimGUID: {ID: thorimGUID},
		},
	}

	thorim, ok := hostiles[32865]
	require.True(t, ok)
	require.True(t, thorim.Boss)
	require.Equal(t, "Thorim", thorim.EncounterName)

	for _, entry := range []uint32{
		32872, 32873, 32874, 32875,
		32876, 32877, 32878,
		32882, 32883, 32885, 32886, 32892,
		32904, 32907, 32908, 33054,
		33110, 33138, 33378, 33725,
	} {
		identity, ok := hostiles[entry]
		require.True(t, ok, "entry %d must be registered", entry)
		require.False(t, identity.Boss, "entry %d must not be a separate boss", entry)
		require.NotNil(t, identity.EncounterNameFn)

		result := identity.EncounterNameFn(fight)
		require.NotNil(t, result)
		require.Equal(t, "Thorim", result.EncounterName)
		require.Equal(t, []uint32{32865}, result.Bosses)
		require.Nil(t, identity.EncounterNameFn(encounter.Fight{}))
	}

	sif, ok := hostiles[33196]
	require.True(t, ok)
	require.Equal(t, "Sif", sif.Name)
	require.Equal(t, types.AffiliationFriendly, sif.Affiliation)
	require.False(t, sif.Boss)
	require.Nil(t, sif.EncounterNameFn)

	keeper, ok := hostiles[33413]
	require.True(t, ok)
	require.Equal(t, "Thorim", keeper.Name)
	require.False(t, keeper.Boss)
	require.Nil(t, keeper.EncounterNameFn)
}

func TestUlduarMimironEncounterPhases(t *testing.T) {
	t.Parallel()

	instance := newUlduarTestInstance(t)
	player := guid.GUID(1)
	leviathan := creatureGUID(33432)
	vx001 := creatureGUID(33651)
	aerial := creatureGUID(33670)
	start := time.Date(2026, time.August, 28, 12, 0, 0, 0, time.UTC)

	processDamage := func(at time.Duration, target guid.GUID) {
		t.Helper()
		hit := damageEvent(player, target, 1)
		hit.MessageBase = messages.Base(start.Add(at))
		require.NoError(t, instance.Process(hit))
	}
	processSlain := func(at time.Duration, target guid.GUID) {
		t.Helper()
		require.NoError(t, instance.Process(&messages.Slain{
			MessageBase: messages.Base(start.Add(at)),
			Victim:      target,
			Killer:      &player,
		}))
	}

	processDamage(0, leviathan)
	processSlain(10*time.Second, leviathan)
	processDamage(20*time.Second, vx001)
	processSlain(30*time.Second, vx001)
	processDamage(40*time.Second, aerial)
	processSlain(50*time.Second, aerial)
	processDamage(60*time.Second, leviathan)
	processDamage(61*time.Second, vx001)
	processDamage(62*time.Second, aerial)
	processSlain(70*time.Second, leviathan)
	processSlain(71*time.Second, vx001)
	processSlain(72*time.Second, aerial)

	result, err := instance.Finalize(t.Context())
	require.NoError(t, err)
	require.Len(t, result.Encounters, 1)

	got := result.Encounters[0]
	require.Equal(t, "Mimiron", got.Name)
	require.True(t, got.Boss)
	require.Equal(t, encounter.KillTypeClean, got.KillType)
	require.Len(t, got.Combat.Hostiles, 3)
	require.Len(t, got.Phases, 4)
	require.Equal(t, "mimiron_p1", got.Phases[0].Key)
	require.Equal(t, int64(0), got.Phases[0].StartOffsetMs)
	require.Equal(t, int64(20_000), got.Phases[0].EndOffsetMs)
	require.Equal(t, "mimiron_p2", got.Phases[1].Key)
	require.Equal(t, int64(20_000), got.Phases[1].StartOffsetMs)
	require.Equal(t, int64(40_000), got.Phases[1].EndOffsetMs)
	require.Equal(t, "mimiron_p3", got.Phases[2].Key)
	require.Equal(t, int64(40_000), got.Phases[2].StartOffsetMs)
	require.Equal(t, int64(60_000), got.Phases[2].EndOffsetMs)
	require.Equal(t, "mimiron_p4", got.Phases[3].Key)
	require.Equal(t, int64(60_000), got.Phases[3].StartOffsetMs)
	require.Equal(t, int64(72_000), got.Phases[3].EndOffsetMs)
}

func TestUlduarMimironPhaseFourMustFinish(t *testing.T) {
	t.Parallel()

	instance := newUlduarTestInstance(t)
	player := guid.GUID(1)
	leviathan := creatureGUID(33432)
	vx001 := creatureGUID(33651)
	aerial := creatureGUID(33670)
	start := time.Date(2026, time.August, 28, 12, 0, 0, 0, time.UTC)

	for i, target := range []guid.GUID{leviathan, vx001, aerial, leviathan, vx001, aerial} {
		hit := damageEvent(player, target, 1)
		hit.MessageBase = messages.Base(start.Add(time.Duration(i) * 10 * time.Second))
		require.NoError(t, instance.Process(hit))
	}
	for i, target := range []guid.GUID{leviathan, vx001} {
		require.NoError(t, instance.Process(&messages.Slain{
			MessageBase: messages.Base(start.Add(60*time.Second + time.Duration(i)*time.Second)),
			Victim:      target,
			Killer:      &player,
		}))
	}
	require.NoError(t, instance.Process(&messages.Slain{
		MessageBase: messages.Base(start.Add(70 * time.Second)),
		Victim:      player,
		Killer:      &aerial,
	}))
	require.NoError(t, instance.Process(messages.TimedOut(start.Add(2*time.Minute+2*time.Second))))

	result, err := instance.Finalize(t.Context())
	require.NoError(t, err)
	require.Len(t, result.Encounters, 1)

	got := result.Encounters[0]
	require.Equal(t, "Mimiron", got.Name)
	require.True(t, got.Boss)
	require.Equal(t, encounter.KillTypeWipe, got.KillType)
	require.Len(t, got.Phases, 4)
	require.Equal(t, encounter.KillTypeWipe, got.Phases[3].KillType)
}

func TestUlduarMimironEncounterIdentities(t *testing.T) {
	t.Parallel()

	hostiles := UlduarHostiles()
	fight := encounter.Fight{}
	for _, entry := range []uint32{33432, 34106, 33651, 33670} {
		identity, ok := hostiles[entry]
		require.True(t, ok)
		require.True(t, identity.Boss)
		require.Equal(t, "Mimiron", identity.EncounterName)
		require.NotNil(t, identity.EncounterNameFn)

		result := identity.EncounterNameFn(fight)
		require.NotNil(t, result)
		require.Equal(t, "Mimiron", result.EncounterName)
		require.Equal(t, []uint32{33651, 33670}, result.Bosses)
	}

	mimiron, ok := hostiles[33350]
	require.True(t, ok)
	require.Equal(t, types.AffiliationFriendly, mimiron.Affiliation)
	require.False(t, mimiron.Boss)
}

func TestUlduarAlgalonAuraCleanupWithLivingPlayerIsCleanKill(t *testing.T) {
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
	players := []guid.GUID{1, 2, 3}
	algalon := creatureGUID(32871)
	star := creatureGUID(32955)
	darkMatter := creatureGUID(33089)
	start := time.Date(2026, time.August, 26, 16, 6, 30, 0, time.UTC)

	processDamage := func(at time.Duration, caster, target guid.GUID) {
		t.Helper()
		require.NoError(t, instance.Process(&messages.Damage{
			MessageBase: messages.Base(start.Add(at)),
			Caster:      &caster,
			Target:      target,
			Amount:      1,
			HitType:     types.HitTypeHit,
		}))
	}

	processDamage(0, players[0], star)
	processDamage(50*time.Second, players[0], algalon)
	processDamage(51*time.Second, players[1], algalon)
	processDamage(51*time.Second+500*time.Millisecond, players[2], algalon)
	processDamage(52*time.Second, players[0], darkMatter)
	require.NoError(t, instance.Process(&messages.Slain{
		MessageBase: messages.Base(start.Add(53 * time.Second)),
		Victim:      players[1],
	}))
	require.NoError(t, instance.Process(messages.TimedOut(start.Add(61*time.Second))))
	processDamage(62*time.Second, players[0], algalon)

	cleanupAt := start.Add(62*time.Second + 22*time.Millisecond)
	for i := range 12 {
		require.NoError(t, instance.Process(&messages.Aura{
			MessageBase: messages.Base(cleanupAt),
			Target:      algalon,
			SpellName:   fmt.Sprintf("Removed debuff %d", i),
			State:       types.AuraStateRemoved,
		}))
	}

	result, err := instance.Finalize(context.Background())
	require.NoError(t, err)
	require.Len(t, result.Encounters, 1)

	got := result.Encounters[0]
	require.Equal(t, "Algalon the Observer", got.Name)
	require.True(t, got.Boss)
	require.Equal(t, encounter.KillTypeClean, got.KillType)
	require.Empty(t, got.Remaining)
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
	guardianSurvivor := guardian + 1
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
	processDamage(500*time.Millisecond, guardianSurvivor, types.HitTypeHit)
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
	processDamage(109*time.Second, guardianSurvivor, types.HitTypeHit)
	require.NoError(t, instance.Process(&messages.Slain{
		MessageBase: messages.Base(start.Add(110 * time.Second)),
		Victim:      yogg,
	}))
	guardianCharacter, ok := instance.Characters.Get(guardianSurvivor)
	require.True(t, ok)
	require.Equal(t, period.EndStateReset, guardianCharacter.LastEndState())

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

func TestUlduarAssemblyOfIronIdentities(t *testing.T) {
	t.Parallel()

	hostiles := UlduarHostiles()
	for _, entry := range []uint32{32857, 32867, 32927, 33692, 33693, 33694} {
		identity, ok := hostiles[entry]
		require.True(t, ok)
		require.True(t, identity.Boss)
		require.Equal(t, "Assembly of Iron", identity.EncounterName)
	}
}

func TestUlduarAssemblyRespawnStartsNewEncounter(t *testing.T) {
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
	start := time.Date(2026, time.August, 27, 1, 11, 29, 0, time.UTC)
	oldAssembly := []guid.GUID{
		creatureGUIDWithSeed(32857, 1),
		creatureGUIDWithSeed(32867, 1),
		creatureGUIDWithSeed(32927, 1),
	}
	newAssembly := []guid.GUID{
		creatureGUIDWithSeed(32857, 2),
		creatureGUIDWithSeed(32867, 2),
		creatureGUIDWithSeed(32927, 2),
	}

	for i, boss := range oldAssembly {
		require.NoError(t, instance.Process(&messages.Damage{
			MessageBase: messages.Base(start.Add(time.Duration(i) * time.Millisecond)),
			Caster:      &player,
			Target:      boss,
			Amount:      1,
			HitType:     types.HitTypeHit,
		}))
	}
	require.NoError(t, instance.Process(&messages.Slain{
		MessageBase: messages.Base(start.Add(time.Minute)),
		Victim:      oldAssembly[0],
		Killer:      &player,
	}))
	require.NoError(t, instance.Process(&messages.Damage{
		MessageBase: messages.Base(start.Add(100 * time.Second)),
		Caster:      &oldAssembly[1],
		Target:      player,
		Amount:      1,
		HitType:     types.HitTypeHit,
	}))
	require.NoError(t, instance.Process(&messages.Slain{
		MessageBase: messages.Base(start.Add(101 * time.Second)),
		Victim:      player,
		Killer:      &oldAssembly[1],
	}))

	// Observed Igr50E8ZG5QkkBJX: after one council member died and the raid
	// wiped, the respawned council used new GUIDs before the surviving old GUIDs
	// timed out. The new spawn must close the previous attempt instead of merging
	// both pulls into one encounter.
	secondStart := start.Add(2*time.Minute + 15*time.Second)
	for i, boss := range newAssembly {
		require.NoError(t, instance.Process(&messages.Damage{
			MessageBase: messages.Base(secondStart.Add(time.Duration(i) * time.Millisecond)),
			Caster:      &player,
			Target:      boss,
			Amount:      1,
			HitType:     types.HitTypeHit,
		}))
	}
	// The first respawn event is reserved for closing the prior pull. A later
	// event starts that council member in the new fight.
	require.NoError(t, instance.Process(&messages.Damage{
		MessageBase: messages.Base(secondStart.Add(time.Second)),
		Caster:      &player,
		Target:      newAssembly[0],
		Amount:      1,
		HitType:     types.HitTypeHit,
	}))

	for i, boss := range newAssembly {
		require.NoError(t, instance.Process(&messages.Slain{
			MessageBase: messages.Base(secondStart.Add(30*time.Second + time.Duration(i)*time.Second)),
			Victim:      boss,
			Killer:      &player,
		}))
	}

	result, err := instance.Finalize(context.Background())
	require.NoError(t, err)
	require.Len(t, result.Encounters, 2)

	first := result.Encounters[0]
	require.Equal(t, "Assembly of Iron", first.Name)
	require.True(t, first.Boss)
	require.Equal(t, encounter.KillTypeWipe, first.KillType)
	require.Len(t, first.Combat.Hostiles, 3)
	require.Equal(t, []guid.GUID{oldAssembly[2]}, first.Remaining)

	second := result.Encounters[1]
	require.Equal(t, "Assembly of Iron", second.Name)
	require.True(t, second.Boss)
	require.Equal(t, encounter.KillTypeClean, second.KillType)
	require.Len(t, second.Combat.Hostiles, 3)
	require.Empty(t, second.Remaining)
}

func creatureGUIDWithSeed(entry uint32, seed uint32) guid.GUID {
	return guid.GUID(0xF130000000000000 | uint64(entry)<<24 | uint64(seed))
}

func creatureGUID(entry uint32) guid.GUID {
	return guid.GUID(0xF130000000000001 | uint64(entry)<<24)
}
