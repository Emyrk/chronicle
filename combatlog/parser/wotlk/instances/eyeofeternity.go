package instances

import (
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/database/gamedb/chrondbc"
)

const (
	malygosEntry             uint32 = 28859
	malygosDamageCreditGrace        = 10 * time.Second
)

type malygosDamageCredit struct {
	// caster is the nonzero Malygos GUID observed in this instance. It is the
	// replacement source, not the zero caster from the damage event.
	caster          guid.GUID
	casterExpiresAt time.Time
}

func (m *malygosDamageCredit) ProcessMessage(msg messages.Message) error {
	for _, id := range msg.Affects() {
		entry, ok := id.GetEntry()
		if !id.IsCreature() || !ok || entry != malygosEntry {
			continue
		}
		if id != m.caster {
			m.casterExpiresAt = time.Time{}
		}
		m.caster = id
	}

	if !m.casterExpiresAt.IsZero() && !msg.Date().Before(m.casterExpiresAt) {
		m.caster = 0
		m.casterExpiresAt = time.Time{}
	}

	if slain, ok := msg.(*messages.Slain); ok && slain.Victim == m.caster {
		m.casterExpiresAt = slain.Date().Add(malygosDamageCreditGrace)
	}

	damage, ok := msg.(*messages.Damage)
	if !ok || m.caster.IsZero() || !isMalygosDamage(damage) {
		return nil
	}
	caster := m.caster
	damage.Caster = &caster
	damage.MarkActivityIgnore("attributed environment damage", caster)
	return nil
}

func isMalygosDamage(damage *messages.Damage) bool {
	if damage.SpellData == nil || (damage.Caster != nil && !damage.Caster.IsZero()) {
		return false
	}

	switch damage.SpellData.ID {
	case chrondbc.SpellID(56548), // Surge of Power
		chrondbc.SpellID(57429): // Static Field
		return true
	default:
		return false
	}
}
