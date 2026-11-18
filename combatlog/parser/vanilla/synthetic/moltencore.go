package synthetic

import (
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/types/zone"
)

// Turtle's persistent hazards must not keep a pull alive through either the
// attributed boss or their targets, even when no boss has been observed.
func newMoltenCore() *shadowBosses {
	return newShadowBosses(shadowBossOptions{
		zone:            func(z zone.Zone) bool { return z.MapID == 409 || z.Name == "Molten Core" },
		bossMatches:     guid.GUID.IsCreature,
		observeAffected: true,
		casts:           true,
		ignoreActivity:  "persistent Ragnaros hazard",
	}).shadowed(11502, "Ragnaros",
		shadowSource{entry: 178088, matches: guid.GUID.IsObject},
		shadowSource{entry: 13148, matches: guid.GUID.IsCreature},
	)
}
