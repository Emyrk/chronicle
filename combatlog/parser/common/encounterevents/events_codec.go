package encounterevents

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"slices"
	"time"

	"github.com/Emyrk/chronicle/api/chronicleproto"
	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"google.golang.org/protobuf/encoding/protowire"
	"google.golang.org/protobuf/proto"
)

const EncounterEventsStateType = "encounterevents.EncounterEventsInProgress"
const EncounterEventsStateVersion uint32 = 1
const EventsStateType = "encounterevents.Events"
const EventsStateVersion uint32 = 1

const damageKindPending = "pending"
const damageKindEager = "eager"

type childStateValue struct {
	Version uint32          `json:"version"`
	Payload json.RawMessage `json:"payload"`
}

type damageBuilderValue struct {
	Kind  string          `json:"kind"`
	State childStateValue `json:"state"`
}

type encounterEventsValue struct {
	First     time.Time                  `json:"first"`
	Verbose   bool                       `json:"verbose"`
	Counter   int32                      `json:"counter"`
	Damage    damageBuilderValue         `json:"damage"`
	Position  childStateValue            `json:"position"`
	Telemetry childStateValue            `json:"telemetry"`
	Eager     map[string]childStateValue `json:"eager"`
}

// EncounterEventsState owns all encounter-scoped event output state. Pending
// Damage remains references to canonical shared Damage objects; every other
// eager stream owns exact encoded bytes. Restore only loads state and references.
type EncounterEventsState struct {
	value         encounterEventsValue
	damagePending *PendingDamageState
	damageEager   *EagerBuilderState
	position      PositionBuilderState
	telemetry     TelemetryDeduplicatorState
	eager         map[string]EagerBuilderState
}

var eagerStreamNames = []string{
	"absorbed", "aura", "aura_cast", "cast", "combatant_info", "companion_stats",
	"consume", "dispel", "extra_attack", "heal", "interrupt", "raid_group",
	"resource_change", "resurrection", "slain", "spell_fail", "spell_go",
	"spell_start", "unit_classification", "unit_resources",
}

func encodedChild(version uint32, state interface{ Encode() ([]byte, error) }) (childStateValue, error) {
	payload, err := state.Encode()
	if err != nil {
		return childStateValue{}, err
	}
	return childStateValue{Version: version, Payload: payload}, nil
}

func (e *EncounterEventsInProgress) CaptureState(captureDamage func(int, *messages.Damage) (string, error)) (EncounterEventsState, error) {
	if e == nil || e.Damage == nil || e.UnitPosition == nil || e.unitTelemetry == nil {
		return EncounterEventsState{}, fmt.Errorf("incomplete encounter events")
	}
	state := EncounterEventsState{value: encounterEventsValue{First: e.first, Verbose: e.verbose, Counter: e.cnter}, eager: make(map[string]EagerBuilderState, len(eagerStreamNames))}
	if e.Damage.buffered {
		pending, err := CapturePendingDamage(e.Damage, captureDamage)
		if err != nil {
			return EncounterEventsState{}, err
		}
		state.damagePending = &pending
		state.value.Damage.Kind = damageKindPending
	} else {
		eager, err := e.Damage.CaptureEagerState()
		if err != nil {
			return EncounterEventsState{}, err
		}
		state.damageEager = &eager
		state.value.Damage.Kind = damageKindEager
	}
	var err error
	if state.position, err = e.UnitPosition.CaptureState(); err != nil {
		return EncounterEventsState{}, err
	}
	if state.telemetry, err = e.unitTelemetry.CaptureState(); err != nil {
		return EncounterEventsState{}, err
	}
	captureEager := func(name string, capture func() (EagerBuilderState, error)) error {
		value, err := capture()
		if err != nil {
			return fmt.Errorf("capture %s builder: %w", name, err)
		}
		state.eager[name] = value
		return nil
	}
	captures := map[string]func() (EagerBuilderState, error){
		"heal": e.Heal.CaptureEagerState, "unit_resources": e.UnitResources.CaptureEagerState,
		"resource_change": e.ResourceChange.CaptureEagerState, "extra_attack": e.ExtraAttack.CaptureEagerState,
		"slain": e.Slain.CaptureEagerState, "resurrection": e.Resurrection.CaptureEagerState,
		"cast": e.Casts.CaptureEagerState, "aura": e.Aura.CaptureEagerState,
		"aura_cast": e.AuraCast.CaptureEagerState, "spell_go": e.SpellGo.CaptureEagerState,
		"spell_start": e.SpellStart.CaptureEagerState, "spell_fail": e.SpellFail.CaptureEagerState,
		"unit_classification": e.UnitClassification.CaptureEagerState, "combatant_info": e.CombatantInfo.CaptureEagerState,
		"dispel": e.Dispel.CaptureEagerState, "interrupt": e.Interrupt.CaptureEagerState,
		"absorbed": e.Absorbed.CaptureEagerState, "companion_stats": e.CompanionStats.CaptureEagerState,
		"consume": e.Consume.CaptureEagerState, "raid_group": e.RaidGroup.CaptureEagerState,
	}
	for _, name := range eagerStreamNames {
		capture := captures[name]
		if capture == nil {
			return EncounterEventsState{}, fmt.Errorf("missing eager builder %s", name)
		}
		if err := captureEager(name, capture); err != nil {
			return EncounterEventsState{}, err
		}
	}
	if err := state.validate(); err != nil {
		return EncounterEventsState{}, err
	}
	return state, nil
}

