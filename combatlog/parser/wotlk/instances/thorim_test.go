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
	"github.com/Emyrk/chronicle/combatlog/parser/types/zone"
	"github.com/Emyrk/chronicle/database"
)

func newUlduarTestInstance(t *testing.T) *commoninstances.Hookable {
	t.Helper()
	ctx := parsectx.With(context.Background(), parsectx.Context{
		Flavor: database.WoWFlavor{database.FlavorWrath},
	})
	return UlduarFactory.New(
		ctx,
		slog.Default(),
		unitdb.New(),
		zone.Zone{Name: "Ulduar", MapID: 603},
		database.WoWFlavor{database.FlavorWrath},
	)
}

func TestThorimRoomMechanicBridgesEncounterPacks(t *testing.T) {
	t.Parallel()

	instance := newUlduarTestInstance(t)
	player := guid.GUID(1)
	soldier := creatureGUID(32883)
	guard := creatureGUID(32874)
	thorim := creatureGUID(32865)
	start := time.Date(2026, time.August, 28, 12, 0, 0, 0, time.UTC)

	arenaHit := damageEvent(player, soldier, 1)
	arenaHit.MessageBase = messages.Base(start)
	require.NoError(t, instance.Process(arenaHit))
	require.NoError(t, instance.Process(&messages.Slain{
		MessageBase: messages.Base(start.Add(10 * time.Second)),
		Victim:      soldier,
	}))

	gauntletStart := start.Add(27 * time.Second)
	gauntletHit := damageEvent(player, guard, 1)
	gauntletHit.MessageBase = messages.Base(gauntletStart)
	require.NoError(t, instance.Process(gauntletHit))
	require.NoError(t, instance.Process(&messages.Slain{
		MessageBase: messages.Base(start.Add(37 * time.Second)),
		Victim:      guard,
	}))

	bossStart := start.Add(54 * time.Second)
	bossHit := damageEvent(player, thorim, 1)
	bossHit.MessageBase = messages.Base(bossStart)
	require.NoError(t, instance.Process(bossHit))
	defeat := damageEvent(player, thorim, 1)
	defeat.MessageBase = messages.Base(start.Add(time.Minute))
	defeat.Overkill = 1
	require.NoError(t, instance.Process(defeat))

	result, err := instance.Finalize(t.Context())
	require.NoError(t, err)
	require.Len(t, result.Encounters, 1)
	require.Equal(t, start, result.Encounters[0].Combat.Start)
	require.Equal(t, start.Add(time.Minute), result.Encounters[0].Combat.End)
	require.Len(t, result.Encounters[0].Phases, 3)
	require.Equal(t, int64(27_000), result.Encounters[0].Phases[0].EndOffsetMs)
	require.Equal(t, int64(54_000), result.Encounters[0].Phases[1].EndOffsetMs)
}

func TestThorimInactiveAddsDoNotMergeAttempts(t *testing.T) {
	t.Parallel()

	instance := newUlduarTestInstance(t)
	player := guid.GUID(1)
	firstCommoner := creatureGUID(32904)
	secondGuard := creatureGUID(32874)
	thorim := creatureGUID(32865)
	start := time.Date(2026, time.August, 28, 12, 0, 0, 0, time.UTC)

	first := damageEvent(player, firstCommoner, 1)
	first.MessageBase = messages.Base(start)
	require.NoError(t, instance.Process(first))
	require.NoError(t, instance.Process(messages.TimedOut(start.Add(61*time.Second))))

	secondStart := start.Add(2 * time.Minute)
	second := damageEvent(player, secondGuard, 1)
	second.MessageBase = messages.Base(secondStart)
	require.NoError(t, instance.Process(second))
	bossHit := damageEvent(player, thorim, 1)
	bossHit.MessageBase = messages.Base(secondStart.Add(time.Second))
	require.NoError(t, instance.Process(bossHit))
	defeat := damageEvent(player, thorim, 1)
	defeat.MessageBase = messages.Base(secondStart.Add(2 * time.Second))
	defeat.Overkill = 1
	require.NoError(t, instance.Process(defeat))

	result, err := instance.Finalize(t.Context())
	require.NoError(t, err)
	require.Len(t, result.Encounters, 2)
	require.Equal(t, start.Add(time.Minute), result.Encounters[0].Combat.End)
	require.Equal(t, secondStart, result.Encounters[1].Combat.Start)
}

