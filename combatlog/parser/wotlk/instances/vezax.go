package instances

import (
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/common/encounter"
	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
)

type vezaxDeathEvidence struct {
	at   time.Time
	unit guid.GUID
}

// Retain only real deaths. Despawns and synthetic encounter cleanup do not
// prove a Vapor or Animus kill. Both raid-size entries are supported.
type vezaxVariantEvidence struct{ deaths []vezaxDeathEvidence }

func (e *vezaxVariantEvidence) ProcessMessage(msg messages.Message) error {
	slain, ok := msg.(*messages.Slain)
	if !ok || slain.IsSynthetic() {
		return nil
	}
	entry, ok := slain.Victim.GetEntry()
	if ok {
		switch entry {
		case 33271, 33449, 33488, 33789, 33524, 34152:
			e.deaths = append(e.deaths, vezaxDeathEvidence{at: slain.Date(), unit: slain.Victim})
		}
	}
	return nil
}

func (e *vezaxVariantEvidence) variant(enc encounter.Encounter) string {
	start := enc.Combat.Start
	if start.IsZero() || !enc.Combat.End.After(start) {
		return ""
	}
	// Same-GUID retries may share a grouped encounter. Only use evidence from
	// the boss's final activity period, not an earlier wipe or reset.
	for id, hostile := range enc.Combat.Hostiles {
		entry, _ := id.GetEntry()
		if (entry == 33271 || entry == 33449) && len(hostile.Activity) > 0 {
			latest := hostile.Activity[len(hostile.Activity)-1]
			if latest.Start != nil && latest.Start.Timestamp.Date().After(start) {
				start = latest.Start.Timestamp.Date()
			}
		}
	}
	var bossDeath, animusDeath time.Time
	vaporKilled := false
	for _, death := range e.deaths {
		if death.at.Before(start) || death.at.After(enc.Combat.End) {
			continue
		}
		entry, _ := death.unit.GetEntry()
		switch entry {
		case 33271, 33449:
			if _, participating := enc.Combat.Hostiles[death.unit]; participating {
				bossDeath = death.at
			}
		case 33488, 33789:
			vaporKilled = true
		case 33524, 34152:
			if animusDeath.IsZero() || death.at.Before(animusDeath) {
				animusDeath = death.at
			}
		}
	}
	// Positive normal evidence wins, even if an Animus death is also logged.
	if vaporKilled {
		return "normal"
	}
	if !animusDeath.IsZero() && !bossDeath.IsZero() && animusDeath.Before(bossDeath) {
		return "hard"
	}
	return ""
}
