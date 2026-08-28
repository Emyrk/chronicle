package creatures

import (
	"github.com/Emyrk/chronicle/combatlog/parser/common/characters"
	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
)

const (
	hodirEntry          uint32 = 32845
	hodirAlternateEntry uint32 = 32846
	hodirCreditSpell           = 64899
)

var hodirBossEntries = map[uint32]struct{}{
	hodirEntry:          {},
	hodirAlternateEntry: {},
}

type hodirCharacter struct {
	*characters.Common
}

func NewHodirEncounterCharacter(id guid.GUID, all *characters.Characters) (characters.Character, bool) {
	entry, ok := id.GetEntry()
	if !ok {
		return nil, false
	}
	if _, ok := hodirBossEntries[entry]; !ok {
		return nil, false
	}

	return &hodirCharacter{Common: characters.NewCommonCharacter(id, all)}, true
}

func (c *hodirCharacter) Process(m messages.Message) error {
	if err := c.Common.Process(m); err != nil {
		return err
	}

	switch event := m.(type) {
	case *messages.SpellGo:
		if event.Caster == c.ID() && isHodirDefeatCredit(event) {
			c.Died("hodir_defeated", event)
		}
	case *messages.Damage:
		// Keep the same fallback used by Thorim for servers that expose the
		// scripted surrender as an overkill hit instead of a credit spell.
		if event.Target == c.ID() && isHodirDefeatHit(event) {
			c.Died("hodir_defeated", event)
		}
	}

	return nil
}

func isHodirDefeatCredit(spell *messages.SpellGo) bool {
	if spell.Caster == 0 || spell.SpellData == nil || spell.SpellData.ID != hodirCreditSpell {
		return false
	}

	entry, ok := spell.Caster.GetEntry()
	return ok && isHodirBossEntry(entry)
}

func isHodirDefeatHit(damage *messages.Damage) bool {
	entry, ok := damage.Target.GetEntry()
	return ok && isHodirBossEntry(entry) && damage.Overkill > 0
}

func isHodirBossEntry(entry uint32) bool {
	_, ok := hodirBossEntries[entry]
	return ok
}
