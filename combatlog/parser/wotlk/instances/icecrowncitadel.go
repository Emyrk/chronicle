package instances

import (
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
)

const (
	professorPutricideEntry   = 36678
	orgrimsHammerEntry        = 37215
	theSkybreakerEntry        = 37540
	dreamwalkersRageSpellID   = 71189
	gunshipVictorySuppression = 3 * time.Minute
)

var gunshipActivityEntries = map[uint32]struct{}{
	36838: {}, 36839: {}, 36939: {}, 36948: {}, 36950: {}, 36957: {},
	36960: {}, 36961: {}, 36968: {}, 36969: {}, 36978: {}, 36982: {},
	36998: {}, 37003: {}, 37004: {}, 37016: {}, 37017: {}, 37021: {},
	37026: {}, 37027: {}, 37028: {}, 37030: {}, 37031: {}, 37032: {},
	37033: {}, 37035: {}, 37116: {}, 37117: {}, 37144: {}, 37148: {},
	37215: {}, 37540: {}, 37920: {},
}

type icecrownScriptedActivity struct {
	gunshipVictoryAt time.Time
}

func (p *icecrownScriptedActivity) ProcessMessage(msg messages.Message) error {
	damage, ok := msg.(*messages.Damage)
	if !ok {
		return nil
	}

	if entry, ok := damage.Target.GetEntry(); ok && damage.Overkill > 0 && (entry == orgrimsHammerEntry || entry == theSkybreakerEntry) {
		p.gunshipVictoryAt = damage.Date()
	}
	if !p.gunshipVictoryAt.IsZero() {
		sinceVictory := damage.Date().Sub(p.gunshipVictoryAt)
		if sinceVictory >= 0 && sinceVictory < gunshipVictorySuppression {
			for _, unit := range damage.Affects() {
				entry, ok := unit.GetEntry()
				if _, linked := gunshipActivityEntries[entry]; ok && linked {
					damage.MarkActivityIgnore("gunship scripted victory", unit)
				}
			}
		}
	}

	if damage.SpellID == dreamwalkersRageSpellID {
		if damage.Caster != nil {
			damage.MarkActivityIgnore("valithria scripted victory", *damage.Caster)
		}
		damage.MarkActivityIgnore("valithria scripted victory", damage.Target)
		return nil
	}

	if damage.Caster == nil || damage.SpellName == nil {
		return nil
	}
	entry, ok := damage.Caster.GetEntry()
	if !ok || entry != professorPutricideEntry {
		return nil
	}

	// Putricide attacks the raid from his balcony during Festergut and Rotface.
	// Those casts are mechanics of the active encounter, not a Putricide pull.
	switch *damage.SpellName {
	case "Malleable Goo", "Vile Gas":
		damage.MarkActivityIgnore("putricide balcony mechanic", *damage.Caster)
	}
	return nil
}
