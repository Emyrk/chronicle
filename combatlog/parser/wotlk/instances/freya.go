package instances

import (
	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
)

var freyaEntries = map[uint32]struct{}{
	32906: {},
	33360: {},
}

// freyaPostDefeatActivity prevents delayed damage from reopening an encounter
// after Freya's scripted positive-overkill defeat. A respawn uses a new GUID,
// so a later legitimate attempt remains eligible to start normally.
type freyaPostDefeatActivity struct {
	defeated map[guid.GUID]struct{}
}

func (p *freyaPostDefeatActivity) ProcessMessage(msg messages.Message) error {
	damage, ok := msg.(*messages.Damage)
	if !ok {
		return nil
	}

	if _, defeated := p.defeated[damage.Target]; defeated {
		damage.MarkActivityIgnore("damage after Freya defeat", damage.Target)
	}
	if damage.Caster != nil {
		if _, defeated := p.defeated[*damage.Caster]; defeated {
			damage.MarkActivityIgnore("damage after Freya defeat", *damage.Caster)
		}
	}

	if damage.Overkill <= 0 || !isFreya(damage.Target) {
		return nil
	}
	if p.defeated == nil {
		p.defeated = make(map[guid.GUID]struct{})
	}
	p.defeated[damage.Target] = struct{}{}
	return nil
}

func isFreya(id guid.GUID) bool {
	entry, ok := id.GetEntry()
	if !ok {
		return false
	}
	_, ok = freyaEntries[entry]
	return ok
}
