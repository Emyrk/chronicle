package identitycatalog

import (
	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"strings"
)

// Process explicitly audits typed GUID roles. Affects omits metadata and is not an identity inventory.
func (c *Collector) Process(msg messages.Message) error {
	if msg == nil {
		return nil
	}
	t := msg.Date()
	// Select evidence budgets only after this message's contexts, classifications,
	// ownership and cycle checks have finalized every record's diagnostic status.
	type pendingEvidence struct {
		record *Record
		value  Evidence
	}
	var pendingBuffer [16]pendingEvidence
	pending := pendingBuffer[:0]
	queue := func(r *Record, e Evidence) { pending = append(pending, pendingEvidence{r, e}) }

	// Server affiliation is observation-local. Apply it before counting the
	// context so a metadata event never creates a misleading unknown context.
	var metadataGUID guid.GUID
	metadataAffiliation := ""
	switch m := msg.(type) {
	case *messages.Unit:
		metadataGUID = m.Guid
		metadataAffiliation = affiliation(m.Affiliation)
	case *messages.UnitClassificationEvent:
		metadataGUID = m.Target
		metadataAffiliation = affiliation(m.Affiliation)
	}
	seen := make(map[guid.GUID]*Record)
	type observedRole struct {
		id   guid.GUID
		role string
	}
	var roleBuffer [8]observedRole
	roles := roleBuffer[:0]
	add := func(id guid.GUID, role string) {
		r := seen[id]
		if r == nil {
			aff := ""
			if id == metadataGUID {
				aff = metadataAffiliation
			}
			r = c.observe(id, t, aff)
			seen[id] = r
		}
		queue(r, Evidence{Role: role})
		roles = append(roles, observedRole{id, role})
	}
	text := func(s, role string) {
		if id, e := guid.FromString(s); e == nil {
			add(id, role)
		}
	}
	owner := func(target, owner guid.GUID) {
		c.owners[target] = owner
		r := seen[target]
		if r != nil {
			o := owner
			queue(r, Evidence{Role: "owner/direct", RelatedGUID: &o})
		}
	}
	classification := func(id guid.GUID, aff string) {
		if aff == "unknown" {
			return
		}
		r := seen[id]
		queue(r, Evidence{Role: "classification/affiliation", Name: aff})
		if r.Affiliation != "unknown" && r.Affiliation != aff {
			r.Conflict = true
		}
		r.Affiliation = aff
	}
	spellEvidence := func(id guid.GUID, role string, spell int32, name string) {
		if spell != 0 || name != "" {
			queue(seen[id], Evidence{Role: "spell/" + role, SpellID: spell, Name: name})
		}
	}
	var spells []int32
	var spellName string
	addSpell := func(id int32) {
		if id == 0 {
			return
		}
		for _, existing := range spells {
			if existing == id {
				return
			}
		}
		spells = append(spells, id)
	}
	switch m := msg.(type) {
	// These message types contain no GUID-bearing roles (names are not identities).
	case *messages.SkippedMessage, *messages.UnparsedLine, *messages.Transmog,
		*messages.Realm, *messages.WorldMarker, *messages.CombatCount, *messages.Clock,
		*messages.EncounterBoundary, *messages.Timeout, *messages.Loot, *messages.LootTrade,
		*messages.CompanionStats:

	case *messages.Zone:
		c.zone = m.Zone
		c.zoneNameTruncated = len(c.zone.Name) > EvidenceStringLimit
		c.zone.Name = bounded(c.zone.Name)
		c.zoneKey = strings.ToLower(c.zone.Name)
		c.zone.InstanceType = bounded(c.zone.InstanceType)
		c.zone.DifficultyName = bounded(c.zone.DifficultyName)
		c.zone.SubZone = bounded(c.zone.SubZone)
	case *messages.PlayerPosition:
		text(m.Guid, "PlayerPosition.Guid")
	case *messages.RaidGroup:
		for _, g := range m.Groups {
			for _, id := range g {
				if !id.IsZero() {
					add(id, "RaidGroup.member")
				}
			}
		}
	case *messages.ThreatTank:
		for _, e := range m.Entries {
			text(e.ServerGUID, "ThreatTank.ServerGUID")
			text(e.Creature, "ThreatTank.Creature")
			text(e.NextPlayer, "ThreatTank.NextPlayer")
		}
		text(m.Source, "ThreatTank.Source")
	case *messages.LegacyCast:
		spellName = m.Spell
		add(m.Caster, "LegacyCast.Caster")
		if m.Target != nil {
			add(*m.Target, "LegacyCast.Target")
		}
	case *messages.Cast: //nolint:staticcheck // Exhaustive identity coverage includes deprecated cast messages emitted by legacy log formats.
		addSpell(int32(m.Spell.ID))
		spellName = m.Spell.Name
		add(m.Caster.Gid, "Cast.Caster.Gid")
		if m.Target != nil {
			add(m.Target.Gid, "Cast.Target.Gid")
		}
	case *messages.Unit:
		add(m.Guid, "Unit.Guid")
		if m.Owner != nil {
			add(*m.Owner, "Unit.Owner")
		}
		if m.Charm != nil {
			add(*m.Charm, "Unit.Charm")
		}
		if m.Owner != nil {
			owner(m.Guid, *m.Owner)
		}
		queue(seen[m.Guid], Evidence{Role: "name", Name: m.Name})
		classification(m.Guid, affiliation(m.Affiliation))
	case *messages.Combatant:
		add(m.Guid, "Combatant.Guid")
		queue(seen[m.Guid], Evidence{Role: "name", Name: m.Name})
	case *messages.CombatantTalents:
		add(m.Guid, "CombatantTalents.Guid")
	case *messages.Versions:
		if m.Player != nil {
			add(*m.Player, "Versions.Player")
		}
	case *messages.UnitDied:
		add(m.ID, "UnitDied.ID")
	case *messages.UnitPosition:
		add(m.Unit, "UnitPosition.Unit")
	case *messages.UnitResources:
		add(m.Unit, "UnitResources.Unit")
	case *messages.UnitTarget:
		add(m.Unit, "UnitTarget.Unit")
		if m.Target != nil {
			add(*m.Target, "UnitTarget.Target")
		}
	case *messages.UnitCombatState:
		add(m.Unit, "UnitCombatState.Unit")
	case *messages.RaidMark:
		add(m.Unit, "RaidMark.Unit")
	case *messages.Threat:
		if m.Mob != nil {
			add(*m.Mob, "Threat.Mob")
		}
		text(m.Source, "Threat.Source")
		for _, e := range m.Entries {
			text(e.Player, "Threat.Player")
		}
	case *messages.ResourceChange:
		if m.SpellName != nil {
			spellName = *m.SpellName
		}
		add(m.Target, "ResourceChange.Target")
		if m.Caster != nil {
			add(*m.Caster, "ResourceChange.Caster")
		}
		if m.SpellData != nil {
			addSpell(int32(m.SpellData.ID))
		}
	case *messages.Damage:
		if m.SpellName != nil {
			spellName = *m.SpellName
		}
		add(m.Target, "Damage.Target")
		if m.Caster != nil {
			add(*m.Caster, "Damage.Caster")
		}
		addSpell(int32(m.SpellID))
		if m.SpellData != nil {
			addSpell(int32(m.SpellData.ID))
		}
	case *messages.Heal:
		spellName = m.SpellName
		add(m.Caster, "Heal.Caster")
		add(m.Target, "Heal.Target")
		if m.SpellData != nil {
			addSpell(int32(m.SpellData.ID))
		}
	case *messages.Slain:
		add(m.Victim, "Slain.Victim")
		if m.Killer != nil {
			add(*m.Killer, "Slain.Killer")
		}
	case *messages.AuraCast:
		add(m.Caster, "AuraCast.Caster")
		if m.Target != nil {
			add(*m.Target, "AuraCast.Target")
		}
		if m.Spell != nil {
			addSpell(int32(m.Spell.ID))
		}
	case *messages.Aura:
		spellName = m.SpellName
		add(m.Target, "Aura.Target")
		if m.Source != nil {
			add(*m.Source, "Aura.Source")
		}
		addSpell(int32(m.SpellID))
		if m.SpellData != nil {
			addSpell(int32(m.SpellData.ID))
		}
	case *messages.Interrupt:
		add(m.Caster, "Interrupt.Caster")
		add(m.Target, "Interrupt.Target")
		if m.InterruptSpell != nil {
			spellEvidence(m.Caster, "Interrupt.Caster", int32(m.InterruptSpell.ID), "")
		}
		spellEvidence(m.Target, "Interrupt.Target", m.ExtraSpellID, m.SpellName)
		if m.InterruptedSpell != nil && int32(m.InterruptedSpell.ID) != m.ExtraSpellID {
			spellEvidence(m.Target, "Interrupt.Target", int32(m.InterruptedSpell.ID), m.SpellName)
		}
	case *messages.Create:
		add(m.Caster, "Create.Caster")
	case *messages.SpellFail:
		add(m.Caster, "SpellFail.Caster")
		if m.SpellData != nil {
			addSpell(int32(m.SpellData.ID))
		}
	case *messages.SpellStart:
		add(m.Caster, "SpellStart.Caster")
		if m.Target != nil {
			add(*m.Target, "SpellStart.Target")
		}
		addSpell(int32(m.SpellID))
		if m.SpellData != nil {
			addSpell(int32(m.SpellData.ID))
		}
	case *messages.SpellGo:
		add(m.Caster, "SpellGo.Caster")
		if m.Target != nil {
			add(*m.Target, "SpellGo.Target")
		}
		if m.CorpseOwner != nil {
			add(*m.CorpseOwner, "SpellGo.CorpseOwner")
		}
		addSpell(int32(m.SpellID))
		if m.SpellData != nil {
			addSpell(int32(m.SpellData.ID))
		}
	case *messages.Resurrection:
		add(m.Source, "Resurrection.Source")
		add(m.Target, "Resurrection.Target")
		if m.Spell != nil {
			addSpell(int32(m.Spell.ID))
		}
	case *messages.ExtraAttack:
		add(m.Caster, "ExtraAttack.Caster")
		if m.Spell != nil {
			addSpell(int32(m.Spell.ID))
		}
	case *messages.Consume:
		add(m.Player, "Consume.Player")
		if m.SpellData != nil {
			addSpell(int32(m.SpellData.ID))
		}
	case *messages.VehicleControl:
		add(m.VehicleGUID, "VehicleControl.VehicleGUID")
		add(m.ControllerGUID, "VehicleControl.ControllerGUID")
		controller := m.ControllerGUID
		queue(seen[m.VehicleGUID], Evidence{Role: "vehicle/" + string(m.Action), RelatedGUID: &controller})
	case *messages.NewOwner:
		add(m.Target, "NewOwner.Target")
		add(m.NewOwner, "NewOwner.NewOwner")
		owner(m.Target, m.NewOwner)
	case *messages.PossessionChange:
		add(m.Target, "PossessionChange.Target")
		add(m.Controller, "PossessionChange.Controller")
		controller := m.Controller
		role := "controller/released"
		if m.Gained {
			role = "controller/gained"
		}
		queue(seen[m.Target], Evidence{Role: role, RelatedGUID: &controller})
		if m.Spell != nil {
			addSpell(int32(m.Spell.ID))
		}
	case *messages.UnitClassificationEvent:
		add(m.Target, "UnitClassificationEvent.Target")
		if m.Owner != nil {
			add(*m.Owner, "UnitClassificationEvent.Owner")
		}
		if m.Controller != nil {
			add(*m.Controller, "UnitClassificationEvent.Controller")
			controller := *m.Controller
			queue(seen[m.Target], Evidence{Role: "controller/observed", RelatedGUID: &controller})
		}
		if m.Spell != nil {
			addSpell(int32(m.Spell.ID))
		}
		if m.Owner != nil {
			owner(m.Target, *m.Owner)
		}
		classification(m.Target, affiliation(m.Affiliation))
	case *messages.Dispel:
		add(m.Caster, "Dispel.Caster")
		add(m.Target, "Dispel.Target")
		if m.Spell != nil {
			addSpell(int32(m.Spell.ID))
		}
	case *messages.UnitEvade:
		add(m.UnitGUID, "UnitEvade.UnitGUID")
	case *messages.UnitCombatEnter:
		add(m.UnitGUID, "UnitCombatEnter.UnitGUID")
		add(m.OtherGUID, "UnitCombatEnter.OtherGUID")
	case *messages.EncounterCredit:
		add(m.UnitGUID, "EncounterCredit.UnitGUID")
	case *messages.Absorbed:
		add(m.Attacker, "Absorbed.Attacker")
		add(m.Target, "Absorbed.Target")
		add(m.Caster, "Absorbed.Caster")
		if m.DamageSpell != nil {
			spellEvidence(m.Attacker, "Absorbed.Attacker/damage", int32(m.DamageSpell.ID), "")
			spellEvidence(m.Target, "Absorbed.Target/damage", int32(m.DamageSpell.ID), "")
		}
		if m.AbsorbSpell != nil {
			spellEvidence(m.Caster, "Absorbed.Caster/absorb", int32(m.AbsorbSpell.ID), "")
			spellEvidence(m.Target, "Absorbed.Target/absorb", int32(m.AbsorbSpell.ID), "")
		}

	}
	if len(seen) > 0 {
		c.eventCount++
	}
	// Keep each event role distinct even when one GUID fills multiple roles.
	for _, role := range roles {
		// Permanent ownership does not imply participation in the possession spell.
		if role.role == "UnitClassificationEvent.Owner" {
			continue
		}
		if len(spells) == 0 {
			spellEvidence(role.id, role.role, 0, spellName)
		}
		for _, spell := range spells {
			spellEvidence(role.id, role.role, spell, spellName)
		}
	}
	for id, r := range seen {
		visited := map[guid.GUID]bool{id: true}
		root := id
		for {
			o, ok := c.owners[root]
			if !ok || o.IsZero() {
				break
			}
			if visited[o] {
				r.Conflict = true
				break
			}
			visited[o] = true
			root = o
		}
		if root != id {
			queue(r, Evidence{Role: "owner/root", RelatedGUID: &root})
		}
	}
	for _, p := range pending {
		p.record.evidence(p.value, t)
	}
	return nil
}
