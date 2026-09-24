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
	owners map[guid.GUID]lifebloomOwner
}

func newLifebloomAttribution() *lifebloomAttribution {
	return &lifebloomAttribution{owners: make(map[guid.GUID]lifebloomOwner)}
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
			l.owners[*typed.Target] = lifebloomOwner{caster: typed.Caster, seenAt: typed.Date()}
		case *messages.Aura:
			if typed.SpellData == nil || typed.SpellData.ID != lifebloomAuraSpellID {
				continue
			}
			if typed.State == types.AuraStateRemoved {
				owner, ok := l.owners[typed.Target]
				if ok && (typed.Source == nil || owner.caster == *typed.Source) {
					delete(l.owners, typed.Target)
				}
				continue
			}
			if typed.Source != nil && !typed.Source.IsZero() {
				l.owners[typed.Target] = lifebloomOwner{caster: *typed.Source, seenAt: typed.Date()}
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
					l.owners[typed.Target] = lifebloomOwner{caster: typed.Caster, seenAt: typed.Date()}
				}
			case lifebloomHealSpellID:
				// Do not overwrite formats or servers that already report the
				// original caster correctly.
				if typed.Caster != typed.Target {
					continue
				}
				if owner, ok := l.owners[typed.Target]; ok {
					age := typed.Date().Sub(owner.seenAt)
					if age >= 0 && age <= lifebloomMaxAge {
						typed.Caster = owner.caster
					}
				}
			}
		}
	}
	return msgs
}
