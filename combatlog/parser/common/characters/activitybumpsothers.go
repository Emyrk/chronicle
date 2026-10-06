package characters

import (
	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
)

const ReasonLinkedCharacterActivity = "linked_character_activity"

// ActivityBumpsOthers is a common character whose activity also keeps active
// creatures with the configured entries active. It never starts an inactive
// linked character.
type ActivityBumpsOthers struct {
	*Common
	otherEntries []uint32
}

// NewActivityBumpsOthers creates a factory for a common character whose
// activity bumps active creatures with any of the other entries.
func NewActivityBumpsOthers(entry uint32, otherEntries ...uint32) CharacterFactory {
	return func(id guid.GUID, all *Characters) (Character, bool) {
		if !id.IsCreature() {
			return nil, false
		}
		idEntry, ok := id.GetEntry()
		if !ok || idEntry != entry {
			return nil, false
		}
		return NewActivityBumpsOthersCustomCharacter(
			NewCommonCharacter(id, all),
			otherEntries...,
		), true
	}
}

// NewActivityBumpsOthersCustomCharacter adds linked activity bumping to an
// already configured common character.
func NewActivityBumpsOthersCustomCharacter(c *Common, otherEntries ...uint32) *ActivityBumpsOthers {
	return &ActivityBumpsOthers{
		Common:       c,
		otherEntries: otherEntries,
	}
}

func (c *ActivityBumpsOthers) Process(m messages.Message) error {
	if current, ok := c.Activity.Current(); ok && !c.Lookup().ExplicitEncounterActive() {
		current.HandleTimeout(m.Date())
	}
	return ProcessCommonActivity(c, m)
}

func (c *ActivityBumpsOthers) Start(reason string, m messages.Message) {
	c.Common.Start(reason, m)
	c.bumpOthers(m)
}

func (c *ActivityBumpsOthers) Bump(reason string, m messages.Message) {
	c.Common.Bump(reason, m)
	c.bumpOthers(m)
}

func (c *ActivityBumpsOthers) bumpOthers(m messages.Message) {
	for _, entry := range c.otherEntries {
		for _, other := range c.Lookup().ByEntry[entry] {
			if base, ok := other.(CharacterBase); ok && base.IsActive() {
				base.Bump(ReasonLinkedCharacterActivity, m)
			}
		}
	}
}
