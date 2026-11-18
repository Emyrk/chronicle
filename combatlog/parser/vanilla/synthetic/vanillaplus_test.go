package synthetic

import (
	"testing"

	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/database"
	"github.com/stretchr/testify/require"
)

func TestVanillaPlusShadowMappings(t *testing.T) {
	t.Parallel()
	for _, mapping := range []struct{ boss, shadow uint32 }{
		{11502, 40004}, {11982, 20006}, {11983, 25122}, {14401, 25118}, {25227, 25253},
	} {
		boss := guid.GUID(0xF130000000000001 | uint64(mapping.boss)<<24)
		helper := guid.GUID(0xF130000000000002 | uint64(mapping.shadow)<<24)
		for _, flavor := range []database.WoWFlavor{{database.FlavorVanillaPlus}, {database.FlavorTurtle}, {database.FlavorVanilla}} {
			_, process := hazardPipeline(t, flavor)
			missing := hazardDamage(helper, hazardTime)
			process(missing)
			require.Equal(t, helper, *missing.Caster)
			require.False(t, missing.MarksExist())
			// A direct boss event is not an observation in the legacy configuration.
			process(hazardDamage(boss, hazardTime))
			missing = hazardDamage(helper, hazardTime)
			process(missing)
			require.Equal(t, helper, *missing.Caster)
			process(hazardBoss(boss))
			damage := hazardDamage(helper, hazardTime)
			original := damage.Caster
			process(damage)
			expected := helper
			if flavor.Has(database.FlavorVanillaPlus) {
				expected = boss
			}
			require.Equal(t, expected, *damage.Caster)
			require.Equal(t, helper, *original)
			require.Equal(t, int32(317), damage.Amount)
			require.False(t, damage.MarksExist(), "VanillaPlus keeps ordinary activity semantics")
			start := &messages.SpellStart{MessageBase: messages.Base(hazardTime), Caster: helper}
			goEvent := &messages.SpellGo{MessageBase: messages.Base(hazardTime), Caster: helper}
			process(start, goEvent)
			require.Equal(t, helper, start.Caster)
			require.Equal(t, helper, goEvent.Caster)
			require.False(t, start.MarksExist())
			require.False(t, goEvent.MarksExist())
		}
	}
}

func TestVanillaPlusPreservesLegacyScopeAndObservation(t *testing.T) {
	t.Parallel()
	_, process := hazardPipeline(t, database.WoWFlavor{database.FlavorVanillaPlus})
	// Legacy matching deliberately uses entry alone for both UNIT_INFO and damage.
	bossObject := guid.GUID(0xF110002CEE000001)
	helperObject := guid.GUID(0xF110009C44000002) // entry 40004
	process(hazardBoss(bossObject))
	for _, boundary := range []messages.Message{
		hazardZone("Molten Core"), hazardZone("Blackwing Lair"),
		&messages.Versions{MessageBase: messages.Base(hazardTime)},
		&messages.Realm{MessageBase: messages.Base(hazardTime)},
		&messages.EncounterBoundary{MessageBase: messages.Base(hazardTime)},
		&messages.UnitEvade{MessageBase: messages.Base(hazardTime), UnitGUID: bossObject},
	} {
		process(boundary)
		damage := hazardDamage(helperObject, hazardTime)
		process(damage)
		require.Equal(t, bossObject, *damage.Caster)
		require.False(t, damage.MarksExist())
	}
	process(hazardBoss(ragGUID))
	damage := hazardDamage(helperObject, hazardTime)
	process(damage)
	require.Equal(t, ragGUID, *damage.Caster)
}

func TestShadowBossesIndependentMappingsAndNamespaces(t *testing.T) {
	t.Parallel()
	processor := newShadowBosses(shadowBossOptions{}).
		shadowed(11502, "first", shadowSource{entry: 13148, matches: guid.GUID.IsCreature}).
		shadowed(11982, "second", shadowSource{entry: 13148, matches: guid.GUID.IsObject})
	second := guid.GUID(0xF130002ECE000001)
	object := guid.GUID(0xF11000335C000001)
	firstDamage, secondDamage := hazardDamage(flameGUID, hazardTime), hazardDamage(object, hazardTime)
	processor.ProcessMessages([]messages.Message{hazardBoss(ragGUID), hazardBoss(second), firstDamage, secondDamage})
	require.Equal(t, ragGUID, *firstDamage.Caster)
	require.Equal(t, second, *secondDamage.Caster)
}
