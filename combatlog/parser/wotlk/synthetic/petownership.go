package synthetic

import (
	"log/slog"
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/types"
	"github.com/Emyrk/chronicle/combatlog/parser/vanilla/messages"
	"github.com/Emyrk/chronicle/database/gamedb/chrondbc"
	"github.com/Emyrk/chronicle/internal/ptr"
)

// petOwnerSpells is the set of spell IDs that are only cast between a pet owner
// and their pet. Seeing one of these spells in a Heal or Aura message
// definitively establishes an owner↔pet relationship.
var petOwnerSpells = map[chrondbc.SpellID]struct{}{
	// Hunter — Mend Pet (all ranks)
	136: {}, 3111: {}, 3661: {}, 3662: {},
	13542: {}, 13543: {}, 13544: {}, 27046: {},
	33976: {}, 48989: {}, 48990: {},
	// Hunter — Kill Command
	34026: {},

	// Warlock — Fel Synergy
	54181: {},
	// Warlock — Health Funnel (all ranks)
	755: {}, 3698: {}, 3699: {}, 3700: {},
	11693: {}, 11694: {}, 11695: {}, 27259: {},
	40671: {}, 47855: {}, 47856: {},
	// Warlock — Master Demonologist (pet → player buff)
	35706: {},
	// Warlock — Demonic Knowledge (pet → player buff)
	35696: {},
}

// petOwnership detects pet-to-owner relationships from spell interactions in
// WotLK logs that lack SPELL_SUMMON for permanent pets (hunter pets, warlock
// demons). When ownership is detected it emits NewOwner +
// UnitClassificationEvent messages, identical to what suffixSummon produces.
type petOwnership struct {
	logger *slog.Logger
	names  NameResolver
	// emitted tracks pet GUIDs for which we've already emitted ownership.
	emitted map[guid.GUID]guid.GUID
}

func newPetOwnership(logger *slog.Logger, names NameResolver) *petOwnership {
	return &petOwnership{
		logger:  logger,
		names:   names,
		emitted: make(map[guid.GUID]guid.GUID),
	}
}

// ProcessMessages scans the message batch for pet-owner spell interactions and
// appends synthetic ownership messages when a new relationship is discovered.
func (po *petOwnership) ProcessMessages(msgs []messages.Message) []messages.Message {
	// First pass: record any NewOwner messages already in the batch (e.g. from
	// suffixSummon handling SPELL_SUMMON) so we don't emit duplicates.
	for _, msg := range msgs {
		if no, ok := msg.(*messages.NewOwner); ok {
			po.emitted[no.Target] = no.NewOwner
		}
	}

	var add []messages.Message
	for _, msg := range msgs {
		switch m := msg.(type) {
		case *messages.Heal:
			// Player heals their pet (Mend Pet, Fel Synergy, Health Funnel).
			if m.SpellData == nil {
				continue
			}
			if _, ok := petOwnerSpells[m.SpellData.ID]; !ok {
				continue
			}
			if m.Caster.IsPlayer() && m.Target.IsPet() {
				add = po.maybeEmit(add, m.Date(), m.Target, m.Caster)
			}

		case *messages.Aura:
			if m.SpellData == nil || m.Source == nil {
				continue
			}
			if _, ok := petOwnerSpells[m.SpellData.ID]; !ok {
				continue
			}
			// Pet buffs/debuffs the player (Master Demonologist, Demonic Knowledge).
			if m.Source.IsPet() && m.Target.IsPlayer() {
				add = po.maybeEmit(add, m.Date(), *m.Source, m.Target)
			}
			// Player applies aura on pet.
			if m.Source.IsPlayer() && m.Target.IsPet() {
				add = po.maybeEmit(add, m.Date(), m.Target, *m.Source)
			}
		}
	}

	if len(add) > 0 {
		return append(msgs, add...)
	}
	return msgs
}

// maybeEmit emits NewOwner + UnitClassificationEvent for petGUID owned by
// ownerGUID if this pet hasn't been emitted before. Returns the (possibly
// appended) slice.
func (po *petOwnership) maybeEmit(add []messages.Message, ts time.Time, petGUID, ownerGUID guid.GUID) []messages.Message {
	if _, ok := po.emitted[petGUID]; ok {
		return add
	}
	po.emitted[petGUID] = ownerGUID

	petName := "unknown"
	if n, ok := po.names.Get(petGUID); ok {
		petName = n
	}
	ownerName := "unknown"
	if n, ok := po.names.Get(ownerGUID); ok {
		ownerName = n
	}
	po.logger.Info("detected pet ownership from spell interaction",
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
