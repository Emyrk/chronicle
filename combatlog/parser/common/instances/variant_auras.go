package instances

import (
	"slices"
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/common/auras"
	"github.com/Emyrk/chronicle/combatlog/parser/common/encounter"
	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/types"
)

// Retain evidence, not another aura state machine. The parse-wide tracker owns
// applications, removals, expiry, and authoritative snapshot reconciliation.
type variantAuraObservation struct {
	at    time.Time
	spell int32
}

func variantAuraSpellSet(ids []int32) map[int32]struct{} {
	out := make(map[int32]struct{}, len(ids))
	for _, id := range ids {
		out[id] = struct{}{}
	}
	return out
}

func (h *Hookable) observeVariantAuras(tracker *auras.Tracking) {
	if len(h.variantAuraSpells) == 0 {
		return
	}
	tracker.AddObserver(func(n auras.Notification) {
		if h.finalizing || h.finalized || !h.FightActive() || !n.Unit.IsPlayer() {
			return
		}
		switch n.Type {
		case auras.NotifyAdded, auras.NotifyRefreshed, auras.NotifyStackChanged:
			h.recordVariantAura(n.Timestamp, int32(n.SpellID))
		}
	})
}

func (h *Hookable) recordVariantAura(at time.Time, spell int32) {
	if _, watched := h.variantAuraSpells[spell]; !watched {
		return
	}
	id := h.currentFight.EncounterID
	h.variantAuraEvidence[id] = append(h.variantAuraEvidence[id], variantAuraObservation{at: at, spell: spell})
}

func (h *Hookable) snapshotVariantAuras(first messages.Message) {
	if h.Auras == nil || len(h.variantAuraSpells) == 0 {
		return
	}
	at := first.Date()
	h.Auras.ExpireStale(at)
	for unit, spells := range h.Auras.SnapshotAll() {
		if !unit.IsPlayer() {
			continue
		}
		for spell := range spells {
			// Hooks run before canonical state processes this message. A removal
			// starting the fight is not positive evidence of an active-at-pull aura.
			if removal, ok := first.(*messages.Aura); ok && removal.State == types.AuraStateRemoved && removal.Target == unit && removal.SpellData != nil && removal.SpellData.ID == spell {
				continue
			}
			h.recordVariantAura(at, int32(spell))
		}
	}
}

func (h *Hookable) variantAurasDuring(fight encounter.Fight) []int32 {
	if h.Auras == nil {
		return nil
	}
	seen := map[int32]struct{}{}
	for _, observation := range h.variantAuraEvidence[fight.EncounterID] {
		if !observation.at.Before(fight.Start) && !observation.at.After(fight.End) {
			seen[observation.spell] = struct{}{}
		}
	}
	out := make([]int32, 0, len(seen))
	for spell := range seen {
		out = append(out, spell)
	}
	slices.Sort(out)
	return out
}
