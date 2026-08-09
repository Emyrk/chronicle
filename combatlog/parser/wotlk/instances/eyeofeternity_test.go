package instances

import (
	"context"
	"log/slog"
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/common/unitdb"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/types/zone"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/gamedb/chrondbc"
)

func TestEyeOfEternityFactoryInstallsMalygosDamageCredit(t *testing.T) {
	t.Parallel()

	instance := EyeOfEternityFactory.New(
		context.Background(),
		slog.Default(),
		unitdb.New(),
		zone.Zone{Name: "Eye of Eternity", MapID: 616},
		database.WoWFlavor{database.FlavorWrath},
	)
	malygos := creatureGUID(malygosEntry)
	player := guid.GUID(1)
	start := time.Date(2026, time.August, 9, 12, 0, 0, 0, time.UTC)
	observed := damageEvent(malygos, player, 1)
	observed.MessageBase = messages.Base(start)
	require.NoError(t, instance.Process(observed))

	damage := damageEvent(0, player, 57429)
	damage.MessageBase = messages.Base(start.Add(time.Second))
	require.NoError(t, instance.Process(damage))
	require.NotNil(t, damage.Caster)
	require.Equal(t, malygos, *damage.Caster)
	_, ignored := damage.MarkHas(messages.MarkTypeIgnoreActivity, malygos)
	require.True(t, ignored)
}

func TestMalygosDamageCredit(t *testing.T) {
	t.Parallel()

	malygos := creatureGUID(malygosEntry)
	player := guid.GUID(1)

	for name, spellID := range map[string]chrondbc.SpellID{
		"surge of power": 56548,
		"static field":   57429,
	} {
		t.Run(name, func(t *testing.T) {
			t.Parallel()

			credit := &malygosDamageCredit{}
			require.NoError(t, credit.ProcessMessage(damageEvent(malygos, player, 1)))

			zero := guid.GUID(0)
			for _, caster := range []*guid.GUID{nil, &zero} {
				damage := damageEvent(0, player, spellID)
				damage.Caster = caster

				require.NoError(t, credit.ProcessMessage(damage))
				require.NotNil(t, damage.Caster)
				require.Equal(t, malygos, *damage.Caster)
				_, ignored := damage.MarkHas(messages.MarkTypeIgnoreActivity, malygos)
				require.True(t, ignored)
			}
		})
	}
}

func TestMalygosDamageCreditExpiresAfterSlainGracePeriod(t *testing.T) {
	t.Parallel()

	credit := &malygosDamageCredit{}
	malygos := creatureGUID(malygosEntry)
	player := guid.GUID(1)
	slainAt := time.Date(2026, time.August, 9, 12, 0, 0, 0, time.UTC)

	observed := damageEvent(malygos, player, 1)
	observed.MessageBase = messages.Base(slainAt.Add(-time.Second))
	require.NoError(t, credit.ProcessMessage(observed))
	require.NoError(t, credit.ProcessMessage(&messages.Slain{
		MessageBase: messages.Base(slainAt),
		Victim:      malygos,
	}))

	residual := damageEvent(0, player, 57429)
	residual.MessageBase = messages.Base(slainAt.Add(malygosDamageCreditGrace - time.Millisecond))
	require.NoError(t, credit.ProcessMessage(residual))
	require.Equal(t, malygos, *residual.Caster, "residual damage inside the grace period should remain attributed")

	expired := damageEvent(0, player, 57429)
	expired.MessageBase = messages.Base(slainAt.Add(malygosDamageCreditGrace))
	require.NoError(t, credit.ProcessMessage(expired))
	require.True(t, expired.Caster.IsZero(), "damage at the grace-period boundary should remain unattributed")
	require.True(t, credit.caster.IsZero())
	require.True(t, credit.casterExpiresAt.IsZero())
}

func TestMalygosDamageCreditIsInstanceScoped(t *testing.T) {
	t.Parallel()

	firstMalygos := creatureGUID(malygosEntry)
	secondMalygos := firstMalygos + 1
	player := guid.GUID(1)
	first, ok := EyeOfEternityFactory.Preprocessors()[0].(*malygosDamageCredit)
	require.True(t, ok)
	second, ok := EyeOfEternityFactory.Preprocessors()[0].(*malygosDamageCredit)
	require.True(t, ok)
	require.NotSame(t, first, second)

	require.NoError(t, first.ProcessMessage(damageEvent(firstMalygos, player, 1)))
	require.NoError(t, second.ProcessMessage(damageEvent(secondMalygos, player, 1)))

	firstDamage := damageEvent(0, player, 57429)
	secondDamage := damageEvent(0, player, 57429)
	require.NoError(t, first.ProcessMessage(firstDamage))
	require.NoError(t, second.ProcessMessage(secondDamage))
	require.Equal(t, firstMalygos, *firstDamage.Caster)
	require.Equal(t, secondMalygos, *secondDamage.Caster)
}

func TestMalygosDamageCreditPreservesUncertainSources(t *testing.T) {
	t.Parallel()

	malygos := creatureGUID(malygosEntry)
	otherCaster := creatureGUID(1)
	player := guid.GUID(1)
	credit := &malygosDamageCredit{}

	for name, damage := range map[string]*messages.Damage{
		"boss not observed":  damageEvent(0, player, 57429),
		"unconfigured spell": damageEvent(0, player, 56256),
		"nonzero caster":     damageEvent(otherCaster, player, 57429),
	} {
		t.Run(name, func(t *testing.T) {
			t.Parallel()

			localCredit := credit
			if name != "boss not observed" {
				localCredit = &malygosDamageCredit{}
				require.NoError(t, localCredit.ProcessMessage(damageEvent(malygos, player, 1)))
			}
			expected := *damage.Caster
			require.NoError(t, localCredit.ProcessMessage(damage))
			require.Equal(t, expected, *damage.Caster)
		})
	}
}

func damageEvent(caster, target guid.GUID, spellID chrondbc.SpellID) *messages.Damage {
	return &messages.Damage{
		MessageBase: messages.Base(time.Time{}),
		Caster:      &caster,
		Target:      target,
		Amount:      1,
		SpellData:   &chrondbc.Spell{ID: spellID},
	}
}
