package creatures

import (
	"github.com/Emyrk/chronicle/combatlog/parser/common/characters"
	"github.com/Emyrk/chronicle/combatlog/parser/common/characters/period"
	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
)

const (
	algalonEntry                   = 32871
	algalonSurrenderHealthPercent  = 95
	algalonMinimumSurvivingPlayers = 2
)

var algalonAddEntries = []uint32{
	32953, // Black Hole
	32955, // Collapsing Star
	33052, // Living Constellation
	33089, // Dark Matter
	34221, // Dark Matter (alternate entry)
}

type algalonCharacter struct {
	*characters.Common
	all            *characters.Characters
	defeat         *characters.ScriptedDefeatDetector
	seenPlayers    map[guid.GUID]struct{}
	deadPlayers    map[guid.GUID]struct{}
	incomingDamage int64
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
	c.observeIncomingDamage(m)

	if wasActive && !c.IsActive() {
		c.endAdds(m)
		return nil
	}
	if c.IsActive() && c.ContainsMe(m.Affects()...) {
		c.keepAddsLinked(m)
	}

	signal, defeated := c.defeat.Observe(m, c.IsActive())
	// Algalon removes a similar burst of debuffs when resetting after a wipe.
	// Confirm the boss is near defeat and enough of the observed raid survived.
	if !defeated || signal != characters.ScriptedDefeatAuraCleanup || !c.surrenderConfirmed() {
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
	if !c.IsActive() {
		clear(c.seenPlayers)
		clear(c.deadPlayers)
		c.incomingDamage = 0
		c.defeat.Reset()
	}
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

func (c *algalonCharacter) observeIncomingDamage(m messages.Message) {
	damage, ok := m.(*messages.Damage)
	if !ok || damage.Target != c.ID() || damage.Amount <= 0 {
		return
	}
	c.incomingDamage += int64(damage.Amount)
}

func (c *algalonCharacter) surrenderConfirmed() bool {
	livingPlayers := len(c.seenPlayers) - len(c.deadPlayers)
	if livingPlayers < algalonMinimumSurvivingPlayers {
		return false
	}

	info, ok := c.Info()
	if ok && info.MaxHealth > 0 {
		return c.incomingDamage*100 >= info.MaxHealth*algalonSurrenderHealthPercent
	}

	// Older logs may lack maximum-health metadata. Require a surviving majority
	// so one missing death event cannot turn a wipe cleanup into a kill.
	return livingPlayers*2 > len(c.seenPlayers)
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
