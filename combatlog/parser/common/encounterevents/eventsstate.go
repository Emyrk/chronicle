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
	Damage             []byte
	Healing            []byte
	UnitPosition       []byte
	UnitResources      []byte
	ResourceChange     []byte
	ExtraAttack        []byte
	Slain              []byte
	Resurrection       []byte
	Cast               []byte
	Aura               []byte
	SpellGo            []byte
	SpellStart         []byte
	SpellFail          []byte
	AuraCasts          []byte
	UnitClassification []byte
	CombatantInfo      []byte
	Dispel             []byte
	Interrupt          []byte
	Absorbed           []byte
	CompanionStats     []byte
	Consume            []byte
	RaidGroup          []byte
}

func NewEvents() *Events {
	return &Events{
		Damage:             make([]byte, 0),
		Healing:            make([]byte, 0),
		UnitPosition:       make([]byte, 0),
		UnitResources:      make([]byte, 0),
		ResourceChange:     make([]byte, 0),
		ExtraAttack:        make([]byte, 0),
		Slain:              make([]byte, 0),
		Resurrection:       make([]byte, 0),
		Cast:               make([]byte, 0),
		Aura:               make([]byte, 0),
		SpellGo:            make([]byte, 0),
		SpellStart:         make([]byte, 0),
		SpellFail:          make([]byte, 0),
		AuraCasts:          make([]byte, 0),
		UnitClassification: make([]byte, 0),
		CombatantInfo:      make([]byte, 0),
		Dispel:             make([]byte, 0),
		Interrupt:          make([]byte, 0),
		Absorbed:           make([]byte, 0),
		CompanionStats:     make([]byte, 0),
		Consume:            make([]byte, 0),
		RaidGroup:          make([]byte, 0),
	}
}

type Stream struct {
	Type database.LogInstanceEventType
	Data []byte
}

func (e *Events) Compressed() ([]Stream, error) {
	streams := []struct {
		typ  database.LogInstanceEventType
		name string
		data *[]byte
	}{
		{database.LogInstanceEventTypeDamage, "damage", &e.Damage},
		{database.LogInstanceEventTypeHeal, "healing", &e.Healing},
		{database.LogInstanceEventTypeUnitPosition, "unit position", &e.UnitPosition},
		{database.LogInstanceEventTypeUnitResources, "unit resources", &e.UnitResources},
		{database.LogInstanceEventTypeResourceChange, "resource change", &e.ResourceChange},
		{database.LogInstanceEventTypeExtraAttack, "extra attack", &e.ExtraAttack},
		{database.LogInstanceEventTypeSlain, "slain", &e.Slain},
		{database.LogInstanceEventTypeRessurection, "resurrection", &e.Resurrection},
		{database.LogInstanceEventTypeCast, "cast", &e.Cast},
		{database.LogInstanceEventTypeAura, "aura", &e.Aura},
		{database.LogInstanceEventTypeSpellGo, "spell go", &e.SpellGo},
		{database.LogInstanceEventTypeAuraCast, "aura cast", &e.AuraCasts},
		{database.LogInstanceEventTypeSpellStart, "spell start", &e.SpellStart},
		{database.LogInstanceEventTypeSpellFail, "spell fail", &e.SpellFail},
		{database.LogInstanceEventTypeUnitClassification, "unit classification", &e.UnitClassification},
		{database.LogInstanceEventTypeCombatantInfo, "combatant info", &e.CombatantInfo},
		{database.LogInstanceEventTypeDispel, "dispel", &e.Dispel},
		{database.LogInstanceEventTypeInterrupt, "interrupt", &e.Interrupt},
		{database.LogInstanceEventTypeAbsorbed, "absorbed", &e.Absorbed},
		{database.LogInstanceEventTypeCompanionStats, "companion stats", &e.CompanionStats},
		{database.LogInstanceEventTypeConsume, "consume", &e.Consume},
		{database.LogInstanceEventTypeRaidGroup, "raid group", &e.RaidGroup},
	}

	compressed := make([]Stream, 0, len(streams))
	for _, stream := range streams {
		payload, err := gzipData(*stream.data)
		if err != nil {
			return nil, fmt.Errorf("gzip %s events: %w", stream.name, err)
		}
		*stream.data = nil
		compressed = append(compressed, Stream{Type: stream.typ, Data: payload})
	}
	return compressed, nil
}

func (e *Events) Insert(ctx context.Context, db database.Store, instanceID uuid.UUID) error {
	streams, err := e.Compressed()
	if err != nil {
		return err
	}
	params := make([]database.InsertLogInstanceEventsParams, 0, len(streams))
	for _, stream := range streams {
		params = append(params, database.InsertLogInstanceEventsParams{
			InstanceID: instanceID,
			Type:       stream.Type,
			Storage:    database.LogEventStorageDatabase,
			Events:     stream.Data,
			SizeBytes:  int64(len(stream.Data)),
		})
	}
	if err := db.InsertLogInstanceEvents(ctx, params).Close(); err != nil {
		return fmt.Errorf("insert events: %w", err)
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
