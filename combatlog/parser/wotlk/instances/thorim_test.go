package instances

import (
	"context"
	"log/slog"
	"testing"
	"time"

	"github.com/stretchr/testify/require"

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
