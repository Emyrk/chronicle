package encounterevents

import (
	"fmt"
	"time"

	"github.com/Emyrk/chronicle/api/chronicleproto"
	"github.com/Emyrk/chronicle/api/chronicleproto/types2proto"
	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/google/uuid"
)

type EncounterEventsInProgress EncounterEvents

type EncounterEvents struct {
	first          time.Time
	verbose        bool
	Damage         *Builder[*messages.Damage, *chronicleproto.Damage]
	Heal           *Builder[*messages.Heal, *chronicleproto.Heal]
	ResourceChange *Builder[*messages.ResourceChange, *chronicleproto.ResourceChange]
	ExtraAttack    *Builder[*messages.ExtraAttack, *chronicleproto.ExtraAttack]
	Slain          *Builder[*messages.Slain, *chronicleproto.Slain]
	Resurrection   *Builder[*messages.Resurrection, *chronicleproto.Resurrection]
	// Casts is deprecated to SpellStart/SpellGo/SpellFail, but we still want to support it for older logs.
	//nolint: staticcheck
	Casts              *Builder[*messages.Cast, *chronicleproto.Cast]
	Aura               *Builder[*messages.Aura, *chronicleproto.Aura]
	AuraCast           *Builder[*messages.AuraCast, *chronicleproto.AuraCast]
	SpellGo            *Builder[*messages.SpellGo, *chronicleproto.SpellGo]
	SpellStart         *Builder[*messages.SpellStart, *chronicleproto.SpellStart]
	SpellFail          *Builder[*messages.SpellFail, *chronicleproto.SpellFail]
	UnitClassification *Builder[*messages.UnitClassificationEvent, *chronicleproto.UnitClassification]
	CombatantInfo      *Builder[*messages.Combatant, *chronicleproto.CombatantInfo]
	Dispel             *Builder[*messages.Dispel, *chronicleproto.Dispel]
	Interrupt          *Builder[*messages.Interrupt, *chronicleproto.Interrupt]
	Absorbed           *Builder[*messages.Absorbed, *chronicleproto.Absorbed]
	CompanionStats     *Builder[*messages.CompanionStats, *chronicleproto.CompanionStats]
	cnter              int32
}

func New(verbose bool) *EncounterEventsInProgress {
	return &EncounterEventsInProgress{
		verbose:        verbose,
		Damage:         NewBuilder[*messages.Damage, *chronicleproto.Damage](),
		Heal:           NewBuilder[*messages.Heal, *chronicleproto.Heal](),
		ResourceChange: NewBuilder[*messages.ResourceChange, *chronicleproto.ResourceChange](),
		ExtraAttack:    NewBuilder[*messages.ExtraAttack, *chronicleproto.ExtraAttack](),
		Slain:          NewBuilder[*messages.Slain, *chronicleproto.Slain](),
		Resurrection:   NewBuilder[*messages.Resurrection, *chronicleproto.Resurrection](),
		//nolint: staticcheck
		Casts:              NewBuilder[*messages.Cast, *chronicleproto.Cast](),
		Aura:               NewBuilder[*messages.Aura, *chronicleproto.Aura](),
		AuraCast:           NewBuilder[*messages.AuraCast, *chronicleproto.AuraCast](),
		SpellGo:            NewBuilder[*messages.SpellGo, *chronicleproto.SpellGo](),
		SpellStart:         NewBuilder[*messages.SpellStart, *chronicleproto.SpellStart](),
		SpellFail:          NewBuilder[*messages.SpellFail, *chronicleproto.SpellFail](),
		UnitClassification: NewBuilder[*messages.UnitClassificationEvent, *chronicleproto.UnitClassification](),
		CombatantInfo:      NewBuilder[*messages.Combatant, *chronicleproto.CombatantInfo](),
		Dispel:             NewBuilder[*messages.Dispel, *chronicleproto.Dispel](),
		Interrupt:          NewBuilder[*messages.Interrupt, *chronicleproto.Interrupt](),
		Absorbed:           NewBuilder[*messages.Absorbed, *chronicleproto.Absorbed](),
		CompanionStats:     NewBuilder[*messages.CompanionStats, *chronicleproto.CompanionStats](),
	}
}

