package synthetic

import (
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/types"
	"github.com/Emyrk/chronicle/database/gamedb/chrondbc"
)

const (
	lifebloomAuraSpellID chrondbc.SpellID = 33763
	lifebloomHealSpellID chrondbc.SpellID = 33778
	lifebloomMaxAge                       = 10 * time.Second
)

type pendingLifebloom struct {
	caster guid.GUID
	castAt time.Time
}

type lifebloomAttribution struct {
	pendingByTarget map[guid.GUID][]pendingLifebloom
}

func newLifebloomAttribution() *lifebloomAttribution {
	return &lifebloomAttribution{pendingByTarget: make(map[guid.GUID][]pendingLifebloom)}
}

func (l *lifebloomAttribution) rememberCast(target, caster guid.GUID, castAt time.Time, refresh bool) {
	pending := l.pendingByTarget[target]
	for i := range pending {
		if pending[i].caster != caster {
			continue
		}
		if refresh {
			pending[i].castAt = castAt
		}
		l.pendingByTarget[target] = pending
		return
	}
	l.pendingByTarget[target] = append(pending, pendingLifebloom{caster: caster, castAt: castAt})
}

func (l *lifebloomAttribution) consumeCaster(target, caster guid.GUID) {
	pending := l.pendingByTarget[target]
	for i := range pending {
		if pending[i].caster != caster {
			continue
		}
		pending = append(pending[:i], pending[i+1:]...)
		if len(pending) == 0 {
			delete(l.pendingByTarget, target)
		} else {
			l.pendingByTarget[target] = pending
		}
		return
	}
}

func (l *lifebloomAttribution) consumeOldest(target guid.GUID, at time.Time) (guid.GUID, bool) {
	pending := l.pendingByTarget[target]
	oldest := -1
	for i := range pending {
		age := at.Sub(pending[i].castAt)
		if age < 0 || age > lifebloomMaxAge {
			continue
		}
		if oldest == -1 || pending[i].castAt.Before(pending[oldest].castAt) {
			oldest = i
		}
	}
	if oldest == -1 {
		delete(l.pendingByTarget, target)
		return 0, false
	}

	caster := pending[oldest].caster
	pending = append(pending[:oldest], pending[oldest+1:]...)
	if len(pending) == 0 {
		delete(l.pendingByTarget, target)
	} else {
		l.pendingByTarget[target] = pending
	}
	return caster, true
}

// ProcessMessages corrects native 2.4.3 Lifebloom bloom events. Those logs can
// report the recipient as the caster of spell 33778. Recent casts are retained
// until their delayed bloom is observed, while periodic ticks provide fallback
// evidence when the cast event is unavailable.
func (l *lifebloomAttribution) ProcessMessages(msgs []messages.Message) []messages.Message {
	for _, msg := range msgs {
		switch typed := msg.(type) {
		case *messages.SpellGo:
			if typed.SpellData == nil || typed.SpellData.ID != lifebloomAuraSpellID || typed.Target == nil || typed.Caster.IsZero() {
				continue
			}
			l.rememberCast(*typed.Target, typed.Caster, typed.Date(), true)
		case *messages.Aura:
			if typed.SpellData == nil || typed.SpellData.ID != lifebloomAuraSpellID {
				continue
			}
			if typed.State == types.AuraStateRemoved {
				// Native 2.4.3 aura removals commonly omit the source. Bloom events
				// consume pending casts directly, so an unattributed removal cannot
				// identify which pending cast should be removed.
				if typed.Source != nil {
					l.consumeCaster(typed.Target, *typed.Source)
				}
				continue
			}
			if typed.Source != nil && !typed.Source.IsZero() {
				l.rememberCast(typed.Target, *typed.Source, typed.Date(), true)
			}
		case *messages.Heal:
			if typed.SpellData == nil {
				continue
			}
			switch typed.SpellData.ID {
			case lifebloomAuraSpellID:
				// Periodic ticks provide a fallback when the aura event omitted its
				// source, as some 2.4.3 loggers do.
				if !typed.Caster.IsZero() && typed.Caster != typed.Target {
					l.rememberCast(typed.Target, typed.Caster, typed.Date(), false)
				}
			case lifebloomHealSpellID:
				// Some 2.4.3 blooms already report the original caster. Consume
				// that pending cast so a later self-sourced bloom can be matched to
				// the remaining recent cast.
				if typed.Caster != typed.Target {
					l.consumeCaster(typed.Target, typed.Caster)
					continue
				}
				if caster, ok := l.consumeOldest(typed.Target, typed.Date()); ok {
					typed.Caster = caster
				}
			}
		}
	}
	return msgs
}
