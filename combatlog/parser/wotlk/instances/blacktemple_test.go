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

func newBlackTempleTestInstance(t *testing.T) *commoninstances.Hookable {
	t.Helper()
	ctx := parsectx.With(context.Background(), parsectx.Context{
		Flavor: database.WoWFlavor{database.FlavorTBC},
	})
	return BlackTempleFactory.New(
		ctx,
		slog.Default(),
		unitdb.New(),
		zone.Zone{Name: "Black Temple", MapID: 564},
		database.WoWFlavor{database.FlavorTBC},
	)
}

func TestBlackTempleIdentities(t *testing.T) {
	t.Parallel()

	hostiles := BlackTempleHostiles()
	for _, entry := range []uint32{23089, 23191} {
		identity, ok := hostiles[entry]
		require.True(t, ok, "missing friendly Akama entry %d", entry)
		require.Equal(t, types.AffiliationFriendly, identity.Affiliation, "entry %d", entry)
		require.False(t, identity.Boss, "entry %d", entry)
	}

	for _, entry := range []uint32{22856, 23418, 23419, 23420} {
		identity, ok := hostiles[entry]
		require.True(t, ok, "missing Reliquary entry %d", entry)
		require.Equal(t, types.AffiliationHostile, identity.Affiliation, "entry %d", entry)
		require.True(t, identity.Boss, "entry %d", entry)
		require.Equal(t, "Reliquary of Souls", identity.EncounterName, "entry %d", entry)
	}
}

func TestBlackTempleShadeOfAkamaIgnoresFriendlyAkama(t *testing.T) {
	t.Parallel()

	instance := newBlackTempleTestInstance(t)
	player := guid.GUID(1)
	shade := creatureGUID(22841)
	akama := creatureGUID(23191)
	start := time.Date(2026, time.November, 9, 21, 38, 43, 0, time.UTC)

	opening := damageEvent(shade, akama, 6603)
	opening.MessageBase = messages.Base(start)
	require.NoError(t, instance.Process(opening))

	require.NoError(t, instance.Process(&messages.Slain{
		MessageBase: messages.Base(start.Add(40 * time.Second)),
		Victim:      shade,
		Killer:      &player,
	}))

	result, err := instance.Finalize(t.Context())
	require.NoError(t, err)
	require.Len(t, result.Encounters, 1)

	got := result.Encounters[0]
	require.Equal(t, "Shade of Akama", got.Name)
	require.Equal(t, encounter.KillTypeClean, got.KillType)
	require.Equal(t, start.Add(40*time.Second), got.Combat.End)
	require.Empty(t, got.Remaining)
}

func TestBlackTempleReliquaryIsOneThreePhaseEncounter(t *testing.T) {
	t.Parallel()

	instance := newBlackTempleTestInstance(t)
	player := guid.GUID(1)
	suffering := creatureGUID(23418)
	desire := creatureGUID(23419)
	anger := creatureGUID(23420)
	start := time.Date(2026, time.November, 9, 22, 15, 0, 0, time.UTC)

	processDamage := func(at time.Duration, target guid.GUID) {
		t.Helper()
		damage := damageEvent(player, target, 1)
		damage.MessageBase = messages.Base(start.Add(at))
		damage.HitType = types.HitTypeHit
		require.NoError(t, instance.Process(damage))
	}
	processSlain := func(at time.Duration, target guid.GUID) {
		t.Helper()
		require.NoError(t, instance.Process(&messages.Slain{
			MessageBase: messages.Base(start.Add(at)),
			Victim:      target,
			Killer:      &player,
		}))
	}

	processDamage(0, suffering)
	processSlain(30*time.Second, suffering)
	processDamage(45*time.Second, desire)
	processSlain(75*time.Second, desire)
	processDamage(90*time.Second, anger)
	processSlain(2*time.Minute, anger)

	result, err := instance.Finalize(t.Context())
	require.NoError(t, err)
	require.Len(t, result.Encounters, 1)

	got := result.Encounters[0]
	require.Equal(t, "Reliquary of Souls", got.Name)
	require.True(t, got.Boss)
	require.Equal(t, encounter.KillTypeClean, got.KillType)
	require.Equal(t, start, got.Combat.Start)
	require.Equal(t, start.Add(2*time.Minute), got.Combat.End)
	require.Len(t, got.Phases, 3)
	require.Equal(t, []string{
		"reliquary_suffering",
		"reliquary_desire",
		"reliquary_anger",
	}, []string{got.Phases[0].Key, got.Phases[1].Key, got.Phases[2].Key})
	require.Equal(t, int64(45_000), got.Phases[0].EndOffsetMs)
	require.Equal(t, int64(90_000), got.Phases[1].EndOffsetMs)
	require.Equal(t, int64(120_000), got.Phases[2].EndOffsetMs)
}
