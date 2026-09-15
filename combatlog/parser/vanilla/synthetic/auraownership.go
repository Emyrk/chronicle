package synthetic

import (
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/types"
	"github.com/Emyrk/chronicle/database/gamedb/chrondbc"
)

// auraCastCorrelationWindow is intentionally tight. In 1.12a CC v2 logs the
// AURA_CAST and corresponding BUFF_ADD/DEBUFF_ADD records are emitted a few
// milliseconds apart.
const auraCastCorrelationWindow = 25 * time.Millisecond

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

	a.pending[auraOwnershipKey{target: *msg.Target, spellID: msg.Spell.ID}] = pendingAuraCast{
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
	delete(a.pending, key)

	delta := msg.Date().Sub(pending.at)
	if delta < 0 || delta > auraCastCorrelationWindow {
		return
	}

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