func (e *EncounterEventsInProgress) Finalize(merge *Events, encounterID uuid.UUID) error {
	damagePayload, err := e.Damage.Finalize(encounterID)
	if err != nil {
		return fmt.Errorf("finalizing damage events: %w", err)
	}

	healPayload, err := e.Heal.Finalize(encounterID)
	if err != nil {
		return fmt.Errorf("finalizing heal events: %w", err)
	}

	rcPayload, err := e.ResourceChange.Finalize(encounterID)
	if err != nil {
		return fmt.Errorf("finalizing resource change events: %w", err)
	}

	extraAttack, err := e.ExtraAttack.Finalize(encounterID)
	if err != nil {
		return fmt.Errorf("finalizing extra attack events: %w", err)
	}

	slain, err := e.Slain.Finalize(encounterID)
	if err != nil {
		return fmt.Errorf("finalizing slain events: %w", err)
	}

	resurrection, err := e.Resurrection.Finalize(encounterID)
	if err != nil {
		return fmt.Errorf("finalizing resurrection events: %w", err)
	}

	casts, err := e.Casts.Finalize(encounterID)
	if err != nil {
		return fmt.Errorf("finalizing casts events: %w", err)
	}

	auras, err := e.Aura.Finalize(encounterID)
	if err != nil {
		return fmt.Errorf("finalizing casts events: %w", err)
	}

	spellGo, err := e.SpellGo.Finalize(encounterID)
	if err != nil {
		return fmt.Errorf("finalizing spell go events: %w", err)
	}

	auraCasts, err := e.AuraCast.Finalize(encounterID)
	if err != nil {
		return fmt.Errorf("finalizing aura cast events: %w", err)
	}

	spellStart, err := e.SpellStart.Finalize(encounterID)
	if err != nil {
		return fmt.Errorf("finalizing spell start events: %w", err)
	}

	spellFail, err := e.SpellFail.Finalize(encounterID)
	if err != nil {
		return fmt.Errorf("finalizing spell fail events: %w", err)
	}

	unitClassification, err := e.UnitClassification.Finalize(encounterID)
	if err != nil {
		return fmt.Errorf("finalizing unit classification events: %w", err)
	}

	combatantInfo, err := e.CombatantInfo.Finalize(encounterID)
	if err != nil {
		return fmt.Errorf("finalizing combatant info events: %w", err)
	}

	dispel, err := e.Dispel.Finalize(encounterID)
	if err != nil {
		return fmt.Errorf("finalizing dispel events: %w", err)
	}

	interrupt, err := e.Interrupt.Finalize(encounterID)
	if err != nil {
		return fmt.Errorf("finalizing interrupt events: %w", err)
	}

	absorbed, err := e.Absorbed.Finalize(encounterID)
	if err != nil {
		return fmt.Errorf("finalizing absorbed events: %w", err)
	}

	companionStats, err := e.CompanionStats.Finalize(encounterID)
	if err != nil {
		return fmt.Errorf("finalizing companion stats events: %w", err)
	}

	merge.Damage = append(merge.Damage, damagePayload...)
	merge.Healing = append(merge.Healing, healPayload...)
	merge.ResourceChange = append(merge.ResourceChange, rcPayload...)
	merge.ExtraAttack = append(merge.ExtraAttack, extraAttack...)
	merge.Slain = append(merge.Slain, slain...)
	merge.Resurrection = append(merge.Resurrection, resurrection...)
	merge.Cast = append(merge.Cast, casts...)
	merge.Aura = append(merge.Aura, auras...)
	merge.SpellGo = append(merge.SpellGo, spellGo...)
	merge.AuraCasts = append(merge.AuraCasts, auraCasts...)
	merge.SpellStart = append(merge.SpellStart, spellStart...)
	merge.SpellFail = append(merge.SpellFail, spellFail...)
	merge.UnitClassification = append(merge.UnitClassification, unitClassification...)
	merge.CombatantInfo = append(merge.CombatantInfo, combatantInfo...)
	merge.Dispel = append(merge.Dispel, dispel...)
	merge.Interrupt = append(merge.Interrupt, interrupt...)
	merge.Absorbed = append(merge.Absorbed, absorbed...)
	merge.CompanionStats = append(merge.CompanionStats, companionStats...)

	return nil
}