func (s EncounterEventsState) validate() error {
	if s.value.Counter < 0 {
		return fmt.Errorf("negative encounter event counter")
	}
	seenIndexes := make(map[int32]string)
	addIndex := func(index int32, owner string) error {
		if index < 0 || index >= s.value.Counter {
			return fmt.Errorf("%s event index %d is outside counter %d", owner, index, s.value.Counter)
		}
		if previous, exists := seenIndexes[index]; exists {
			return fmt.Errorf("event index %d is shared by %s and %s", index, previous, owner)
		}
		seenIndexes[index] = owner
		return nil
	}

	var eventCount int64
	switch {
	case s.damagePending != nil && s.damageEager == nil:
		if s.damagePending.First != s.value.First {
			return fmt.Errorf("pending damage first timestamp mismatch")
		}
		eventCount += s.damagePending.Count
		for i, entry := range s.damagePending.Entries {
			if err := addIndex(entry.Index, fmt.Sprintf("pending damage %d", i)); err != nil {
				return err
			}
		}
	case s.damageEager != nil && s.damagePending == nil:
		if s.damageEager.value.First != s.value.First {
			return fmt.Errorf("eager damage first timestamp mismatch")
		}
		eventCount += s.damageEager.value.Count
		if err := validateEagerIndexes("damage", *s.damageEager, addIndex); err != nil {
			return err
		}
	default:
		return fmt.Errorf("encounter events requires exactly one damage state")
	}
	if s.position.value.First != s.value.First {
		return fmt.Errorf("position first timestamp mismatch")
	}
	if s.position.value.Done {
		eventCount += s.position.value.Count
	} else {
		// Active position entries retain tombstones for compacted events, so their
		// slice length is the exact number of indexes consumed by this owner.
		eventCount += int64(len(s.position.value.Entries))
		for i, entry := range s.position.value.Entries {
			if entry == nil {
				continue
			}
			index, err := encodedEventIndex(entry)
			if err != nil {
				return fmt.Errorf("position entry %d index: %w", i, err)
			}
			if err := addIndex(index, fmt.Sprintf("position entry %d", i)); err != nil {
				return err
			}
		}
	}
	if len(s.eager) != len(eagerStreamNames) {
		return fmt.Errorf("unexpected eager state count")
	}
	for _, name := range eagerStreamNames {
		state, ok := s.eager[name]
		if !ok {
			return fmt.Errorf("missing eager state %s", name)
		}
		if state.value.First != s.value.First {
			return fmt.Errorf("eager stream %s first timestamp mismatch", name)
		}
		eventCount += state.value.Count
		if err := validateEagerIndexes(name, state, addIndex); err != nil {
			return err
		}
	}
	if s.position.value.Done {
		// Finalized position state intentionally discards compaction tombstones, so
		// only a lower bound remains. Other finalized stream counts stay exact.
		if int64(s.value.Counter) < eventCount {
			return fmt.Errorf("encounter event counter %d is below retained event count %d", s.value.Counter, eventCount)
		}
	} else if int64(s.value.Counter) != eventCount {
		return fmt.Errorf("encounter event counter %d does not match consumed event count %d", s.value.Counter, eventCount)
	}
	return nil
}

