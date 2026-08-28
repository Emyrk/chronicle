package creatures

import (
	"github.com/Emyrk/chronicle/combatlog/parser/common/characters"
	"github.com/Emyrk/chronicle/combatlog/parser/common/characters/period"
	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
)

const algalonEntry = 32871

var algalonAddEntries = []uint32{
	32953, // Black Hole
	32955, // Collapsing Star
	33052, // Living Constellation
	33089, // Dark Matter
	34221, // Dark Matter (alternate entry)
}

type algalonCharacter struct {
	*characters.Common
	all         *characters.Characters
	defeat      *characters.ScriptedDefeatDetector
	seenPlayers map[guid.GUID]struct{}
	deadPlayers map[guid.GUID]struct{}
}

func NewAlgalon(id guid.GUID, all *characters.Characters) (characters.Character, bool) {
	entry, ok := id.GetEntry()
	if !ok || entry != algalonEntry {
		return nil, false
	}

	return &algalonCharacter{
		Common:      characters.NewCommonCharacter(id, all),
		all:         all,
		defeat:      characters.NewScriptedDefeatDetector(id, algalonDefeatConfig()),
		seenPlayers: make(map[guid.GUID]struct{}),
		deadPlayers: make(map[guid.GUID]struct{}),
	}, true
}

func (c *algalonCharacter) Process(m messages.Message) error {
	wasActive := c.IsActive()
	if err := c.Common.Process(m); err != nil {
		return err
	}
	c.observePlayerState(m)

	if wasActive && !c.IsActive() {
		c.endAdds(m)
		return nil
	}
	if c.IsActive() && c.ContainsMe(m.Affects()...) {
		c.keepAddsLinked(m)
	}

	signal, defeated := c.defeat.Observe(m, c.IsActive())
	// Algalon removes a similar burst of debuffs when resetting after a wipe.
	// The observed surrender is distinguished by raid members still being alive.
	if !defeated || signal != characters.ScriptedDefeatAuraCleanup || !c.hasLivingPlayer() {
		return nil
	}

	c.Died("algalon_defeated_"+string(signal), m)
	return nil
}

func (c *algalonCharacter) Died(reason string, m messages.Message) {
	c.Common.Died(reason, m)
	c.endAdds(m)
}

func (c *algalonCharacter) Start(reason string, m messages.Message) {
	clear(c.seenPlayers)
	clear(c.deadPlayers)
	c.defeat.Reset()
	c.Common.Start(reason, m)
}

func (c *algalonCharacter) observePlayerState(m messages.Message) {
	for _, id := range m.Affects() {
		if id.IsPlayer() {
			c.seenPlayers[id] = struct{}{}
		}
	}

	switch event := m.(type) {
	case *messages.Slain:
		if event.Victim.IsPlayer() {
			c.deadPlayers[event.Victim] = struct{}{}
		}
	case *messages.Resurrection:
		if event.Target.IsPlayer() {
			delete(c.deadPlayers, event.Target)
		}
	}
}

func (c *algalonCharacter) hasLivingPlayer() bool {
	for id := range c.seenPlayers {
		if _, dead := c.deadPlayers[id]; !dead {
			return true
		}
	}
	return false
}

func (c *algalonCharacter) keepAddsLinked(m messages.Message) {
	for _, entry := range algalonAddEntries {
		for _, add := range c.all.ByEntry[entry] {
			base, ok := add.(characters.CharacterBase)
			if !ok || base.LastEndState() == period.EndStateSlain {
				continue
			}
			if base.IsActive() {
				base.Bump("algalon_linked_activity", m)
			} else if len(base.Periods()) > 0 {
				base.Start("algalon_linked_activity", m)
			}
		}
	}
}

func (c *algalonCharacter) endAdds(m messages.Message) {
	for _, entry := range algalonAddEntries {
		for _, add := range c.all.ByEntry[entry] {
			base, ok := add.(characters.CharacterBase)
			if !ok || !base.IsActive() {
				continue
			}
			base.End("algalon_encounter_complete", m, period.EndStateReset)
		}
	}
}
