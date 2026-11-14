package instances

import (
	"github.com/Emyrk/chronicle/combatlog/parser/common/encounter"
	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"time"
)

// Keep only observed transitions, not aura state or synthetic linked deaths.
// Finalized windows scope evidence to one attempt, including same-GUID retries.
type xtAuraEvidence struct {
	at         time.Time
	unit       guid.GUID
	heartBreak bool
	heartDeath bool
	transition messages.AuraTransition
}
type xtVariantEvidence struct{ observations []xtAuraEvidence }

func (e *xtVariantEvidence) ProcessMessage(msg messages.Message) error {
	if slain, ok := msg.(*messages.Slain); ok && !slain.IsSynthetic() {
		entry, valid := slain.Victim.GetEntry()
		if valid && (entry == 33329 || entry == 33995) {
			e.observations = append(e.observations, xtAuraEvidence{at: slain.Date(), unit: slain.Victim, heartDeath: true})
		}
		return nil
	}
	aura, ok := msg.(*messages.Aura)
	if !ok || aura.IsSynthetic() || aura.Source == nil || *aura.Source != aura.Target {
		return nil
	}
	entry, ok := aura.Target.GetEntry()
	if !ok {
		return nil
	}
	hard := aura.SpellID == 64193 && (entry == 33293 || entry == 33885)
	exposed := aura.SpellID == 63849 && (entry == 33329 || entry == 33995)
	if !hard && !exposed {
		return nil
	}
	if aura.Transition != messages.AuraTransitionApplied && aura.Transition != messages.AuraTransitionRemoved {
		return nil
	}
	e.observations = append(e.observations, xtAuraEvidence{at: aura.Date(), unit: aura.Target, heartBreak: hard, transition: aura.Transition})
	return nil
}

func (e *xtVariantEvidence) variant(enc encounter.Encounter) string {
	start := enc.Combat.Start
	// A sparse log can group multiple activity periods for the same boss GUID.
	// Never borrow a signal from its earlier timed-out/reset period.
	for id, hostile := range enc.Combat.Hostiles {
		entry, _ := id.GetEntry()
		if (entry == 33293 || entry == 33885) && len(hostile.Activity) > 0 {
			latest := hostile.Activity[len(hostile.Activity)-1]
			if latest.Start != nil && latest.Start.Timestamp.Date().After(start) {
				start = latest.Start.Timestamp.Date()
			}
		}
	}
	open := map[guid.GUID]bool{}
	closed := map[guid.GUID]int{}
	heartDied := false
	for _, o := range e.observations {
		if o.at.Before(start) || o.at.After(enc.Combat.End) {
			continue
		}
		if _, ok := enc.Combat.Hostiles[o.unit]; !ok {
			continue
		}
		if o.heartDeath {
			heartDied = true
			continue
		}
		if o.heartBreak {
			// Only the observed application proves hard mode; corpse fades do not.
			if o.transition == messages.AuraTransitionApplied {
				return "hard"
			}
			continue
		}
		if o.transition == messages.AuraTransitionApplied {
			open[o.unit] = true
		} else if open[o.unit] {
			closed[o.unit]++
			open[o.unit] = false
		}
	}
	// An observed heart death without the Heartbreak signal is ambiguous.
	// Linked activity cleanup never emits a raw Slain event and cannot set this.
	if heartDied {
		return ""
	}
	// Three complete exposed-heart phases are positive coverage of every normal
	// phase (75/50/25%). Missing phases never turn absence of Heartbreak into normal.
	for unit, count := range closed {
		if count == 3 && !open[unit] {
			return "normal"
		}
	}
	return ""
}