func validateEagerIndexes(name string, state EagerBuilderState, add func(int32, string) error) error {
	if state.value.Done {
		return nil
	}
	data := state.value.Data
	for record := 0; len(data) > 0; record++ {
		length, prefixLength := protowire.ConsumeVarint(data)
		if prefixLength < 0 {
			return fmt.Errorf("%s record %d has invalid length", name, record)
		}
		data = data[prefixLength:]
		if length > uint64(len(data)) {
			return fmt.Errorf("%s record %d is truncated", name, record)
		}
		entry := data[:int(length)]
		data = data[int(length):]
		index, err := encodedEventIndex(entry)
		if err != nil {
			return fmt.Errorf("%s record %d index: %w", name, record, err)
		}
		if err := add(index, fmt.Sprintf("%s record %d", name, record)); err != nil {
			return err
		}
	}
	return nil
}

func encodedEventIndex(entry []byte) (int32, error) {
	var metaBytes []byte
	foundMeta := false
	for len(entry) > 0 {
		number, wireType, tagLength := protowire.ConsumeTag(entry)
		if tagLength < 0 {
			return 0, fmt.Errorf("invalid protobuf tag")
		}
		entry = entry[tagLength:]
		if number == 1 {
			if foundMeta || wireType != protowire.BytesType {
				return 0, fmt.Errorf("invalid event metadata")
			}
			value, valueLength := protowire.ConsumeBytes(entry)
			if valueLength < 0 {
				return 0, fmt.Errorf("invalid event metadata bytes")
			}
			metaBytes = value
			foundMeta = true
			entry = entry[valueLength:]
			continue
		}
		valueLength := protowire.ConsumeFieldValue(number, wireType, entry)
		if valueLength < 0 {
			return 0, fmt.Errorf("invalid protobuf field")
		}
		entry = entry[valueLength:]
	}
	if !foundMeta {
		return 0, fmt.Errorf("missing event metadata")
	}
	var meta chronicleproto.EventMeta
	if err := proto.Unmarshal(metaBytes, &meta); err != nil {
		return 0, fmt.Errorf("decode event metadata: %w", err)
	}
	return meta.Index, nil
}

func (s EncounterEventsState) Encode() ([]byte, error) {
	if err := s.validate(); err != nil {
		return nil, err
	}
	value := s.value
	var err error
	switch {
	case s.damagePending != nil && s.damageEager == nil:
		value.Damage.Kind = damageKindPending
		value.Damage.State, err = encodedChild(PendingDamageStateVersion, *s.damagePending)
	case s.damageEager != nil && s.damagePending == nil:
		value.Damage.Kind = damageKindEager
		value.Damage.State, err = encodedChild(EagerBuilderStateVersion, *s.damageEager)
	default:
		return nil, fmt.Errorf("encounter events requires exactly one damage state")
	}
	if err != nil {
		return nil, err
	}
	if value.Position, err = encodedChild(PositionBuilderStateVersion, s.position); err != nil {
		return nil, err
	}
	if value.Telemetry, err = encodedChild(TelemetryDeduplicatorStateVersion, s.telemetry); err != nil {
		return nil, err
	}
	value.Eager = make(map[string]childStateValue, len(s.eager))
	for _, name := range eagerStreamNames {
		state, ok := s.eager[name]
		if !ok {
			return nil, fmt.Errorf("missing eager state %s", name)
		}
		child, err := encodedChild(EagerBuilderStateVersion, state)
		if err != nil {
			return nil, err
		}
		value.Eager[name] = child
	}
	if len(s.eager) != len(eagerStreamNames) {
		return nil, fmt.Errorf("unexpected eager state count")
	}
	return json.Marshal(value)
}

func decodeChild(raw json.RawMessage, label string) (childStateValue, error) {
	fields, err := decodeCompositionObject(raw, label)
	if err != nil {
		return childStateValue{}, err
	}
	if len(fields) != 2 || len(fields["version"]) == 0 || len(fields["payload"]) == 0 {
		return childStateValue{}, fmt.Errorf("%s requires version and payload", label)
	}
	if bytes.Equal(bytes.TrimSpace(fields["version"]), []byte("null")) || bytes.Equal(bytes.TrimSpace(fields["payload"]), []byte("null")) {
		return childStateValue{}, fmt.Errorf("%s version and payload cannot be null", label)
	}
	var child childStateValue
	decoder := json.NewDecoder(bytes.NewReader(raw))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&child); err != nil {
		return childStateValue{}, err
	}
	return child, nil
}

