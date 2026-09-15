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
	pending map[auraOwnershipKey][]pendingAuraCast
}

func newAuraOwnership() *auraOwnership {
	return &auraOwnership{pending: make(map[auraOwnershipKey][]pendingAuraCast)}
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
	queue := a.pending[key]

	// A single cast can emit one AURA_CAST per effect. Collapse exact duplicate
	// ownership evidence while retaining distinct casts in arrival order.
	if len(queue) > 0 {
		last := queue[len(queue)-1]
		if last.caster == msg.Caster && last.at.Equal(msg.Date()) {
			return
		}
	}

	a.pending[key] = append(queue, pendingAuraCast{
		caster: msg.Caster,
		at:     msg.Date(),
	})
}

func (a *auraOwnership) correlate(msg *messages.Aura) {
	if msg.Source != nil || msg.SpellData == nil || msg.State != types.AuraStateAdded {
		return
	}

	key := auraOwnershipKey{target: msg.Target, spellID: msg.SpellData.ID}
	queue := a.pending[key]
	if len(queue) == 0 {
		return
	}

	pending := queue[0]
	delta := msg.Date().Sub(pending.at)
	if delta < 0 || delta > auraCastCorrelationWindow {
		return
	}

	if len(queue) == 1 {
		delete(a.pending, key)
	} else {
		a.pending[key] = queue[1:]
	}

	caster := pending.caster
	msg.Source = &caster
	msg.Transition = messages.AuraTransitionApplied
}

func (a *auraOwnership) expire(now time.Time) {
	for key, queue := range a.pending {
		firstValid := 0
		for firstValid < len(queue) && now.Sub(queue[firstValid].at) > auraCastCorrelationWindow {
			firstValid++
		}

		switch {
		case firstValid == len(queue):
			delete(a.pending, key)
		case firstValid > 0:
			a.pending[key] = queue[firstValid:]
		}
	}
}
