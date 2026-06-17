package creatures

import (
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/common/characters"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
)

func NewNefarian(id guid.GUID, all *characters.Characters) (characters.Character, bool) {
	entry, ok := id.GetEntry()
	if !ok {
		return nil, false
	}

	if !isNefarianEntry(entry) {
		return nil, false
	}

	return characters.NewRoomMechanic(id, 11583, all)
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

func NewRazorgore(id guid.GUID, all *characters.Characters) (characters.Character, bool) {
	if entry, ok := id.GetEntry(); !ok || entry != 12435 {
		return nil, false
	}

	base := characters.NewCommonCharacter(id, all)
	base.SetRecentlySlainDuration(time.Second * 30)
	c := &razorgore{Common: base}
	return characters.NewAdsGoWithBossCustomCharacter(c, all, 12435,
		12420,
		12416,
		12422,
		50142,
		52153,
	), true
}

type razorgore struct {
	*characters.Common
}

func (c *razorgore) Process(m messages.Message) error {
	switch ty := m.(type) {
	case *messages.SpellGo:
		entry, _ := c.ID().GetEntry()
		var _ = entry
		// Razorgore is MC'd and destroys eggs around the room. Count this as activity.
		if ty.Caster == c.ID() && ty.SpellData != nil &&
			(ty.SpellData.ID == 19873 || ty.SpellData.ID == 22425) {
			ty.MarkActivityStart("Razorgore destroying eggs", c.ID())
		}
	}
	return c.Common.Process(m)
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
