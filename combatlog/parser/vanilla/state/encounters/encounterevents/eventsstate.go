package encounterevents

import (
	"bytes"
	"compress/gzip"
	"context"
	"fmt"

	"github.com/Emyrk/chronicle/database"
	"github.com/google/uuid"
)

type Events struct {
	Damage         []byte
	Healing        []byte
	ResourceChange []byte
	ExtraAttack    []byte
	Slain          []byte
	Cast           []byte
	Aura           []byte
	SpellGo        []byte
	SpellStart     []byte
	SpellFail          []byte
	AuraCasts          []byte
	UnitClassification []byte
}

func NewEvents() *Events {
	return &Events{
		Damage:         make([]byte, 0),
		Healing:        make([]byte, 0),
		ResourceChange: make([]byte, 0),
		ExtraAttack:    make([]byte, 0),
		Slain:          make([]byte, 0),
		Cast:           make([]byte, 0),
		Aura:           make([]byte, 0),
		SpellGo:        make([]byte, 0),
		SpellStart:     make([]byte, 0),
		SpellFail:      make([]byte, 0),
		AuraCasts:          make([]byte, 0),
		UnitClassification: make([]byte, 0),
	}
}

func (e *Events) Insert(ctx context.Context, db database.Store, instanceID uuid.UUID) error {
	damagePayload, err := gzipData(e.Damage)
	if err != nil {
		return fmt.Errorf("gzip damage events: %w", err)
	}

	healingPayload, err := gzipData(e.Healing)
	if err != nil {
		return fmt.Errorf("gzip healing events: %w", err)
	}
	e.Healing = nil

	resourceChangePayload, err := gzipData(e.ResourceChange)
	if err != nil {
		return fmt.Errorf("gzip resource change events: %w", err)
	}
	e.ResourceChange = nil

	extraAttack, err := gzipData(e.ExtraAttack)
	if err != nil {
		return fmt.Errorf("gzip resource change events: %w", err)
	}
	e.ExtraAttack = nil

	slain, err := gzipData(e.Slain)
	if err != nil {
		return fmt.Errorf("gzip resource change events: %w", err)
	}
	e.Slain = nil

	casts, err := gzipData(e.Cast)
	if err != nil {
		return fmt.Errorf("gzip cast events: %w", err)
	}
	e.Cast = nil

	auras, err := gzipData(e.Aura)
	if err != nil {
		return fmt.Errorf("gzip cast events: %w", err)
	}
	e.Aura = nil

	spellGo, err := gzipData(e.SpellGo)
	if err != nil {
		return fmt.Errorf("gzip spell go events: %w", err)
	}
	e.SpellGo = nil

	spellStart, err := gzipData(e.SpellStart)
	if err != nil {
		return fmt.Errorf("gzip spell start events: %w", err)
	}

	auraCasts, err := gzipData(e.AuraCasts)
	if err != nil {
		return fmt.Errorf("gzip aura cast events: %w", err)
	}
	e.AuraCasts = nil

	spellFails, err := gzipData(e.SpellFail)
	if err != nil {
		return fmt.Errorf("gzip spell fail events: %w", err)
	}

	unitClassification, err := gzipData(e.UnitClassification)
	if err != nil {
		return fmt.Errorf("gzip unit classification events: %w", err)
	}

	res := db.InsertLogInstanceEvents(ctx, []database.InsertLogInstanceEventsParams{
		{
			InstanceID: instanceID,
			Type:       database.LogInstanceEventTypeDamage,
			Events:     damagePayload,
		},
		{
			InstanceID: instanceID,
			Type:       database.LogInstanceEventTypeHeal,
			Events:     healingPayload,
		},
		{
			InstanceID: instanceID,
			Type:       database.LogInstanceEventTypeResourceChange,
			Events:     resourceChangePayload,
		},
		{
			InstanceID: instanceID,
			Type:       database.LogInstanceEventTypeExtraAttack,
			Events:     extraAttack,
		},
		{
			InstanceID: instanceID,
			Type:       database.LogInstanceEventTypeSlain,
			Events:     slain,
		},
		{
			InstanceID: instanceID,
			Type:       database.LogInstanceEventTypeCast,
			Events:     casts,
		},
		{
			InstanceID: instanceID,
			Type:       database.LogInstanceEventTypeAura,
			Events:     auras,
		},
		{
			InstanceID: instanceID,
			Type:       database.LogInstanceEventTypeSpellGo,
			Events:     spellGo,
		},
		{
			InstanceID: instanceID,
			Type:       database.LogInstanceEventTypeAuraCast,
			Events:     auraCasts,
		},
		{
			InstanceID: instanceID,
			Type:       database.LogInstanceEventTypeSpellStart,
			Events:     spellStart,
		},
		{
			InstanceID: instanceID,
			Type:       database.LogInstanceEventTypeSpellFail,
			Events:     spellFails,
		},
		{
			InstanceID: instanceID,
			Type:       database.LogInstanceEventTypeUnitClassification,
			Events:     unitClassification,
		},
	})
	if err := res.Close(); err != nil {
		return fmt.Errorf("damage: %w", err)
	}

	return nil
}

func gzipData(data []byte) ([]byte, error) {
	output := bytes.NewBuffer(nil)
	writer := gzip.NewWriter(output)
	n, err := writer.Write(data)
	if err != nil {
		return nil, err
	}
	if n != len(data) {
		return nil, fmt.Errorf("expected to write %v bytes, wrote %v", len(data), n)
	}
	err = writer.Close()
	if err != nil {
		return nil, err
	}
	return output.Bytes(), nil
}
