package instances

import (
	"strconv"
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/common/encounter"
	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
)

type freyaTreeObservation struct {
	at    time.Time
	elder uint32
	// Essence evidence must target a participating Freya. Drained of Power
	// is emitted by nonparticipating elders, so has no boss target.
	boss guid.GUID
}

type freyaVariantEvidence struct{ observations []freyaTreeObservation }

func freyaElder(id guid.GUID) uint32 {
	entry, _ := id.GetEntry()
	switch entry {
	case 32913, 33392:
		return 32913 // Ironbranch
	case 32914, 33393:
		return 32914 // Stonebark
	case 32915, 33391:
		return 32915 // Brightleaf
	}
	return 0
}

func (e *freyaVariantEvidence) ProcessMessage(msg messages.Message) error {
	if msg.IsSynthetic() {
		return nil
	}
	var elder uint32
	var boss guid.GUID
	switch m := msg.(type) {
	case *messages.SpellGo:
		if m.SpellID != 62467 || (m.Target != nil && *m.Target != m.Caster) {
			return nil
		}
		elder = freyaElder(m.Caster)
	case *messages.Aura:
		// Corpse removals never erase evidence, nor prove an application.
		if m.Transition != messages.AuraTransitionApplied {
			return nil
		}
		if m.SpellID == 62467 {
			if m.Source == nil || *m.Source != m.Target {
				return nil
			}
			elder = freyaElder(m.Target)
		} else {
			entry, _ := m.Target.GetEntry()
			if entry != 32906 && entry != 33360 {
				return nil
			}
			switch m.SpellID {
			case 62385:
				elder = 32915
			case 62386:
				elder = 32914
			default:
				return nil
			}
			boss = m.Target
		}
	default:
		return nil
	}
	if elder != 0 {
		e.observations = append(e.observations, freyaTreeObservation{at: msg.Date(), elder: elder, boss: boss})
	}
	return nil
}

func (e *freyaVariantEvidence) variant(enc encounter.Encounter) string {
	start := enc.Combat.Start
	if start.IsZero() || !enc.Combat.End.After(start) {
		return ""
	}
	// As with XT and Vezax, only the final boss activity belongs to a kill
	// when sparse same-GUID retries have been grouped into one encounter.
	for id, hostile := range enc.Combat.Hostiles {
		entry, _ := id.GetEntry()
		if (entry == 32906 || entry == 33360) && len(hostile.Activity) > 0 {
			latest := hostile.Activity[len(hostile.Activity)-1]
			if latest.Start != nil && latest.Start.Timestamp.Date().After(start) {
				start = latest.Start.Timestamp.Date()
			}
		}
	}
	trees := map[uint32]bool{}
	for _, o := range e.observations {
		if o.at.Before(start) || o.at.After(enc.Combat.End) {
			continue
		}
		if o.boss != 0 {
			if _, participating := enc.Combat.Hostiles[o.boss]; !participating {
				continue
			}
		}
		trees[o.elder] = true
	}
	// Absence is explicitly zero for a valid finalized kill; no prior encounter
	// coverage heuristic. Identity union deduplicates spells, GUIDs and aliases.
	return "trees_" + strconv.Itoa(len(trees))
}
