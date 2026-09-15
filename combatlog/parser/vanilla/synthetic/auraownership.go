package synthetic

import (
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/types"
	"github.com/Emyrk/chronicle/database/gamedb/chrondbc"
)

// auraCastCorrelationWindow allows for the separate aura-slot update used by
// 1.12a CC v2 logs. Analysis of two real logs found that 100ms captures the
// normal update delay while rejecting the uncertain long tail.
const auraCastCorrelationWindow = 100 * time.Millisecond

type auraOwnershipKey struct {
	target  guid.GUID
	spellID chrondbc.SpellID
}

type pendingAuraCast struct {
	caster guid.GUID
	at     time.Time
}

type auraOwnership struct {
	pending map[auraOwnershipKey]pendingAuraCast
}

func newAuraOwnership() *auraOwnership {
	return &auraOwnership{pending: make(map[auraOwnershipKey]pendingAuraCast)}
}

// ProcessMessages enriches 1.12a Aura messages with caster evidence from the
// separate AURA_CAST record. It mutates the real Aura message rather than
// creating a synthetic lifecycle event.
func (a *auraOwnership) ProcessMessages(msgs []messages.Message) {
	for _, msg := range msgs {
		a.expire(msg.Date())

		switch typed := msg.(type) {
		case *messages.AuraCast:
			a.record(typed)
		case *messages.Aura:
			a.correlate(typed)
		}
	}
}

func (a *auraOwnership) record(msg *messages.AuraCast) {
	if msg.Spell == nil || msg.Target == nil || msg.Caster.IsZero() {
		return
	}

	key := auraOwnershipKey{target: *msg.Target, spellID: msg.Spell.ID}

	// A single cast can emit one AURA_CAST per effect. They all carry the same
	// ownership evidence. A later cast replaces the candidate so the latest
	// caster wins when multiple players apply the same aura to one target.
	a.pending[key] = pendingAuraCast{
		caster: msg.Caster,
		at:     msg.Date(),
	}
}

func (a *auraOwnership) correlate(msg *messages.Aura) {
	if msg.Source != nil || msg.SpellData == nil || msg.State != types.AuraStateAdded {
		return
	}

	key := auraOwnershipKey{target: msg.Target, spellID: msg.SpellData.ID}
	pending, ok := a.pending[key]
	if !ok {
		return
	}

	delta := msg.Date().Sub(pending.at)
	if delta < 0 || delta > auraCastCorrelationWindow {
		return
	}

	// Keep the candidate until expiry because one cast can produce multiple
	// BUFF_ADD/DEBUFF_ADD records for different aura effects.
	caster := pending.caster
	msg.Source = &caster
	msg.Transition = messages.AuraTransitionApplied
}

func (a *auraOwnership) expire(now time.Time) {
	for key, pending := range a.pending {
		if now.Sub(pending.at) > auraCastCorrelationWindow {
			delete(a.pending, key)
		}
	}
}
