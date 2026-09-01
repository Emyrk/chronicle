package creatures

import (
	"github.com/Emyrk/chronicle/combatlog/parser/common/characters"
	"github.com/Emyrk/chronicle/combatlog/parser/common/characters/period"
	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
)

type MajordomoParty struct {
	*characters.Common
	all         *characters.Characters
	isMajordomo bool
	announced   bool

	// party is only allocated on majordomo, and is used to track the adds in the encounter.
	party map[guid.GUID]characters.Character
}

const (
	flamewakerElite   = 11664
	flamewakerHealer  = 11663
	majorDomoEntry    = 12018
	majordomoAddCount = 8
)

func NewMajordomoPartyCharacter(id guid.GUID, all *characters.Characters) (characters.Character, bool) {
	if !id.IsCreature() {
		return nil, false
	}

	entry, ok := id.GetEntry()
	if !ok {
		return nil, false
	}

	isMajordomo := false
	switch entry {
	case flamewakerElite, flamewakerHealer:
	// in the party!
	case majorDomoEntry:
		isMajordomo = true
	default:
		return nil, false
	}

	p := &MajordomoParty{
		Common:      characters.NewCommonCharacter(id, all),
		all:         all,
		isMajordomo: isMajordomo,
		party:       make(map[guid.GUID]characters.Character),
	}
	return p, true
}

func (c *MajordomoParty) Process(m messages.Message) error {
	wasActive := c.IsActive()

	err := c.Common.Process(m)
	if err != nil {
		return err
	}

	if !wasActive && c.IsActive() {
		// Activity gone from inactive to active, add to the major domo party
		c.announceSelf()
	}

	if !c.announced && c.IsActive() {
		c.announceSelf()
	}

	// If someone was slain, or this unit just became inactive, then tell
	// Majordomo to do an activity check.
	_, isSlain := m.(*messages.Slain)
	if isSlain || (wasActive && !c.IsActive()) {
		c.processAddCheck(m)
	}

	if c.isMajordomo && (wasActive && !c.IsActive()) {
		// If Majordomo goes inactive due to a timeout, we need to reset the party. When
		// the encounter resets, the domo party will be re-announced and populated as the
		// adds become active again.
		c.party = make(map[guid.GUID]characters.Character)
	}

	return nil
}

func (c *MajordomoParty) announceSelf() {
	p, ok := c.getActiveMajorDomo()
	if !ok {
		return
	}

	if !c.isMajordomo {
		p.party[c.ID()] = c
	}
	c.announced = true
}

func (c *MajordomoParty) getActiveMajorDomo() (*MajordomoParty, bool) {
	var major *MajordomoParty
	majors, ok := c.all.ByEntry[majorDomoEntry]
	for _, m := range majors {
		if m.IsActive() {
			ty, ok := m.(*MajordomoParty)
			if ok {
				major = ty
			}
			break
		}
	}

	if !ok || major == nil {
		return nil, false
	}

	return major, true
}

func (c *MajordomoParty) processAddCheck(m messages.Message) {
	if !c.isMajordomo {
		// Find him
		major, ok := c.getActiveMajorDomo()
		if !ok {
			return
		}
		major.processAddCheck(m)
		return
	}

	if !c.IsActive() {
		return // Nothing to do if Majordomo is not active
	}

	slainAdds := 0
	for _, add := range c.party {
		pd, ok := add.CurrentPeriod()
		if ok && pd.EndState == period.EndStateSlain {
			slainAdds++
		}
	}
	if slainAdds < majordomoAddCount {
		return
	}

	// Some servers can expose extra active copies of Majordomo's adds. The
	// encounter still ends after the required eight adds die, and the surviving
	// copies despawn with Majordomo. End them as defeated so the encounter is a
	// clean kill rather than a partial kill or wipe.
	for _, add := range c.party {
		if add.IsActive() {
			add.Died("majordomo_defeated", m)
		}
	}
	c.Died("all_adds_dead", m)
}
