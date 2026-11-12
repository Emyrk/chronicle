package overviewmetrics

import (
	"bytes"
	"cmp"
	"encoding/json"
	"fmt"
	"io"
	"slices"

	"github.com/Emyrk/chronicle/combatlog/parser/common/unitdb"
)

const TrackerStateType = "overviewmetrics.Tracker"
const TrackerStateVersion uint32 = 1

// TrackerState owns the exact accumulated ability buckets. Unit classification
// remains an injected immutable dependency under the compatible session.
type TrackerState struct{ abilities []abilityStateValue }

type abilityStateValue struct {
	KeySpellID      int32  `json:"key_spell_id"`
	KeyName         string `json:"key_name"`
	KeyEnvironment  string `json:"key_environment_type"`
	SpellID         *int32 `json:"spell_id"`
	Name            string `json:"name"`
	Damage          int64  `json:"damage"`
	Hits            int64  `json:"hits"`
	EnvironmentType string `json:"environment_type"`
}

func (t *Tracker) CaptureState() (TrackerState, error) {
	if t == nil || t.units == nil || t.abilities == nil {
		return TrackerState{}, fmt.Errorf("incomplete overview metrics tracker")
	}
	abilities := make([]abilityStateValue, 0, len(t.abilities))
	for key, ability := range t.abilities {
		if ability == nil {
			return TrackerState{}, fmt.Errorf("nil deadliest ability")
		}
		value := abilityStateValue{
			KeySpellID: key.spellID, KeyName: key.name, KeyEnvironment: key.environmentType,
			Name: ability.Name, Damage: ability.Damage, Hits: ability.Hits,
			EnvironmentType: ability.EnvironmentType,
		}
		if ability.SpellID != nil {
			id := *ability.SpellID
			value.SpellID = &id
		}
		abilities = append(abilities, value)
	}
	slices.SortFunc(abilities, compareAbilityState)
	state := TrackerState{abilities: abilities}
	if err := state.validate(); err != nil {
		return TrackerState{}, err
	}
	return state, nil
}

func compareAbilityState(a, b abilityStateValue) int {
	if a.KeySpellID != b.KeySpellID {
		return cmp.Compare(a.KeySpellID, b.KeySpellID)
	}
	if a.KeyName != b.KeyName {
		if a.KeyName < b.KeyName {
			return -1
		}
		return 1
	}
	if a.KeyEnvironment < b.KeyEnvironment {
		return -1
	}
	if a.KeyEnvironment > b.KeyEnvironment {
		return 1
	}
	return 0
}

func (s TrackerState) Encode() ([]byte, error) {
	if err := s.validate(); err != nil {
		return nil, err
	}
	return json.Marshal(struct {
		Abilities []abilityStateValue `json:"abilities"`
	}{s.abilities})
}

func DecodeTrackerState(version uint32, payload []byte) (TrackerState, error) {
	if version != TrackerStateVersion {
		return TrackerState{}, fmt.Errorf("unsupported %s version %d", TrackerStateType, version)
	}
	if err := validateTrackerJSON(payload); err != nil {
		return TrackerState{}, err
	}
	var root struct {
		Abilities []abilityStateValue `json:"abilities"`
	}
	decoder := json.NewDecoder(bytes.NewReader(payload))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&root); err != nil {
		return TrackerState{}, fmt.Errorf("decode overview metrics tracker state: %w", err)
	}
	if err := decoder.Decode(new(any)); err != io.EOF {
		return TrackerState{}, fmt.Errorf("trailing overview metrics tracker state")
	}
	state := TrackerState{abilities: root.Abilities}
	if err := state.validate(); err != nil {
		return TrackerState{}, err
	}
	return state, nil
}

func validateTrackerJSON(payload []byte) error {
	decoder := json.NewDecoder(bytes.NewReader(payload))
	token, err := decoder.Token()
	if err != nil {
		return err
	}
	if token != json.Delim('{') {
		return fmt.Errorf("overview metrics tracker state must be an object")
	}
	seen := make(map[string]struct{})
	for decoder.More() {
		nameToken, err := decoder.Token()
		if err != nil {
			return err
		}
		name, ok := nameToken.(string)
		if !ok {
			return fmt.Errorf("overview metrics field name is not a string")
		}
		if _, exists := seen[name]; exists {
			return fmt.Errorf("duplicate overview metrics field %q", name)
		}
		seen[name] = struct{}{}
		var raw json.RawMessage
		if err := decoder.Decode(&raw); err != nil {
			return err
		}
	}
	if _, err := decoder.Token(); err != nil {
		return err
	}
	if err := decoder.Decode(new(any)); err != io.EOF {
		return fmt.Errorf("trailing overview metrics tracker state")
	}
	if len(seen) != 1 {
		return fmt.Errorf("overview metrics tracker state requires one field")
	}
	if _, ok := seen["abilities"]; !ok {
		return fmt.Errorf("missing overview metrics abilities")
	}
	var fields map[string]json.RawMessage
	if err := json.Unmarshal(payload, &fields); err != nil {
		return err
	}
	if bytes.Equal(bytes.TrimSpace(fields["abilities"]), []byte("null")) {
		return fmt.Errorf("overview metrics abilities cannot be null")
	}
	return nil
}

func (s TrackerState) validate() error {
	if s.abilities == nil {
		return fmt.Errorf("overview metrics abilities are nil")
	}
	seen := make(map[abilityKey]struct{}, len(s.abilities))
	for i, value := range s.abilities {
		key := abilityKey{spellID: value.KeySpellID, name: value.KeyName, environmentType: value.KeyEnvironment}
		if _, exists := seen[key]; exists {
			return fmt.Errorf("duplicate overview metric ability key at %d", i)
		}
		seen[key] = struct{}{}
		if value.Damage <= 0 || value.Hits <= 0 {
			return fmt.Errorf("invalid overview metric totals at %d", i)
		}
		if value.KeySpellID != 0 {
			if value.KeyName != "" || value.KeyEnvironment != "" || value.SpellID == nil || *value.SpellID != value.KeySpellID {
				return fmt.Errorf("invalid spell-keyed overview metric at %d", i)
			}
		} else if value.SpellID != nil || value.KeyName != value.Name || value.KeyEnvironment != value.EnvironmentType {
			return fmt.Errorf("invalid name-keyed overview metric at %d", i)
		}
	}
	return nil
}

func (s TrackerState) Restore(units *unitdb.Units) (*Tracker, error) {
	if units == nil {
		return nil, fmt.Errorf("nil overview metrics unit dependency")
	}
	if err := s.validate(); err != nil {
		return nil, err
	}
	tracker := NewTracker(units)
	for _, value := range s.abilities {
		key := abilityKey{spellID: value.KeySpellID, name: value.KeyName, environmentType: value.KeyEnvironment}
		ability := &DeadliestAbility{Name: value.Name, Damage: value.Damage, Hits: value.Hits, EnvironmentType: value.EnvironmentType}
		if value.SpellID != nil {
			id := *value.SpellID
			ability.SpellID = &id
		}
		tracker.abilities[key] = ability
	}
	return tracker, nil
}
