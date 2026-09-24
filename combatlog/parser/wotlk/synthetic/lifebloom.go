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

type lifebloomOwner struct {
	caster guid.GUID
	seenAt time.Time
}

type lifebloomAttribution struct {
	owners map[guid.GUID][]lifebloomOwner
}

func newLifebloomAttribution() *lifebloomAttribution {
	return &lifebloomAttribution{owners: make(map[guid.GUID][]lifebloomOwner)}
}

func (l *lifebloomAttribution) remember(target, caster guid.GUID, seenAt time.Time, refresh bool) {
	owners := l.owners[target]
	for i := range owners {
		if owners[i].caster != caster {
			continue
		}
		if refresh {
			owners[i].seenAt = seenAt
		}
		l.owners[target] = owners
		return
	}
	l.owners[target] = append(owners, lifebloomOwner{caster: caster, seenAt: seenAt})
}

func (l *lifebloomAttribution) remove(target, caster guid.GUID) {
	owners := l.owners[target]
	for i := range owners {
		if owners[i].caster != caster {
			continue
		}
		owners = append(owners[:i], owners[i+1:]...)
		if len(owners) == 0 {
			delete(l.owners, target)
		} else {
			l.owners[target] = owners
		}
		return
	}
}

func (l *lifebloomAttribution) popOldest(target guid.GUID, at time.Time) (guid.GUID, bool) {
	owners := l.owners[target]
	oldest := -1
	for i := range owners {
		age := at.Sub(owners[i].seenAt)
		if age < 0 || age > lifebloomMaxAge {
			continue
		}
		if oldest == -1 || owners[i].seenAt.Before(owners[oldest].seenAt) {
			oldest = i
		}
	}
	if oldest == -1 {
		delete(l.owners, target)
		return 0, false
	}

	caster := owners[oldest].caster
	owners = append(owners[:oldest], owners[oldest+1:]...)
	if len(owners) == 0 {
		delete(l.owners, target)
	} else {
		l.owners[target] = owners
	}
	return caster, true
}

// ProcessMessages corrects native 2.4.3 Lifebloom bloom events. Those logs
// report the recipient as the caster of spell 33778, while applications and
// periodic ticks retain the druid's GUID.
func (l *lifebloomAttribution) ProcessMessages(msgs []messages.Message) []messages.Message {
	for _, msg := range msgs {
		switch typed := msg.(type) {
		case *messages.SpellGo:
			if typed.SpellData == nil || typed.SpellData.ID != lifebloomAuraSpellID || typed.Target == nil || typed.Caster.IsZero() {
				continue
			}
			l.remember(*typed.Target, typed.Caster, typed.Date(), true)
		case *messages.Aura:
			if typed.SpellData == nil || typed.SpellData.ID != lifebloomAuraSpellID {
				continue
			}
			if typed.State == types.AuraStateRemoved {
				// Native 2.4.3 aura removals commonly omit the source. The bloom
				// consumes the matching owner immediately before that removal, so an
				// unattributed removal must not discard another druid's Lifebloom.
				if typed.Source != nil {
					l.remove(typed.Target, *typed.Source)
				}
				continue
			}
			if typed.Source != nil && !typed.Source.IsZero() {
				l.remember(typed.Target, *typed.Source, typed.Date(), true)
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
					l.remember(typed.Target, typed.Caster, typed.Date(), false)
				}
			case lifebloomHealSpellID:
				// Some 2.4.3 blooms already report the original caster. Consume
				// that caster's tracked application so a concurrent self-sourced
				// bloom can be matched to the remaining druid.
				if typed.Caster != typed.Target {
					l.remove(typed.Target, typed.Caster)
					continue
				}
				if owner, ok := l.popOldest(typed.Target, typed.Date()); ok {
					typed.Caster = owner
				}
			}
		}
	}
	return msgs
}
