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

func newTempestKeepTestInstance(t *testing.T) *commoninstances.Hookable {
	t.Helper()
	ctx := parsectx.With(context.Background(), parsectx.Context{
		Flavor: database.WoWFlavor{database.FlavorTBC},
	})
	return TempestKeepFactory.New(
		ctx,
		slog.Default(),
		unitdb.New(),
		zone.Zone{Name: "Tempest Keep", MapID: 550},
		database.WoWFlavor{database.FlavorTBC},
	)
}

func TestTempestKeepKaelThasIdentities(t *testing.T) {
	t.Parallel()

	hostiles := TempestKeepHostiles()
	for _, entry := range []uint32{
		19622,
		20060, 20062, 20063, 20064,
		21268, 21269, 21270, 21271, 21272, 21273, 21274,
	} {
		identity, ok := hostiles[entry]
		require.True(t, ok, "entry %d must be registered", entry)
		require.True(t, identity.Boss)
		require.Equal(t, "Kael'thas Sunstrider", identity.EncounterName)
	}
}

func TestTempestKeepKaelThasIsOneFourPhaseEncounter(t *testing.T) {
	t.Parallel()

	instance := newTempestKeepTestInstance(t)
	player := guid.GUID(1)
	advisor := creatureGUID(20064)
	weapon := creatureGUID(21270)
	weaponWithoutSlainEvent := creatureGUID(21273)
	kaelThas := creatureGUID(19622)
	start := time.Date(2026, time.October, 5, 12, 0, 0, 0, time.UTC)

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

	processDamage(0, advisor)
	processSlain(10*time.Second, advisor)

	processDamage(30*time.Second, weapon)
	processDamage(31*time.Second, weaponWithoutSlainEvent)
	processSlain(40*time.Second, weapon)

	// The observed Crusader Storm log has a long loot/equip intermission after
	// the weapons die. The encounter must remain open through that gap.
	require.NoError(t, instance.Process(messages.TimedOut(start.Add(2*time.Minute+29*time.Second))))
	processDamage(2*time.Minute+30*time.Second, advisor)
	processSlain(2*time.Minute+40*time.Second, advisor)

	processDamage(2*time.Minute+45*time.Second, kaelThas)
	processSlain(3*time.Minute+30*time.Second, kaelThas)

	result, err := instance.Finalize(t.Context())
	require.NoError(t, err)
	require.Len(t, result.Encounters, 1)

	got := result.Encounters[0]
	require.Equal(t, "Kael'thas Sunstrider", got.Name)
	require.True(t, got.Boss)
	require.Equal(t, encounter.KillTypeClean, got.KillType)
	require.Equal(t, start, got.Combat.Start)
	require.Equal(t, start.Add(3*time.Minute+30*time.Second), got.Combat.End)
	require.Len(t, got.Phases, 4)
	require.Equal(t, []string{
		"kaelthas_advisors",
		"kaelthas_weapons",
		"kaelthas_resurrected_advisors",
		"kaelthas_boss",
	}, []string{got.Phases[0].Key, got.Phases[1].Key, got.Phases[2].Key, got.Phases[3].Key})
	require.Equal(t, int64(30_000), got.Phases[0].EndOffsetMs)
	require.Equal(t, int64(150_000), got.Phases[1].EndOffsetMs)
	require.Equal(t, int64(165_000), got.Phases[2].EndOffsetMs)
	require.Equal(t, int64(210_000), got.Phases[3].EndOffsetMs)
}