func DecodeEncounterEventsState(version uint32, payload []byte) (EncounterEventsState, error) {
	if version != EncounterEventsStateVersion {
		return EncounterEventsState{}, fmt.Errorf("unsupported %s version %d", EncounterEventsStateType, version)
	}
	fields, err := decodeCompositionObject(payload, "encounter events state")
	if err != nil {
		return EncounterEventsState{}, err
	}
	required := []string{"first", "verbose", "counter", "damage", "position", "telemetry", "eager"}
	if len(fields) != len(required) {
		return EncounterEventsState{}, fmt.Errorf("encounter events state requires %d fields", len(required))
	}
	for _, name := range required {
		if len(fields[name]) == 0 || bytes.Equal(bytes.TrimSpace(fields[name]), []byte("null")) {
			return EncounterEventsState{}, fmt.Errorf("encounter events field %q is missing or null", name)
		}
	}
	var raw struct {
		First     time.Time                  `json:"first"`
		Verbose   bool                       `json:"verbose"`
		Counter   int32                      `json:"counter"`
		Damage    json.RawMessage            `json:"damage"`
		Position  json.RawMessage            `json:"position"`
		Telemetry json.RawMessage            `json:"telemetry"`
		Eager     map[string]json.RawMessage `json:"eager"`
	}
	decoder := json.NewDecoder(bytes.NewReader(payload))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&raw); err != nil {
		return EncounterEventsState{}, err
	}
	if err := decoder.Decode(new(any)); err != io.EOF {
		return EncounterEventsState{}, fmt.Errorf("trailing encounter events state")
	}
	state := EncounterEventsState{value: encounterEventsValue{First: raw.First, Verbose: raw.Verbose, Counter: raw.Counter}, eager: make(map[string]EagerBuilderState, len(raw.Eager))}
	if raw.Counter < 0 {
		return EncounterEventsState{}, fmt.Errorf("negative encounter event counter")
	}
	damageFields, err := decodeCompositionObject(raw.Damage, "damage builder state")
	if err != nil {
		return EncounterEventsState{}, err
	}
	if len(damageFields) != 2 || len(damageFields["kind"]) == 0 || len(damageFields["state"]) == 0 {
		return EncounterEventsState{}, fmt.Errorf("damage builder requires kind and state")
	}
	if err := json.Unmarshal(damageFields["kind"], &state.value.Damage.Kind); err != nil {
		return EncounterEventsState{}, err
	}
	damageChild, err := decodeChild(damageFields["state"], "damage child state")
	if err != nil {
		return EncounterEventsState{}, err
	}
	switch state.value.Damage.Kind {
	case damageKindPending:
		decoded, err := DecodePendingDamageState(damageChild.Version, damageChild.Payload)
		if err != nil {
			return EncounterEventsState{}, err
		}
		state.damagePending = &decoded
	case damageKindEager:
		decoded, err := DecodeEagerBuilderState(damageChild.Version, damageChild.Payload)
		if err != nil {
			return EncounterEventsState{}, err
		}
		state.damageEager = &decoded
	default:
		return EncounterEventsState{}, fmt.Errorf("unknown damage builder kind %q", state.value.Damage.Kind)
	}
	positionChild, err := decodeChild(raw.Position, "position child state")
	if err != nil {
		return EncounterEventsState{}, err
	}
	if state.position, err = DecodePositionBuilderState(positionChild.Version, positionChild.Payload); err != nil {
		return EncounterEventsState{}, err
	}
	telemetryChild, err := decodeChild(raw.Telemetry, "telemetry child state")
	if err != nil {
		return EncounterEventsState{}, err
	}
	if state.telemetry, err = DecodeTelemetryDeduplicatorState(telemetryChild.Version, telemetryChild.Payload); err != nil {
		return EncounterEventsState{}, err
	}
	if len(raw.Eager) != len(eagerStreamNames) {
		return EncounterEventsState{}, fmt.Errorf("unexpected eager stream count")
	}
	for _, name := range eagerStreamNames {
		rawChild, ok := raw.Eager[name]
		if !ok {
			return EncounterEventsState{}, fmt.Errorf("missing eager stream %s", name)
		}
		child, err := decodeChild(rawChild, "eager stream "+name)
		if err != nil {
			return EncounterEventsState{}, err
		}
		decoded, err := DecodeEagerBuilderState(child.Version, child.Payload)
		if err != nil {
			return EncounterEventsState{}, err
		}
		state.eager[name] = decoded
	}
	if err := state.validate(); err != nil {
		return EncounterEventsState{}, err
	}
	return state, nil
}

