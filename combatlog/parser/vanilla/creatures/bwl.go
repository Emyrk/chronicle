package creatures

import (
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/common/characters"
	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/database"
)

func NewNefarian(id guid.GUID, all *characters.Characters) (characters.Character, bool) {
	entry, ok := id.GetEntry()
	if !ok {
		return nil, false
	}

	if !isNefarianEntry(entry) {
		return nil, false
	}

	c, ok := characters.NewRoomMechanic(id, 11583, all)
	if !ok {
		return nil, false
	}
	return characters.NewAdsGoWithBossCustomCharacter(c, all, 11583,
		14668, // Corrupted Infernals
	), true
}

func isNefarianEntry(entry uint32) bool {
	switch entry {
	case 11583:
		return true
	case 14261, 14262, 14263, 14264, 14265, 14302:
		return true
	}
	return false
}

func NewBroodlordLashlayer(id guid.GUID, all *characters.Characters) (characters.Character, bool) {
	return characters.NewAdsGoWithBoss(12017,
		// Whelps in the room keep spawning. Don't count them for the time of the boss fight.
		14022,
		14024,
		14025,
		14023,
	)(id, all)
}

type RazorAdCharacter struct {
	*characters.Common
	all *characters.Characters
}

func NewRazorAdCharacter(flavor database.WoWFlavor) func(id guid.GUID, all *characters.Characters) (characters.Character, bool) {
	return func(id guid.GUID, all *characters.Characters) (characters.Character, bool) {
		entry, ok := id.GetEntry()
		if !ok {
			return nil, false
		}
		switch entry {
		case 12416, // Blackwing Legionnaire
			12420, // Blackwing Mage
			12422, // Death Talon Dragonspawn
			14456, // Blackwing Guardsman
			50142, // Blackwing Marksman
			52153: // Death Talon Scorcher
		default:
			return nil, false
		}

		base := characters.NewCommonCharacter(id, all)
		if entry == 50142 && flavor.Has(database.FlavorNightmareOfUrsol) {
			base.WithTimeoutAsDeath()
		}
		return &RazorAdCharacter{Common: base, all: all}, true
	}
}

func (c *RazorAdCharacter) Process(m messages.Message) error {
	cur, ok := c.Activity.Current()
	if ok {
		cur.HandleTimeout(m.Date())
	}
	return characters.ProcessCommonActivity(c, m)
}

func (c *RazorAdCharacter) Start(reason string, m messages.Message) {
	c.Common.Start(reason, m)
	c.bumpRazorgore(m)
}

func (c *RazorAdCharacter) Bump(reason string, m messages.Message) {
	c.Common.Bump(reason, m)
	c.bumpRazorgore(m)
}

func (c *RazorAdCharacter) bumpRazorgore(m messages.Message) {
	for _, razor := range c.all.ByEntry[12435] {
		boss, ok := razor.(characters.CharacterBase)
		if ok && boss.IsActive() {
			boss.Bump("razorgore_add_activity", m)
		}
	}
}

func NewRazorgore(flavor database.WoWFlavor) func(id guid.GUID, all *characters.Characters) (characters.Character, bool) {
	eggThreshold := 0
	switch {
	case flavor.Has(database.FlavorNightmareOfUrsol):
		eggThreshold = 20
	case flavor.Has(database.FlavorVanillaPlus):
		eggThreshold = 30
	}
	return func(id guid.GUID, all *characters.Characters) (characters.Character, bool) {
		if entry, ok := id.GetEntry(); !ok || entry != 12435 {
			return nil, false
		}

		base := characters.NewCommonCharacter(id, all)
		base.SetRecentlySlainDuration(time.Second * 30)
		c := &razorgore{Common: base, all: all, eggThreshold: eggThreshold}
		return characters.NewAdsGoWithBossCustomCharacter(c, all, 12435,
			12420,
			12416,
			12422,
			50142,
			52153,
			52153,
		), true
	}
}

type razorgore struct {
	*characters.Common
	all          *characters.Characters
	eggThreshold int
	eggCount     int
	adsGone      bool
}

func (c *razorgore) Process(m messages.Message) error {
	wasActive := c.IsActive()

	if ty, ok := m.(*messages.SpellGo); ok && ty.Caster == c.ID() && ty.SpellData != nil {
		// Razorgore is MC'd and destroys eggs around the room. Count this as activity.
		if ty.SpellData.ID == 19873 || ty.SpellData.ID == 22425 {
			ty.MarkActivityStart("Razorgore destroying eggs", c.ID())
		}
		// After the flavor-specific number of "Destroy Egg" (19873) casts, the
		// phase-1 adds run away, so count them as killed.
		if c.eggThreshold > 0 && !c.adsGone && ty.SpellData.ID == 19873 {
			c.eggCount++
			if c.eggCount >= c.eggThreshold {
				c.killEggAds(m)
				c.adsGone = true
			}
		}
	}

	err := c.Common.Process(m)

	// Reset the egg count when the boss resets / the fight ends.
	if wasActive && !c.IsActive() {
		c.eggCount = 0
		c.adsGone = false
	}
	return err
}

// killEggAds marks the phase-1 adds as killed. In the real fight they run away
// once the flavor-specific egg threshold is reached; we model that as a death.
func (c *razorgore) killEggAds(m messages.Message) {
	for _, entry := range []uint32{
		12416, // Blackwing Legionnaire
		12420, // Blackwing Mage
		12422, // Death Talon Dragonspawn

		50142, // Blackwing Marksman
		14456, // Blackwing Guardian
	} {
		for _, add := range c.all.ByEntry[entry] {
			if canDie, ok := add.(characters.CanDie); ok {
				canDie.Died("razorgore_eggs_destroyed", m)
			}
		}
	}
}

func NewShadowflameSpark(id guid.GUID, all *characters.Characters) (characters.Character, bool) {
	if entry, ok := id.GetEntry(); !ok || entry != 65151 {
		return nil, false
	}

	all.DB().UpdateUnitName(id, "Shadowflame Spark")
	return &shadowflameSpark{Common: characters.NewCommonCharacter(id, all), all: all}, true
}

type shadowflameSpark struct {
	*characters.Common
	done bool
	all  *characters.Characters
}

func (c *shadowflameSpark) Process(m messages.Message) error {
	if c.done {
		return nil
	}
	if c.IsActive() {
		// Sometimes the name does not get recorded. Summonables and all that :cry:
		c.all.DB().UpdateUnitName(c.ID(), "Shadowflame Spark")
		ebonroc := c.all.ByEntry[14601]
		for _, char := range ebonroc {
			if char.IsActive() {
				c.all.DB().UpdateOwner(c.ID(), char.ID())
			}
		}

		c.Died("sparks vanish and do not count", m)
		c.done = true
		return nil
	}
	return c.Common.Process(m)

}

func NewVaelChained(id guid.GUID, all *characters.Characters) (characters.Character, bool) {
	// V+ only
	if entry, ok := id.GetEntry(); !ok || entry != 25123 {
		return nil, false
	}

	base := characters.NewCommonCharacter(id, all)
	base.SetRecentlySlainDuration(time.Second * 45)
	return base, true
}
