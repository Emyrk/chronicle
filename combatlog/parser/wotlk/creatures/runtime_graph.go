package creatures

import (
	"fmt"
	"github.com/Emyrk/chronicle/combatlog/parser/common/characters/period"
)

func (c *attumenTheHuntsman) validateGraph() error {
	if c.Common == nil {
		return fmt.Errorf("missing attumenTheHuntsman base")
	}
	if c.Lookup() != c.all {
		return fmt.Errorf("expansion lookup alias mismatch")
	}
	return nil
}
func (c *malygosPhaseTwoAdd) validateGraph() error {
	if c.Common == nil {
		return fmt.Errorf("missing malygosPhaseTwoAdd base")
	}
	if c.Lookup() != c.all {
		return fmt.Errorf("expansion lookup alias mismatch")
	}
	return nil
}
func (c *halionCharacter) validateGraph() error {
	if c.Common == nil {
		return fmt.Errorf("missing halionCharacter base")
	}
	if c.Lookup() != c.all {
		return fmt.Errorf("expansion lookup alias mismatch")
	}
	return nil
}
func (c *razorscaleAdd) validateGraph() error {
	if c.Common == nil {
		return fmt.Errorf("missing razorscaleAdd base")
	}
	if c.Lookup() != c.all {
		return fmt.Errorf("expansion lookup alias mismatch")
	}
	return nil
}
func (c *gunshipBattleCharacter) validateGraph() error {
	if c.Common == nil {
		return fmt.Errorf("missing gunshipBattleCharacter base")
	}
	if c.Lookup() != c.all {
		return fmt.Errorf("expansion lookup alias mismatch")
	}
	return nil
}
func (c *valithriaDreamwalkerCharacter) validateGraph() error {
	if c.Common == nil {
		return fmt.Errorf("missing valithriaDreamwalkerCharacter base")
	}
	if c.Lookup() != c.all {
		return fmt.Errorf("expansion lookup alias mismatch")
	}
	return nil
}
func (c *coilfangGuardian) validateGraph() error {
	if c.Common == nil {
		return fmt.Errorf("missing coilfangGuardian base")
	}
	if c.Lookup() != c.all {
		return fmt.Errorf("expansion lookup alias mismatch")
	}
	return nil
}
func (c *kologarnCharacter) validateGraph() error {
	if c.Common == nil {
		return fmt.Errorf("missing kologarnCharacter base")
	}
	if e := c.defeat.ValidateGraphBinding(c.ID(), c.Lookup()); e != nil {
		return e
	}
	return nil
}
func (c *kologarnCharacter) WireGraphPeriodHook(h period.Hook) {
	if c.defeat != nil {
		c.defeat.WireParticipantRuntime()
	}
	c.Common.WireGraphPeriodHook(h)
}
func (c *hodirCharacter) validateGraph() error {
	if c.Common == nil {
		return fmt.Errorf("missing hodirCharacter base")
	}
	if e := c.defeat.ValidateGraphBinding(c.ID(), c.Lookup()); e != nil {
		return e
	}
	return nil
}
func (c *hodirCharacter) WireGraphPeriodHook(h period.Hook) {
	if c.defeat != nil {
		c.defeat.WireParticipantRuntime()
	}
	c.Common.WireGraphPeriodHook(h)
}
func (c *freyaCharacter) validateGraph() error {
	if c.Common == nil {
		return fmt.Errorf("missing freyaCharacter base")
	}
	if e := c.defeat.ValidateGraphBinding(c.ID(), c.Lookup()); e != nil {
		return e
	}
	return nil
}
func (c *freyaCharacter) WireGraphPeriodHook(h period.Hook) {
	if c.defeat != nil {
		c.defeat.WireParticipantRuntime()
	}
	c.Common.WireGraphPeriodHook(h)
}
func (c *algalonCharacter) validateGraph() error {
	if c.Common == nil {
		return fmt.Errorf("missing algalonCharacter base")
	}
	if c.Lookup() != c.all {
		return fmt.Errorf("expansion lookup alias mismatch")
	}
	if e := c.defeat.ValidateGraphBinding(c.ID(), c.Lookup()); e != nil {
		return e
	}
	return nil
}
func (c *algalonCharacter) WireGraphPeriodHook(h period.Hook) {
	if c.defeat != nil {
		c.defeat.WireParticipantRuntime()
	}
	c.Common.WireGraphPeriodHook(h)
}
func (c *assemblyOfIronCharacter) validateGraph() error {
	if c.Common == nil {
		return fmt.Errorf("missing assemblyOfIronCharacter base")
	}
	if c.Lookup() != c.all {
		return fmt.Errorf("expansion lookup alias mismatch")
	}
	entry, ok := c.ID().GetEntry()
	if !ok || entry != c.entry {
		return fmt.Errorf("expansion entry mismatch")
	}
	return nil
}
func (c *ladyDeathwhisperCharacter) validateGraph() error {
	if c.Common == nil {
		return fmt.Errorf("missing ladyDeathwhisperCharacter base")
	}
	if c.Lookup() != c.all {
		return fmt.Errorf("expansion lookup alias mismatch")
	}
	return nil
}
func (c *professorPutricideCharacter) validateGraph() error {
	if c.Common == nil {
		return fmt.Errorf("missing professorPutricideCharacter base")
	}
	if c.Lookup() != c.all {
		return fmt.Errorf("expansion lookup alias mismatch")
	}
	return nil
}
func (c *sindragosaCharacter) validateGraph() error {
	if c.Common == nil {
		return fmt.Errorf("missing sindragosaCharacter base")
	}
	if c.Lookup() != c.all {
		return fmt.Errorf("expansion lookup alias mismatch")
	}
	return nil
}
func (c *lichKingCharacter) validateGraph() error {
	if c.Common == nil {
		return fmt.Errorf("missing lichKingCharacter base")
	}
	if c.Lookup() != c.all {
		return fmt.Errorf("expansion lookup alias mismatch")
	}
	return nil
}
func (c *mimironCharacter) validateGraph() error {
	if c.Common == nil {
		return fmt.Errorf("missing mimironCharacter base")
	}
	if c.Lookup() != c.all {
		return fmt.Errorf("expansion lookup alias mismatch")
	}
	entry, ok := c.ID().GetEntry()
	if !ok || entry != c.entry {
		return fmt.Errorf("expansion entry mismatch")
	}
	if c.state == nil || c.state.characters[c.ID()] != c {
		return fmt.Errorf("party member alias mismatch")
	}
	if mimironRoleForEntry(c.entry) != c.role {
		return fmt.Errorf("mimiron role mismatch")
	}
	shared, ok := c.all.Load(mimironStateKey)
	if !ok || shared != c.state {
		return fmt.Errorf("shared party alias mismatch")
	}

	return nil
}
func (c *mimironState) validateGraph() error {
	for id, member := range c.characters {
		if member == nil || member.ID() != id || member.state != c {
			return fmt.Errorf("party map identity mismatch")
		}
	}
	if !c.phaseSource.IsZero() && c.characters[c.phaseSource] == nil {
		return fmt.Errorf("phase source missing from party")
	}

	return nil
}
func (c *thorimCharacter) validateGraph() error {
	if c.RoomMechanic == nil {
		return fmt.Errorf("missing thorimCharacter base")
	}
	if c.Lookup() != c.all {
		return fmt.Errorf("expansion lookup alias mismatch")
	}
	entry, ok := c.ID().GetEntry()
	if !ok || entry != c.entry {
		return fmt.Errorf("expansion entry mismatch")
	}
	if c.state == nil || c.state.characters[c.ID()] != c {
		return fmt.Errorf("party member alias mismatch")
	}
	if (c.entry == thorimEntry) != (c.defeat != nil) {
		return fmt.Errorf("thorim detector presence mismatch")
	}
	if c.defeat != nil {
		if e := c.defeat.ValidateGraphBinding(c.ID(), c.Lookup()); e != nil {
			return e
		}
	}
	shared, ok := c.all.Load(thorimStateKey)
	if !ok || shared != c.state {
		return fmt.Errorf("shared party alias mismatch")
	}

	return nil
}
func (c *thorimCharacter) WireGraphPeriodHook(h period.Hook) {
	if c.defeat != nil {
		c.defeat.WireParticipantRuntime()
	}
	c.RoomMechanic.WireGraphPeriodHook(h)
}
func (c *thorimState) validateGraph() error {
	for id, member := range c.characters {
		if member == nil || member.ID() != id || member.state != c {
			return fmt.Errorf("party map identity mismatch")
		}
	}
	if !c.phaseSource.IsZero() && c.characters[c.phaseSource] == nil {
		return fmt.Errorf("phase source missing from party")
	}

	return nil
}
func (c *reliquaryCharacter) validateGraph() error {
	if c.RoomMechanic == nil {
		return fmt.Errorf("missing reliquaryCharacter base")
	}
	if c.Lookup() != c.all {
		return fmt.Errorf("expansion lookup alias mismatch")
	}
	if c.state == nil || c.state.characters[c.ID()] != c {
		return fmt.Errorf("party member alias mismatch")
	}
	shared, ok := c.all.Load(reliquaryStateKey)
	if !ok || shared != c.state {
		return fmt.Errorf("shared party alias mismatch")
	}

	return nil
}
func (c *reliquaryState) validateGraph() error {
	for id, member := range c.characters {
		if member == nil || member.ID() != id || member.state != c {
			return fmt.Errorf("party map identity mismatch")
		}
	}
	if !c.phaseSource.IsZero() && c.characters[c.phaseSource] == nil {
		return fmt.Errorf("phase source missing from party")
	}

	return nil
}
func (c *kaelThasCharacter) validateGraph() error {
	if c.RoomMechanic == nil {
		return fmt.Errorf("missing kaelThasCharacter base")
	}
	if c.Lookup() != c.all {
		return fmt.Errorf("expansion lookup alias mismatch")
	}
	if c.state == nil || c.state.characters[c.ID()] != c {
		return fmt.Errorf("party member alias mismatch")
	}
	shared, ok := c.all.Load(kaelThasStateKey)
	if !ok || shared != c.state {
		return fmt.Errorf("shared party alias mismatch")
	}

	return nil
}
func (c *kaelThasState) validateGraph() error {
	for id, member := range c.characters {
		if member == nil || member.ID() != id || member.state != c {
			return fmt.Errorf("party map identity mismatch")
		}
	}
	if !c.phaseSource.IsZero() && c.characters[c.phaseSource] == nil {
		return fmt.Errorf("phase source missing from party")
	}

	return nil
}
func (c *yoggSaronCharacter) validateGraph() error {
	if c.Common == nil {
		return fmt.Errorf("missing yoggSaronCharacter base")
	}
	if c.Lookup() != c.all {
		return fmt.Errorf("expansion lookup alias mismatch")
	}
	entry, ok := c.ID().GetEntry()
	if !ok || entry != c.entry {
		return fmt.Errorf("expansion entry mismatch")
	}
	if c.state == nil || c.state.characters[c.ID()] != c {
		return fmt.Errorf("party member alias mismatch")
	}
	shared, ok := c.all.Load(yoggSaronStateKey)
	if !ok || shared != c.state {
		return fmt.Errorf("shared party alias mismatch")
	}

	return nil
}
func (c *yoggSaronState) validateGraph() error {
	for id, member := range c.characters {
		if member == nil || member.ID() != id || member.state != c {
			return fmt.Errorf("party map identity mismatch")
		}
	}
	if c.currentSara != nil && (c.characters[c.currentSara.ID()] != c.currentSara || !c.currentSara.isSara()) {
		return fmt.Errorf("current Sara alias mismatch")
	}
	if !c.phaseSource.IsZero() && c.characters[c.phaseSource] == nil {
		return fmt.Errorf("phase source missing from party")
	}

	return nil
}
func (c *yoggSaronGuardian) validateGraph() error {
	if c.Common == nil {
		return fmt.Errorf("missing yoggSaronGuardian base")
	}
	if c.state == nil {
		return fmt.Errorf("missing yogg state")
	}
	return nil
}
func (c *LogBased) validateGraph() error {
	if c.Base == nil || c.Unstartable == nil || c.CharacterBase != c {
		return fmt.Errorf("LogBased self-cycle mismatch")
	}
	return nil
}
func (c *Unstartable) validateGraph() error {
	if c.CharacterBase == nil {
		return fmt.Errorf("missing Unstartable owner")
	}
	if _, ok := c.CharacterBase.(interface{ WireGraphPeriodHook(period.Hook) }); !ok {
		return fmt.Errorf("unsupported Unstartable period owner")
	}
	return nil
}
func (c *LogBased) WireGraphPeriodHook(h period.Hook) { c.Base.WireGraphPeriodHook(h) }
func (c *Unstartable) WireGraphPeriodHook(h period.Hook) {
	c.CharacterBase.(interface{ WireGraphPeriodHook(period.Hook) }).WireGraphPeriodHook(h)
}