func decodeCompositionObject(payload []byte, label string) (map[string]json.RawMessage, error) {
	decoder := json.NewDecoder(bytes.NewReader(payload))
	token, err := decoder.Token()
	if err != nil {
		return nil, err
	}
	if token != json.Delim('{') {
		return nil, fmt.Errorf("%s must be an object", label)
	}
	fields := make(map[string]json.RawMessage)
	for decoder.More() {
		token, err := decoder.Token()
		if err != nil {
			return nil, err
		}
		name, ok := token.(string)
		if !ok {
			return nil, fmt.Errorf("%s field name is not a string", label)
		}
		if _, exists := fields[name]; exists {
			return nil, fmt.Errorf("duplicate %s field %q", label, name)
		}
		var value json.RawMessage
		if err := decoder.Decode(&value); err != nil {
			return nil, err
		}
		fields[name] = value
	}
	if _, err := decoder.Token(); err != nil {
		return nil, err
	}
	if err := decoder.Decode(new(any)); err != io.EOF {
		return nil, fmt.Errorf("trailing %s data", label)
	}
	return fields, nil
}

func (s EncounterEventsState) Restore(resolveDamage func(string) (*messages.Damage, error)) (*EncounterEventsInProgress, error) {
	if err := s.validate(); err != nil {
		return nil, err
	}
	var damage *Builder[*messages.Damage, *chronicleproto.Damage]
	var err error
	switch {
	case s.damagePending != nil && s.damageEager == nil:
		damage, err = s.damagePending.Restore(resolveDamage)
	case s.damageEager != nil && s.damagePending == nil:
		damage, err = RestoreEagerBuilder[*messages.Damage, *chronicleproto.Damage](*s.damageEager)
	default:
		return nil, fmt.Errorf("encounter events requires exactly one damage state")
	}
	if err != nil {
		return nil, err
	}
	position, err := s.position.Restore()
	if err != nil {
		return nil, err
	}
	telemetry, err := s.telemetry.Restore()
	if err != nil {
		return nil, err
	}
	eager := func(name string) (EagerBuilderState, error) {
		state, ok := s.eager[name]
		if !ok {
			return EagerBuilderState{}, fmt.Errorf("missing eager stream %s", name)
		}
		return state, nil
	}
	get := func(name string) EagerBuilderState {
		state, _ := eager(name)
		return state
	}
	for _, name := range eagerStreamNames {
		if _, err := eager(name); err != nil {
			return nil, err
		}
	}
	heal, err := RestoreEagerBuilder[*messages.Heal, *chronicleproto.Heal](get("heal"))
	if err != nil {
		return nil, err
	}
	unitResources, err := RestoreEagerBuilder[*messages.UnitResources, *chronicleproto.UnitResources](get("unit_resources"))
	if err != nil {
		return nil, err
	}
	resourceChange, err := RestoreEagerBuilder[*messages.ResourceChange, *chronicleproto.ResourceChange](get("resource_change"))
	if err != nil {
		return nil, err
	}
	extraAttack, err := RestoreEagerBuilder[*messages.ExtraAttack, *chronicleproto.ExtraAttack](get("extra_attack"))
	if err != nil {
		return nil, err
	}
	slain, err := RestoreEagerBuilder[*messages.Slain, *chronicleproto.Slain](get("slain"))
	if err != nil {
		return nil, err
	}
	resurrection, err := RestoreEagerBuilder[*messages.Resurrection, *chronicleproto.Resurrection](get("resurrection"))
	if err != nil {
		return nil, err
	}
	//nolint:staticcheck // Legacy Cast stream remains part of EncounterEvents.
	casts, err := RestoreEagerBuilder[*messages.Cast, *chronicleproto.Cast](get("cast"))
	if err != nil {
		return nil, err
	}
	aura, err := RestoreEagerBuilder[*messages.Aura, *chronicleproto.Aura](get("aura"))
	if err != nil {
		return nil, err
	}
	auraCast, err := RestoreEagerBuilder[*messages.AuraCast, *chronicleproto.AuraCast](get("aura_cast"))
	if err != nil {
		return nil, err
	}
	spellGo, err := RestoreEagerBuilder[*messages.SpellGo, *chronicleproto.SpellGo](get("spell_go"))
	if err != nil {
		return nil, err
	}
	spellStart, err := RestoreEagerBuilder[*messages.SpellStart, *chronicleproto.SpellStart](get("spell_start"))
	if err != nil {
		return nil, err
	}
	spellFail, err := RestoreEagerBuilder[*messages.SpellFail, *chronicleproto.SpellFail](get("spell_fail"))
	if err != nil {
		return nil, err
	}
	unitClassification, err := RestoreEagerBuilder[*messages.UnitClassificationEvent, *chronicleproto.UnitClassification](get("unit_classification"))
	if err != nil {
		return nil, err
	}
	combatantInfo, err := RestoreEagerBuilder[*messages.Combatant, *chronicleproto.CombatantInfo](get("combatant_info"))
	if err != nil {
		return nil, err
	}
	dispel, err := RestoreEagerBuilder[*messages.Dispel, *chronicleproto.Dispel](get("dispel"))
	if err != nil {
		return nil, err
	}
	interrupt, err := RestoreEagerBuilder[*messages.Interrupt, *chronicleproto.Interrupt](get("interrupt"))
	if err != nil {
		return nil, err
	}
	absorbed, err := RestoreEagerBuilder[*messages.Absorbed, *chronicleproto.Absorbed](get("absorbed"))
	if err != nil {
		return nil, err
	}
	companionStats, err := RestoreEagerBuilder[*messages.CompanionStats, *chronicleproto.CompanionStats](get("companion_stats"))
	if err != nil {
		return nil, err
	}
	consume, err := RestoreEagerBuilder[*messages.Consume, *chronicleproto.Consume](get("consume"))
	if err != nil {
		return nil, err
	}
	raidGroup, err := RestoreEagerBuilder[*messages.RaidGroup, *chronicleproto.RaidGroup](get("raid_group"))
	if err != nil {
		return nil, err
	}
	return &EncounterEventsInProgress{
		unitTelemetry: telemetry, first: s.value.First, verbose: s.value.Verbose,
		Damage: damage, Heal: heal, UnitPosition: position, UnitResources: unitResources,
		ResourceChange: resourceChange, ExtraAttack: extraAttack, Slain: slain,
		Resurrection: resurrection, Casts: casts, Aura: aura, AuraCast: auraCast,
		SpellGo: spellGo, SpellStart: spellStart, SpellFail: spellFail,
		UnitClassification: unitClassification, CombatantInfo: combatantInfo,
		Dispel: dispel, Interrupt: interrupt, Absorbed: absorbed,
		CompanionStats: companionStats, Consume: consume, RaidGroup: raidGroup,
		cnter: s.value.Counter,
	}, nil
}

