package character

import (
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/vanilla/messages"
)

type MajordomoParty struct {
	*Common
	all         *Characters
	isMajordomo bool
	announced   bool

	// party is only allocated on majordomo, and is used to track the adds in the encounter.
	party map[guid.GUID]Character
}

const (
	flamewakerElite  = 11664
	flamewakerHealer = 11663
	majorDomoEntry   = 12018
)

func NewMajordomoPartyCharacter(id guid.GUID, all *Characters) (Character, bool) {
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
		Common:      NewCommonCharacter(id, all),
		all:         all,
		isMajordomo: isMajordomo,
		party:       make(map[guid.GUID]Character),
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
		c.party = make(map[guid.GUID]Character)
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

	// We need 8 ads to check
	if len(c.party) != 8 {
		return
	}

	for _, c := range c.party {
		if c.IsActive() {
			return
		}

		pd, ok := c.CurrentPeriod()
		if !ok || !pd.Slain {
			return
		}
	}

	c.Died("all_adds_dead", m)
}