func TestThorimAddOnlyFightIsTrash(t *testing.T) {
	t.Parallel()

	instance := newUlduarTestInstance(t)
	player := guid.GUID(1)
	warbringer := creatureGUID(32877)
	start := time.Date(2026, time.September, 3, 12, 0, 0, 0, time.UTC)

	hit := damageEvent(player, warbringer, 1)
	hit.MessageBase = messages.Base(start)
	require.NoError(t, instance.Process(hit))
	require.NoError(t, instance.Process(&messages.Slain{
		MessageBase: messages.Base(start.Add(10 * time.Second)),
		Victim:      player,
		Killer:      &warbringer,
	}))
	require.NoError(t, instance.Process(messages.TimedOut(start.Add(61*time.Second))))

	result, err := instance.Finalize(t.Context())
	require.NoError(t, err)
	require.Len(t, result.Encounters, 1)

	got := result.Encounters[0]
	require.Equal(t, "Dark Rune Warbringer", got.Name)
	require.False(t, got.Boss)
	require.Equal(t, encounter.KillTypeWipe, got.KillType)
}

func TestThorimArenaStarterCombatIgnoresNPCDamage(t *testing.T) {
	t.Parallel()

	preprocessor := &thorimArenaStarterCombat{}
	jormungar := creatureGUID(32882)
	captain := creatureGUID(32908)
	damage := damageEvent(jormungar, captain, 1)

	require.NoError(t, preprocessor.ProcessMessage(damage))
	for _, id := range []guid.GUID{jormungar, captain} {
		reason, ignored := damage.MarkHas(messages.MarkTypeIgnoreActivity, id)
		require.True(t, ignored)
		require.Equal(t, "scripted Thorim arena combat", reason)
	}
}

func TestThorimArenaStarterCombatIgnoresNPCAuras(t *testing.T) {
	t.Parallel()

	preprocessor := &thorimArenaStarterCombat{}
	captain := creatureGUID(32908)
	jormungar := creatureGUID(32882)
	aura := &messages.Aura{
		MessageBase: messages.Base(time.Date(2026, time.August, 28, 12, 0, 0, 0, time.UTC)),
		Source:      &captain,
		Target:      jormungar,
		SpellName:   "Sunder Armor",
		Amount:      1,
	}

	require.NoError(t, preprocessor.ProcessMessage(aura))
	for _, id := range []guid.GUID{captain, jormungar} {
		_, ignored := aura.MarkHas(messages.MarkTypeIgnoreActivity, id)
		require.True(t, ignored)
	}
}

func TestThorimArenaStarterCombatPreservesPlayerEngagement(t *testing.T) {
	t.Parallel()

	preprocessor := &thorimArenaStarterCombat{}
	player := guid.GUID(1)
	jormungar := creatureGUID(32882)

	for _, damage := range []*messages.Damage{
		damageEvent(player, jormungar, 1),
		damageEvent(jormungar, player, 1),
	} {
		require.NoError(t, preprocessor.ProcessMessage(damage))
		_, ignored := damage.MarkHas(messages.MarkTypeIgnoreActivity, jormungar)
		require.False(t, ignored)
	}
}

func TestThorimArenaStarterCombatDoesNotStartPull(t *testing.T) {
	t.Parallel()

	instance := newUlduarTestInstance(t)
	jormungar := creatureGUID(32882)
	captain := creatureGUID(32908)
	player := guid.GUID(1)
	start := time.Date(2026, time.August, 28, 12, 0, 0, 0, time.UTC)

	ambient := damageEvent(jormungar, captain, 1)
	ambient.MessageBase = messages.Base(start)
	require.NoError(t, instance.Process(ambient))

	engage := damageEvent(player, captain, 1)
	engage.MessageBase = messages.Base(start.Add(time.Minute))
	require.NoError(t, instance.Process(engage))

	result, err := instance.Finalize(t.Context())
	require.NoError(t, err)
	require.Len(t, result.Encounters, 1)
	require.Equal(t, start.Add(time.Minute), result.Encounters[0].Combat.Start)
}