type EventsState struct{ value eventsValue }
type eventsValue struct {
	Damage             []byte `json:"damage"`
	Healing            []byte `json:"healing"`
	UnitPosition       []byte `json:"unit_position"`
	UnitResources      []byte `json:"unit_resources"`
	ResourceChange     []byte `json:"resource_change"`
	ExtraAttack        []byte `json:"extra_attack"`
	Slain              []byte `json:"slain"`
	Resurrection       []byte `json:"resurrection"`
	Cast               []byte `json:"cast"`
	Aura               []byte `json:"aura"`
	SpellGo            []byte `json:"spell_go"`
	SpellStart         []byte `json:"spell_start"`
	SpellFail          []byte `json:"spell_fail"`
	AuraCasts          []byte `json:"aura_casts"`
	UnitClassification []byte `json:"unit_classification"`
	CombatantInfo      []byte `json:"combatant_info"`
	Dispel             []byte `json:"dispel"`
	Interrupt          []byte `json:"interrupt"`
	Absorbed           []byte `json:"absorbed"`
	CompanionStats     []byte `json:"companion_stats"`
	Consume            []byte `json:"consume"`
	RaidGroup          []byte `json:"raid_group"`
}

var eventsFieldNames = []string{"damage", "healing", "unit_position", "unit_resources", "resource_change", "extra_attack", "slain", "resurrection", "cast", "aura", "spell_go", "spell_start", "spell_fail", "aura_casts", "unit_classification", "combatant_info", "dispel", "interrupt", "absorbed", "companion_stats", "consume", "raid_group"}

