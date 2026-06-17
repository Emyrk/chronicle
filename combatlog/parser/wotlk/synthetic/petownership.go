package synthetic

import (
	"log/slog"
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/types"
	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/database/gamedb/chrondbc"
	"github.com/Emyrk/chronicle/internal/bitmask"
	"github.com/Emyrk/chronicle/internal/ptr"
)

type spellMessageType bitmask.Bitmask32

const (
	spellMessageUnkown = 1 << iota
	spellMessageHeal
	spellMessageAura
	spellMessageAuraCast
)

// PetTargetingOmitted lists spells that match pet-targeting heuristics but
// should be excluded from pet ownership detection, with a human-readable
// reason. Used by the asset generator for the /technical page.
var PetTargetingOmitted = map[chrondbc.SpellID]string{
	// Kill command
	58914: "Kill command does not include the player guid",
	34026: "Kill command does not include the player guid",
	// Dismiss Pet
	2641: "Dismiss pet has no pewt guid",
}

// petOwnerSpells maps spell IDs to the message types that definitively
// establish an owner↔pet relationship. The bitmask restricts which message
// context a spell is valid in (e.g. Soul Link only on aura application, not
// when it appears in damage events).
var petOwnerSpells = map[chrondbc.SpellID]spellMessageType{
	// Hunter — Mend Pet (all ranks): heal only
	136: spellMessageHeal, 3111: spellMessageHeal, 3661: spellMessageHeal, 3662: spellMessageHeal,
	13542: spellMessageHeal, 13543: spellMessageHeal, 13544: spellMessageHeal, 27046: spellMessageHeal,
	33976: spellMessageHeal, 48989: spellMessageHeal, 48990: spellMessageHeal,

	// Bestial Wrath
	19574: spellMessageAura,

	// Spirit Bond
	24529: spellMessageHeal,

	// Look into Master's Call: 53271

	// Hunter — Kill Command: aura cast (buff applied to pet)
	34026: spellMessageAuraCast,

	// Warlock — Fel Synergy: heal only
	54181: spellMessageHeal,

	// Warlock — Health Funnel (all ranks): heal only
	755: spellMessageHeal, 3698: spellMessageHeal, 3699: spellMessageHeal, 3700: spellMessageHeal,
	11693: spellMessageHeal, 11694: spellMessageHeal, 11695: spellMessageHeal, 27259: spellMessageHeal,
	40671: spellMessageHeal, 47855: spellMessageHeal, 47856: spellMessageHeal,
	// Warlock — Master Demonologist (pet → player buff): aura only
	35706: spellMessageAura,
	// Warlock — Demonic Knowledge (pet → player buff): aura only
	35696: spellMessageAura,
	// Warlock — Soul Link (pet ↔ player link): aura only
	25228: spellMessageAura,
}

// ownerStrength distinguishes how confident we are in a pet→owner link.
type ownerStrength int

const (
	strengthWeak   ownerStrength = iota // inferred from name+entry similarity
	strengthStrong                      // petOwnerSpells spell interaction or SPELL_SUMMON
)

type emittedOwner struct {
	owner    guid.GUID
	strength ownerStrength
}

// petKey identifies a pet by its resolved name and creature entry ID.
type petKey struct {
	name  string
	entry uint32
}

// petOwnership detects pet-to-owner relationships from spell interactions in
// WotLK logs that lack SPELL_SUMMON for permanent pets (hunter pets, warlock
// demons). When ownership is detected it emits NewOwner +
// UnitClassificationEvent messages, identical to what suffixSummon produces.
//
// Two signal strengths exist:
//   - Strong: a petOwnerSpells spell or SPELL_SUMMON definitively links a pet
//     GUID to an owner.
//   - Weak: a pet with no known owner deals damage and its (name, entry) pair
//     matches exactly one previously-known owner. A later strong signal
//     overwrites a weak one.
type petOwnership struct {
	logger *slog.Logger
	names  NameResolver
	// emitted tracks pet GUIDs for which we've already emitted ownership.
	emitted map[guid.GUID]emittedOwner
	// knownOwners maps (name, entry) → set of owner GUIDs seen via strong
	// signals. Used for weak inference; only applied when len == 1 (unique).
	knownOwners map[petKey]map[guid.GUID]struct{}
}

func newPetOwnership(logger *slog.Logger, names NameResolver) *petOwnership {
	return &petOwnership{
		logger:      logger,
		names:       names,
		emitted:     make(map[guid.GUID]emittedOwner),
		knownOwners: make(map[petKey]map[guid.GUID]struct{}),
	}
}

