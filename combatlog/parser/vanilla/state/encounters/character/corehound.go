package character

import (
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/types"
	"github.com/Emyrk/chronicle/combatlog/parser/vanilla/messages"
)

// CoreHound can be damaged after death, and can come back to life.
type CoreHound struct {
	*Common
}

func NewCoreHoundCharacter(id guid.GUID, all *Characters) (Character, bool) {
	if !id.IsCreature() {
		return nil, false
	}

	if entry, ok := id.GetEntry(); !ok || entry != 11671 {
		return nil, false
	}

	return &CoreHound{
		Common: NewCommonCharacter(id, all),
	}, true
}

func (c *CoreHound) Process(m messages.Message) error {
	switch data := m.(type) {
	case *messages.Damage:
		// CoreHounds when they die can still be attacked, but all damage is resisted or
		// absorbed, resulting in 0 damage. This means the corehound is still dead. If we
		// ignore 0 damage events, then we all is fixed. If the corehound is revived,
		// then direct damage will correctly resurrect it.
		if data.Amount == 0 {
			return nil
		}

		// So apparently glancing blows can do some damage when the corehound is on the
		// ground? If there is an absorb, we just won't count that as activity. Absorbs
		// only happen in their dead state.
		for _, t := range data.Trailer {
			if t.Amount != nil && *t.Amount > 0 && t.HitType.Has(types.HitTypePartialAbsorb) {
				return nil
			}
		}
	}

	err := c.Common.Process(m)
	if err != nil {
		return err
	}

	return nil
}