func cloneEventsValue(v eventsValue) eventsValue {
	v.Damage = slices.Clone(v.Damage)
	v.Healing = slices.Clone(v.Healing)
	v.UnitPosition = slices.Clone(v.UnitPosition)
	v.UnitResources = slices.Clone(v.UnitResources)
	v.ResourceChange = slices.Clone(v.ResourceChange)
	v.ExtraAttack = slices.Clone(v.ExtraAttack)
	v.Slain = slices.Clone(v.Slain)
	v.Resurrection = slices.Clone(v.Resurrection)
	v.Cast = slices.Clone(v.Cast)
	v.Aura = slices.Clone(v.Aura)
	v.SpellGo = slices.Clone(v.SpellGo)
	v.SpellStart = slices.Clone(v.SpellStart)
	v.SpellFail = slices.Clone(v.SpellFail)
	v.AuraCasts = slices.Clone(v.AuraCasts)
	v.UnitClassification = slices.Clone(v.UnitClassification)
	v.CombatantInfo = slices.Clone(v.CombatantInfo)
	v.Dispel = slices.Clone(v.Dispel)
	v.Interrupt = slices.Clone(v.Interrupt)
	v.Absorbed = slices.Clone(v.Absorbed)
	v.CompanionStats = slices.Clone(v.CompanionStats)
	v.Consume = slices.Clone(v.Consume)
	v.RaidGroup = slices.Clone(v.RaidGroup)
	return v
}

func (e *Events) CaptureState() (EventsState, error) {
	if e == nil {
		return EventsState{}, fmt.Errorf("nil finalized events")
	}
	return EventsState{cloneEventsValue(eventsValue{
		Damage: e.Damage, Healing: e.Healing, UnitPosition: e.UnitPosition,
		UnitResources: e.UnitResources, ResourceChange: e.ResourceChange,
		ExtraAttack: e.ExtraAttack, Slain: e.Slain, Resurrection: e.Resurrection,
		Cast: e.Cast, Aura: e.Aura, SpellGo: e.SpellGo, SpellStart: e.SpellStart,
		SpellFail: e.SpellFail, AuraCasts: e.AuraCasts,
		UnitClassification: e.UnitClassification, CombatantInfo: e.CombatantInfo,
		Dispel: e.Dispel, Interrupt: e.Interrupt, Absorbed: e.Absorbed,
		CompanionStats: e.CompanionStats, Consume: e.Consume, RaidGroup: e.RaidGroup,
	})}, nil
}
func (s EventsState) Encode() ([]byte, error) { return json.Marshal(s.value) }
func DecodeEventsState(version uint32, payload []byte) (EventsState, error) {
	if version != EventsStateVersion {
		return EventsState{}, fmt.Errorf("unsupported %s version %d", EventsStateType, version)
	}
	fields, err := decodeCompositionObject(payload, "finalized events state")
	if err != nil {
		return EventsState{}, err
	}
	if len(fields) != len(eventsFieldNames) {
		return EventsState{}, fmt.Errorf("finalized events state requires %d fields", len(eventsFieldNames))
	}
	for _, name := range eventsFieldNames {
		if len(fields[name]) == 0 {
			return EventsState{}, fmt.Errorf("missing finalized events field %s", name)
		}
	}
	var value eventsValue
	decoder := json.NewDecoder(bytes.NewReader(payload))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&value); err != nil {
		return EventsState{}, err
	}
	if err := decoder.Decode(new(any)); err != io.EOF {
		return EventsState{}, fmt.Errorf("trailing finalized events state")
	}
	return EventsState{cloneEventsValue(value)}, nil
}
func (s EventsState) Restore() (*Events, error) {
	v := cloneEventsValue(s.value)
	return &Events{Damage: v.Damage, Healing: v.Healing, UnitPosition: v.UnitPosition, UnitResources: v.UnitResources, ResourceChange: v.ResourceChange, ExtraAttack: v.ExtraAttack, Slain: v.Slain, Resurrection: v.Resurrection, Cast: v.Cast, Aura: v.Aura, SpellGo: v.SpellGo, SpellStart: v.SpellStart, SpellFail: v.SpellFail, AuraCasts: v.AuraCasts, UnitClassification: v.UnitClassification, CombatantInfo: v.CombatantInfo, Dispel: v.Dispel, Interrupt: v.Interrupt, Absorbed: v.Absorbed, CompanionStats: v.CompanionStats, Consume: v.Consume, RaidGroup: v.RaidGroup}, nil
}