// ProcessMessages scans the message batch for pet-owner spell interactions and
// appends synthetic ownership messages when a new relationship is discovered.
func (po *petOwnership) ProcessMessages(msgs []messages.Message) []messages.Message {
	// First pass: record any NewOwner messages already in the batch (e.g. from
	// suffixSummon handling SPELL_SUMMON) so we don't emit duplicates.
	for _, msg := range msgs {
		if no, ok := msg.(*messages.NewOwner); ok {
			po.recordStrong(no.Target, no.NewOwner)
		}
	}

	// Second pass: strong signals from petOwnerSpells (Heal / Aura / AuraCast).
	var add []messages.Message
	for _, msg := range msgs {
		switch m := msg.(type) {
		case *messages.Heal:
			// Player heals their pet (Mend Pet, Fel Synergy, Health Funnel).
			if m.SpellData == nil {
				continue
			}
			if allowed, ok := petOwnerSpells[m.SpellData.ID]; !ok || allowed&spellMessageHeal == 0 {
				continue
			}
			if m.Caster.IsPlayer() && m.Target.IsPet() {
				add = po.emitStrong(add, m.Date(), m.Target, m.Caster)
			}

		case *messages.Aura:
			if m.SpellData == nil || m.Source == nil {
				continue
			}
			if allowed, ok := petOwnerSpells[m.SpellData.ID]; !ok || allowed&spellMessageAura == 0 {
				continue
			}
			// Pet buffs/debuffs the player (Master Demonologist, Demonic Knowledge, Soul Link).
			if m.Source.IsPet() && m.Target.IsPlayer() {
				add = po.emitStrong(add, m.Date(), *m.Source, m.Target)
			}
			// Player applies aura on pet.
			if m.Source.IsPlayer() && m.Target.IsPet() {
				add = po.emitStrong(add, m.Date(), m.Target, *m.Source)
			}

		case *messages.AuraCast:
			if m.Spell == nil {
				continue
			}
			if allowed, ok := petOwnerSpells[m.Spell.ID]; !ok || allowed&spellMessageAuraCast == 0 {
				continue
			}
			// Player casts aura on pet (Kill Command).
			if m.Target != nil && m.Caster.IsPlayer() && m.Target.IsPet() {
				add = po.emitStrong(add, m.Date(), *m.Target, m.Caster)
			}
		}
	}

	// Third pass: weak inference from damage. A pet with no known owner deals
	// damage and its (name, entry) matches exactly one previously-known owner.
	for _, msg := range msgs {
		dm, ok := msg.(*messages.Damage)
		if !ok || dm.Caster == nil || !dm.Caster.IsPet() {
			continue
		}
		petGUID := *dm.Caster
		if _, ok := po.emitted[petGUID]; ok {
			continue // already has an owner (strong or weak)
		}
		name, nameOK := po.names.Get(petGUID)
		entry, entryOK := petGUID.GetEntry()
		if !nameOK || !entryOK {
			continue
		}
		owners := po.knownOwners[petKey{name: name, entry: entry}]
		if len(owners) != 1 {
			continue // unique guard: skip when 0 or 2+ owners
		}
		var owner guid.GUID
		for o := range owners {
			owner = o
		}
		add = po.emitWeak(add, dm.Date(), petGUID, owner)
	}

	if len(add) > 0 {
		return append(msgs, add...)
	}
	return msgs
}

// recordStrong records a strong pet→owner link in the emitted map and
// knownOwners index without emitting messages (used for pre-existing
// NewOwner messages in the batch).
func (po *petOwnership) recordStrong(petGUID, ownerGUID guid.GUID) {
	po.emitted[petGUID] = emittedOwner{owner: ownerGUID, strength: strengthStrong}
	po.recordKnownOwner(petGUID, ownerGUID)
}

// recordKnownOwner adds the (name, entry) → owner mapping used for weak
// inference.
func (po *petOwnership) recordKnownOwner(petGUID, ownerGUID guid.GUID) {
	name, nameOK := po.names.Get(petGUID)
	entry, entryOK := petGUID.GetEntry()
	if !nameOK || !entryOK {
		return
	}
	key := petKey{name: name, entry: entry}
	m := po.knownOwners[key]
	if m == nil {
		m = make(map[guid.GUID]struct{})
		po.knownOwners[key] = m
	}
	m[ownerGUID] = struct{}{}
}

// emitStrong emits ownership messages for a strong signal. If the pet was
// previously weak-inferred, the strong signal overrides it and re-emits.
func (po *petOwnership) emitStrong(add []messages.Message, ts time.Time, petGUID, ownerGUID guid.GUID) []messages.Message {
	if prev, ok := po.emitted[petGUID]; ok && prev.strength >= strengthStrong {
		return add // already strong — skip
	}
	po.emitted[petGUID] = emittedOwner{owner: ownerGUID, strength: strengthStrong}
	po.recordKnownOwner(petGUID, ownerGUID)
	return po.emit(add, ts, petGUID, ownerGUID, "spell_interaction")
}

// emitWeak emits ownership messages for a weak (name+entry) inference.
// Skipped if any prior emission exists (strong or weak).
func (po *petOwnership) emitWeak(add []messages.Message, ts time.Time, petGUID, ownerGUID guid.GUID) []messages.Message {
	if _, ok := po.emitted[petGUID]; ok {
		return add
	}
	po.emitted[petGUID] = emittedOwner{owner: ownerGUID, strength: strengthWeak}
	return po.emit(add, ts, petGUID, ownerGUID, "name_entry_inference")
}

// emit appends NewOwner + UnitClassificationEvent messages and logs the event.
func (po *petOwnership) emit(add []messages.Message, ts time.Time, petGUID, ownerGUID guid.GUID, source string) []messages.Message {
	petName := "unknown"
	if n, ok := po.names.Get(petGUID); ok {
		petName = n
	}
	ownerName := "unknown"
	if n, ok := po.names.Get(ownerGUID); ok {
		ownerName = n
	}
	po.logger.Info("detected pet ownership",
		slog.String("source", source),
		slog.String("pet", petName),
		slog.String("pet_guid", petGUID.String()),
		slog.String("owner", ownerName),
		slog.String("owner_guid", ownerGUID.String()),
	)

	ty := types.UnitTypeUnknown
	if petGUID.IsAnyCreature() {
		ty = types.UnitTypeCreature
	}

	return append(add,
		&messages.NewOwner{
			MessageBase: messages.Base(ts, messages.WithSynthetic()),
			Target:      petGUID,
			NewOwner:    ownerGUID,
		},
		&messages.UnitClassificationEvent{
			MessageBase: messages.Base(ts, messages.WithSynthetic()),
			Target:      petGUID,
			UnitType:    ty,
			Affiliation: types.AffiliationUnknown,
			Owner:       ptr.Ref(ownerGUID),
		},
	)
}
