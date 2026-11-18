package synthetic

import (
	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/common/zoner"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/types/zone"
)

// moltenCore attributes Turtle's persistent Ragnaros hazards without letting
// their damage or casts keep a pull alive (including activity of their targets).
// Unlike VanillaPlus shadow bosses, these sources are environmental mechanics.
type moltenCore struct {
	inMoltenCore bool
	location     zoner.Location
	boss         guid.GUID
}

// ProcessMessages mutates attribution only when an actual boss has been seen.
// nolint: staticcheck // Cast is still emitted by older vanilla log formats.
func (s *moltenCore) ProcessMessages(msgs []messages.Message) {
	for _, msg := range msgs {
		switch m := msg.(type) {
		case *messages.Zone:
			if s.location.Process(*m) != zone.NoChange {
				s.boss = 0
			}
			s.inMoltenCore = s.location.MapID == 409 || s.location.Name == "Molten Core"
		case *messages.Realm, *messages.Versions:
			s.boss = 0
			s.inMoltenCore = false
			s.location = zoner.Location{}
		case *messages.EncounterBoundary:
			s.boss = 0
		case *messages.UnitEvade:
			if m.UnitGUID == s.boss {
				s.boss = 0
			}
		}
		if !s.inMoltenCore {
			continue
		}
		// Observe before rewriting. Direct boss events also update respawns when
		// UNIT_INFO is missing; objects and pets with colliding entry bits do not.
		for _, id := range msg.Affects() {
			if entry, valid := id.GetEntry(); valid && id.IsCreature() && entry == 11502 {
				if _, evaded := msg.(*messages.UnitEvade); !evaded {
					s.boss = id
				}
			}
		}
		var caster *guid.GUID
		var base *messages.MessageBase
		switch m := msg.(type) {
		case *messages.Damage:
			caster, base = m.Caster, &m.MessageBase
		case *messages.SpellGo:
			caster, base = &m.Caster, &m.MessageBase
		case *messages.SpellStart:
			caster, base = &m.Caster, &m.MessageBase
		case *messages.Cast:
			caster, base = &m.Caster.Gid, &m.MessageBase
		}
		if caster == nil {
			continue
		}
		entry, ok := caster.GetEntry()
		if !ok || !(caster.IsObject() && entry == 178088 || caster.IsCreature() && entry == 13148) {
			continue
		}
		// Mark before rewriting so the helper as well as every original participant
		// is ignored. Missing boss observations must not disable activity suppression.
		for _, id := range msg.Affects() {
			base.MarkActivityIgnore("persistent Ragnaros hazard", id)
		}
		if !s.boss.IsZero() {
			boss := s.boss
			if m, ok := msg.(*messages.Damage); ok {
				m.Caster = &boss // Never mutate a pointer shared with another event.
			} else {
				*caster = boss
			}
			base.MarkActivityIgnore("persistent Ragnaros hazard", boss)
		}
	}
}