// nolint: staticcheck
func (e *EncounterEventsInProgress) Process(m messages.Message) error {
	e.setFirsts(m.Date())
	if !e.verbose {
		m.ResetActivity()
	}
	switch ty := m.(type) {
	case *messages.Damage:
		err := AddToBuilder(e.Damage, ty, e.nextIndex(), types2proto.Damage)
		if err != nil {
			return fmt.Errorf("damage proto: %w", err)
		}
	case *messages.Heal:
		err := AddToBuilder(e.Heal, ty, e.nextIndex(), types2proto.Heal)
		if err != nil {
			return fmt.Errorf("heal proto: %w", err)
		}
	case *messages.ResourceChange:
		err := AddToBuilder(e.ResourceChange, ty, e.nextIndex(), types2proto.ResourceChange)
		if err != nil {
			return fmt.Errorf("resource change proto: %w", err)
		}
	case *messages.ExtraAttack:
		err := AddToBuilder(e.ExtraAttack, ty, e.nextIndex(), types2proto.ExtraAttack)
		if err != nil {
			return fmt.Errorf("extra attack proto: %w", err)
		}
	case *messages.Slain:
		err := AddToBuilder(e.Slain, ty, e.nextIndex(), types2proto.Slain)
		if err != nil {
			return fmt.Errorf("slain proto: %w", err)
		}
	case *messages.Resurrection:
		err := AddToBuilder(e.Resurrection, ty, e.nextIndex(), types2proto.Resurrection)
		if err != nil {
			return fmt.Errorf("resurrection proto: %w", err)
		}
	case *messages.Cast:
		err := AddToBuilder(e.Casts, ty, e.nextIndex(), types2proto.Cast)
		if err != nil {
			return fmt.Errorf("cast proto: %w", err)
		}
	case *messages.Aura:
		err := AddToBuilder(e.Aura, ty, e.nextIndex(), types2proto.Aura)
		if err != nil {
			return fmt.Errorf("aura proto: %w", err)
		}
	case *messages.AuraCast:
		err := AddToBuilder(e.AuraCast, ty, e.nextIndex(), types2proto.AuraCast)
		if err != nil {
			return fmt.Errorf("aura cast proto: %w", err)
		}
	case *messages.SpellGo:
		err := AddToBuilder(e.SpellGo, ty, e.nextIndex(), types2proto.SpellGo)
		if err != nil {
			return fmt.Errorf("spell go proto: %w", err)
		}
	case *messages.SpellStart:
		err := AddToBuilder(e.SpellStart, ty, e.nextIndex(), types2proto.SpellStart)
		if err != nil {
			return fmt.Errorf("spell start proto: %w", err)
		}
	case *messages.SpellFail:
		err := AddToBuilder(e.SpellFail, ty, e.nextIndex(), types2proto.SpellFail)
		if err != nil {
			return fmt.Errorf("spell fail proto: %w", err)
		}
	case *messages.UnitClassificationEvent:
		err := AddToBuilder(e.UnitClassification, ty, e.nextIndex(), types2proto.UnitClassification)
		if err != nil {
			return fmt.Errorf("unit classification proto: %w", err)
		}
	case *messages.Combatant:
		err := AddToBuilder(e.CombatantInfo, ty, e.nextIndex(), types2proto.CombatantInfo)
		if err != nil {
			return fmt.Errorf("combatant info proto: %w", err)
		}
	case *messages.Dispel:
		err := AddToBuilder(e.Dispel, ty, e.nextIndex(), types2proto.Dispel)
		if err != nil {
			return fmt.Errorf("dispel proto: %w", err)
		}
	case *messages.Interrupt:
		err := AddToBuilder(e.Interrupt, ty, e.nextIndex(), types2proto.Interrupt)
		if err != nil {
			return fmt.Errorf("interrupt proto: %w", err)
		}
	case *messages.Absorbed:
		err := AddToBuilder(e.Absorbed, ty, e.nextIndex(), types2proto.Absorbed)
		if err != nil {
			return fmt.Errorf("absorbed proto: %w", err)
		}
	case *messages.CompanionStats:
		err := AddToBuilder(e.CompanionStats, ty, e.nextIndex(), types2proto.CompanionStats)
		if err != nil {
			return fmt.Errorf("companion stats proto: %w", err)
		}
	}
	return nil
}

func (e *EncounterEventsInProgress) setFirsts(t time.Time) {
	if !e.first.IsZero() {
		return
	}
	e.first = t
	e.Damage.SetZero(e.first)
	e.Heal.SetZero(e.first)
	e.ResourceChange.SetZero(e.first)
	e.ExtraAttack.SetZero(e.first)
	e.Slain.SetZero(e.first)
	e.Resurrection.SetZero(e.first)
	e.Casts.SetZero(e.first)
	e.Aura.SetZero(e.first)
	e.SpellGo.SetZero(e.first)
	e.AuraCast.SetZero(e.first)
	e.SpellStart.SetZero(e.first)
	e.SpellFail.SetZero(e.first)
	e.UnitClassification.SetZero(e.first)
	e.CombatantInfo.SetZero(e.first)
	e.Dispel.SetZero(e.first)
	e.Interrupt.SetZero(e.first)
	e.Absorbed.SetZero(e.first)
	e.CompanionStats.SetZero(e.first)
}

func (e *EncounterEventsInProgress) nextIndex() int32 {
	e.cnter++
	return e.cnter - 1
}
