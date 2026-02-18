package encounterevents

import (
	"fmt"
	"time"

	"github.com/Emyrk/chronicle/api/chronicleproto"
	"github.com/Emyrk/chronicle/api/chronicleproto/types2proto"
	"github.com/Emyrk/chronicle/combatlog/parser/vanilla/messages"
	"github.com/google/uuid"
)

type EncounterEventsInProgress EncounterEvents

type EncounterEvents struct {
	first          time.Time
	Damage         *Builder[*messages.Damage, *chronicleproto.Damage]
	Heal           *Builder[*messages.Heal, *chronicleproto.Heal]
	ResourceChange *Builder[*messages.ResourceChange, *chronicleproto.ResourceChange]
	ExtraAttack    *Builder[*messages.ExtraAttack, *chronicleproto.ExtraAttack]
	Slain          *Builder[*messages.Slain, *chronicleproto.Slain]
	Casts          *Builder[*messages.Cast, *chronicleproto.Cast]
	Aura           *Builder[*messages.Aura, *chronicleproto.Aura]
	cnter          int32
}

func New() *EncounterEventsInProgress {
	return &EncounterEventsInProgress{
		Damage:         NewBuilder[*messages.Damage, *chronicleproto.Damage](),
		Heal:           NewBuilder[*messages.Heal, *chronicleproto.Heal](),
		ResourceChange: NewBuilder[*messages.ResourceChange, *chronicleproto.ResourceChange](),
		ExtraAttack:    NewBuilder[*messages.ExtraAttack, *chronicleproto.ExtraAttack](),
		Slain:          NewBuilder[*messages.Slain, *chronicleproto.Slain](),
		Casts:          NewBuilder[*messages.Cast, *chronicleproto.Cast](),
		Aura:           NewBuilder[*messages.Aura, *chronicleproto.Aura](),
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

	casts, err := e.Casts.Finalize(encounterID)
	if err != nil {
		return fmt.Errorf("finalizing casts events: %w", err)
	}

	auras, err := e.Aura.Finalize(encounterID)
	if err != nil {
		return fmt.Errorf("finalizing casts events: %w", err)
	}

	merge.Damage = append(merge.Damage, damagePayload...)
	merge.Healing = append(merge.Healing, healPayload...)
	merge.ResourceChange = append(merge.ResourceChange, rcPayload...)
	merge.ExtraAttack = append(merge.ExtraAttack, extraAttack...)
	merge.Slain = append(merge.Slain, slain...)
	merge.Cast = append(merge.Cast, casts...)
	merge.Aura = append(merge.Aura, auras...)

	return nil
}

func (e *EncounterEventsInProgress) Process(m messages.Message) error {
	e.setFirsts(m.Date())
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
	e.Aura.SetZero(e.first)
	e.Casts.SetZero(e.first)
}

func (e *EncounterEventsInProgress) nextIndex() int32 {
	e.cnter++
	return e.cnter - 1
}
