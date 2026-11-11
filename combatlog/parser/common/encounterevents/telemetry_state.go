package encounterevents

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"maps"
	"slices"

	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/types"
)

const TelemetryDeduplicatorStateType = "encounterevents.UnitTelemetryDeduplicator"
const TelemetryDeduplicatorStateVersion uint32 = 1

type TelemetryDeduplicatorState struct{ resources []unitResourcesValue }

type unitResourcesValue struct {
	Unit          guid.GUID      `json:"unit"`
	CurrentHealth int64          `json:"current_health"`
	MaximumHealth int64          `json:"maximum_health"`
	Absorb        int32          `json:"absorb"`
	PowerType     types.Resource `json:"power_type"`
	CurrentPower  int32          `json:"current_power"`
	MaximumPower  int32          `json:"maximum_power"`
	AttackPower   int32          `json:"attack_power"`
	SpellPower    int32          `json:"spell_power"`
	Armor         int32          `json:"armor"`
}

func (d *unitTelemetryDeduplicator) CaptureState() (TelemetryDeduplicatorState, error) {
	if d == nil || d.resources == nil {
		return TelemetryDeduplicatorState{}, fmt.Errorf("telemetry deduplicator requires resources map")
	}
	resources := make([]unitResourcesValue, 0, len(d.resources))
	for _, unit := range slices.Sorted(maps.Keys(d.resources)) {
		value := d.resources[unit]
		resources = append(resources, unitResourcesValue{
			Unit: unit, CurrentHealth: value.currentHealth, MaximumHealth: value.maximumHealth,
			Absorb: value.absorb, PowerType: value.powerType, CurrentPower: value.currentPower,
			MaximumPower: value.maximumPower, AttackPower: value.attackPower,
			SpellPower: value.spellPower, Armor: value.armor,
		})
	}
	return TelemetryDeduplicatorState{resources: resources}, nil
}

func (s TelemetryDeduplicatorState) Encode() ([]byte, error) {
	return json.Marshal(struct {
		Resources []unitResourcesValue `json:"resources"`
	}{s.resources})
}

func DecodeTelemetryDeduplicatorState(version uint32, payload []byte) (TelemetryDeduplicatorState, error) {
	if version != TelemetryDeduplicatorStateVersion {
		return TelemetryDeduplicatorState{}, fmt.Errorf("unsupported %s version %d", TelemetryDeduplicatorStateType, version)
	}
	fields, err := decodeTelemetryObject(payload)
	if err != nil {
		return TelemetryDeduplicatorState{}, err
	}
	if len(fields) != 1 || len(fields["resources"]) == 0 || bytes.Equal(bytes.TrimSpace(fields["resources"]), []byte("null")) {
		return TelemetryDeduplicatorState{}, fmt.Errorf("telemetry state requires resources")
	}
	var root struct {
		Resources []json.RawMessage `json:"resources"`
	}
	decoder := json.NewDecoder(bytes.NewReader(payload))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&root); err != nil {
		return TelemetryDeduplicatorState{}, fmt.Errorf("decode telemetry state: %w", err)
	}
	if err := decoder.Decode(new(any)); err != io.EOF {
		return TelemetryDeduplicatorState{}, fmt.Errorf("trailing telemetry state")
	}
	resources := make([]unitResourcesValue, len(root.Resources))
	seen := make(map[guid.GUID]struct{}, len(root.Resources))
	for i, raw := range root.Resources {
		entryFields, err := decodeTelemetryObject(raw)
		if err != nil {
			return TelemetryDeduplicatorState{}, fmt.Errorf("telemetry resource %d: %w", i, err)
		}
		required := []string{"unit", "current_health", "maximum_health", "absorb", "power_type", "current_power", "maximum_power", "attack_power", "spell_power", "armor"}
		if len(entryFields) != len(required) {
			return TelemetryDeduplicatorState{}, fmt.Errorf("telemetry resource %d requires %d fields", i, len(required))
		}
		for _, name := range required {
			if len(entryFields[name]) == 0 || bytes.Equal(bytes.TrimSpace(entryFields[name]), []byte("null")) {
				return TelemetryDeduplicatorState{}, fmt.Errorf("telemetry resource %d missing or null %s", i, name)
			}
		}
		entryDecoder := json.NewDecoder(bytes.NewReader(raw))
		entryDecoder.DisallowUnknownFields()
		if err := entryDecoder.Decode(&resources[i]); err != nil {
			return TelemetryDeduplicatorState{}, fmt.Errorf("telemetry resource %d: %w", i, err)
		}
		if _, exists := seen[resources[i].Unit]; exists {
			return TelemetryDeduplicatorState{}, fmt.Errorf("duplicate telemetry unit %s", resources[i].Unit)
		}
		seen[resources[i].Unit] = struct{}{}
	}
	return TelemetryDeduplicatorState{resources: resources}, nil
}

func decodeTelemetryObject(payload []byte) (map[string]json.RawMessage, error) {
	decoder := json.NewDecoder(bytes.NewReader(payload))
	token, err := decoder.Token()
	if err != nil {
		return nil, err
	}
	if token != json.Delim('{') {
		return nil, fmt.Errorf("telemetry state must be an object")
	}
	fields := make(map[string]json.RawMessage)
	for decoder.More() {
		token, err := decoder.Token()
		if err != nil {
			return nil, err
		}
		name, ok := token.(string)
		if !ok {
			return nil, fmt.Errorf("telemetry field name is not a string")
		}
		if _, exists := fields[name]; exists {
			return nil, fmt.Errorf("duplicate telemetry field %q", name)
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
		return nil, fmt.Errorf("trailing telemetry state")
	}
	return fields, nil
}

func (s TelemetryDeduplicatorState) Restore() (*unitTelemetryDeduplicator, error) {
	resources := make(map[guid.GUID]unitResourcesSnapshot, len(s.resources))
	for _, value := range s.resources {
		if _, exists := resources[value.Unit]; exists {
			return nil, fmt.Errorf("duplicate telemetry unit %s", value.Unit)
		}
		resources[value.Unit] = unitResourcesSnapshot{
			currentHealth: value.CurrentHealth, maximumHealth: value.MaximumHealth,
			absorb: value.Absorb, powerType: value.PowerType, currentPower: value.CurrentPower,
			maximumPower: value.MaximumPower, attackPower: value.AttackPower,
			spellPower: value.SpellPower, armor: value.Armor,
		}
	}
	return &unitTelemetryDeduplicator{resources: resources}, nil
}
