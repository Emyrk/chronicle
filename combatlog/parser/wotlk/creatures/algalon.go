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
	if err := c.Common.Process(m); err != nil {
		return err
	}
	c.observePlayerState(m)

	signal, defeated := c.defeat.Observe(m, c.IsActive())
	// Algalon removes a similar burst of debuffs when resetting after a wipe.
	// The observed surrender is distinguished by raid members still being alive.
	if !defeated || signal != characters.ScriptedDefeatAuraCleanup || !c.hasLivingPlayer() {
		return nil
	}

	c.Died("algalon_defeated_"+string(signal), m)
	c.endAdds(m)
	return nil
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
