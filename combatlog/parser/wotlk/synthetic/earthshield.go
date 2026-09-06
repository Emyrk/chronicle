package synthetic

import (
	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/types"
	"github.com/Emyrk/chronicle/database/gamedb/chrondbc"
)

const earthShieldHealSpellID chrondbc.SpellID = 379

var earthShieldAuraSpellIDs = map[chrondbc.SpellID]struct{}{
	974:   {},
	32593: {},
	32594: {},
}

type earthShieldOwner struct {
	caster  guid.GUID
	spellID chrondbc.SpellID
}

type earthShieldAttribution struct {
	owners map[guid.GUID]earthShieldOwner
}

func newEarthShieldAttribution() *earthShieldAttribution {
	return &earthShieldAttribution{owners: make(map[guid.GUID]earthShieldOwner)}
}

func (e *earthShieldAttribution) ProcessMessages(msgs []messages.Message) []messages.Message {
	for _, msg := range msgs {
		switch typed := msg.(type) {
		case *messages.SpellGo:
			if typed.SpellData == nil || typed.Target == nil || typed.Caster.IsZero() {
				continue
			}
			if _, ok := earthShieldAuraSpellIDs[typed.SpellData.ID]; !ok {
				continue
			}
			e.owners[*typed.Target] = earthShieldOwner{caster: typed.Caster, spellID: typed.SpellData.ID}
		case *messages.Aura:
			if typed.SpellData == nil {
				continue
			}
			if _, ok := earthShieldAuraSpellIDs[typed.SpellData.ID]; !ok {
				continue
			}

			if typed.State == types.AuraStateRemoved {
				owner, ok := e.owners[typed.Target]
				if ok && owner.spellID == typed.SpellData.ID && (typed.Source == nil || owner.caster == *typed.Source) {
					delete(e.owners, typed.Target)
				}
				continue
			}
			if typed.Source != nil && (typed.Transition == messages.AuraTransitionApplied || typed.Transition == messages.AuraTransitionRefreshed) {
				e.owners[typed.Target] = earthShieldOwner{caster: *typed.Source, spellID: typed.SpellData.ID}
			}
		case *messages.Heal:
			if typed.SpellData == nil || typed.SpellData.ID != earthShieldHealSpellID {
				continue
			}
			if owner, ok := e.owners[typed.Target]; ok {
				typed.Caster = owner.caster
			}
		}
	}
	return msgs
}
