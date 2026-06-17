package creatures

import (
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/common/characters"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/types"
	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
)

// CoreHound can be damaged after death, and can come back to life.
type CoreHound struct {
	*characters.Common
}

func NewCoreHoundCharacter(id guid.GUID, all *characters.Characters) (characters.Character, bool) {
	if !id.IsCreature() {
		return nil, false
	}

	if entry, ok := id.GetEntry(); !ok || entry != 11671 {
		return nil, false
	}

	c := characters.NewCommonCharacter(id, all)
	c.SetRecentlySlainDuration(time.Second * 10)
	return &CoreHound{
		Common: c,
	}, true
}

func (c *CoreHound) Process(m messages.Message) error {
	switch data := m.(type) {
	case *messages.Aura:
		if data.Target == c.ID() {
			// Auras are causing issues
			return nil
		}
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

			if data.Caster != nil && data.Caster.IsObject() {
				// Hunter traps apparently can do damage through the Corehound's dead body, but they are resisted. Ignore those as well.
				if t.Amount != nil && *t.Amount > 0 && t.HitType.Has(types.HitTypePartialResist) {
					return nil
				}
			}
		}

		// This is a niche scenario, but explosive traps can damage through the core
		// hound's dead body. Just toss these out. This does include actual valid damage
		// when the core hound is alive, but this is just easier. If a fight actually
		// starts with a trap, then this message would incorrectly be ignored, but that
		// seems unlikely.
		if data.Target == c.ID() && data.SpellData != nil {
			switch data.SpellData.ID {
			case 14315:
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
