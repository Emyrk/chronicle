package characterset

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"reflect"
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/guid"
)

const StateType = "characterset.Set"
const StateVersion uint32 = 1

// State owns ordered indexes, not characters. References identify canonical
// character values in the caller's graph. Awake rows resolve through all rows,
// guaranteeing the same objects without invoking the resolver twice.
type State struct{ value stateValue }
type stateValue struct {
	All   []characterValue `json:"all"`
	Awake []awakeValue     `json:"awake"`
}
type characterValue struct {
	GUID      guid.GUID `json:"guid"`
	Reference string    `json:"reference"`
}
type awakeValue struct {
	GUID         guid.GUID `json:"guid"`
	TouchedAt    time.Time `json:"touched_at"`
	DormantAfter int64     `json:"dormant_after"`
}

func (s *Set[T]) CaptureState(capture func(T) (string, error)) (State, error) {
	if s == nil || s.characters == nil || s.awake == nil {
		return State{}, fmt.Errorf("uninitialized character set")
	}
	v := stateValue{All: make([]characterValue, 0, s.characters.Len()), Awake: make([]awakeValue, 0, s.awake.Len())}
	for pair := s.characters.Oldest(); pair != nil; pair = pair.Next() {
		if capture == nil {
			return State{}, fmt.Errorf("missing character capture")
		}
		reference, err := capture(pair.Value)
		if err != nil {
			return State{}, err
		}
		v.All = append(v.All, characterValue{pair.Key, reference})
	}
	for pair := s.awake.Oldest(); pair != nil; pair = pair.Next() {
		v.Awake = append(v.Awake, awakeValue{pair.Key, pair.Value.touchedAt, pair.Value.dormantAfter})
	}
	if err := v.validate(); err != nil {
		return State{}, err
	}
	return State{v}, nil
}
func (s State) Encode() ([]byte, error) { return json.Marshal(s.value) }
func (v stateValue) validate() error {
	if v.All == nil || v.Awake == nil {
		return fmt.Errorf("character indexes must be arrays")
	}
	all := make(map[guid.GUID]bool, len(v.All))
	refs := make(map[string]bool, len(v.All))
	for _, row := range v.All {
		if all[row.GUID] || row.Reference == "" || refs[row.Reference] {
			return fmt.Errorf("duplicate character or invalid reference")
		}
		all[row.GUID] = true
		refs[row.Reference] = true
	}
	awake := make(map[guid.GUID]bool, len(v.Awake))
	for _, row := range v.Awake {
		if !all[row.GUID] || awake[row.GUID] {
			return fmt.Errorf("unknown or duplicate awake character")
		}
		awake[row.GUID] = true
	}
	return nil
}
func DecodeState(version uint32, payload []byte) (State, error) {
	if version != StateVersion {
		return State{}, fmt.Errorf("unsupported character set version %d", version)
	}
	// Validate complete field presence and duplicate keys, including zero timestamps
	// and deadlines. Never synthesize these from current character activity.
	root, err := stateFields(payload, "all", "awake")
	if err != nil {
		return State{}, err
	}
	for key, names := range map[string][]string{"all": {"guid", "reference"}, "awake": {"guid", "touched_at", "dormant_after"}} {
		var rows []json.RawMessage
		if err := json.Unmarshal(root[key], &rows); err != nil {
			return State{}, err
		}
		for _, row := range rows {
			if _, err := stateFields(row, names...); err != nil {
				return State{}, err
			}
		}
	}
	var v stateValue
	d := json.NewDecoder(bytes.NewReader(payload))
	d.DisallowUnknownFields()
	if err := d.Decode(&v); err != nil {
		return State{}, err
	}
	if err := v.validate(); err != nil {
		return State{}, err
	}
	return State{v}, nil
}
func stateFields(payload []byte, names ...string) (map[string]json.RawMessage, error) {
	d := json.NewDecoder(bytes.NewReader(payload))
	token, err := d.Token()
	if err != nil {
		return nil, err
	}
	if token != json.Delim('{') {
		return nil, fmt.Errorf("character set value must be object")
	}
	fields := make(map[string]json.RawMessage)
	for d.More() {
		token, err := d.Token()
		if err != nil {
			return nil, err
		}
		key := token.(string)
		if _, ok := fields[key]; ok {
			return nil, fmt.Errorf("duplicate character set field")
		}
		var raw json.RawMessage
		if err := d.Decode(&raw); err != nil {
			return nil, err
		}
		fields[key] = raw
	}
	if _, err := d.Token(); err != nil {
		return nil, err
	}
	if err := d.Decode(new(any)); err != io.EOF {
		return nil, fmt.Errorf("trailing character set value")
	}
	if len(fields) != len(names) {
		return nil, fmt.Errorf("incomplete character set fields")
	}
	for _, key := range names {
		value, ok := fields[key]
		if !ok || bytes.Equal(bytes.TrimSpace(value), []byte("null")) {
			return nil, fmt.Errorf("missing or null character set field %s", key)
		}
	}
	return fields, nil
}

// RestoreState attaches already-restored canonical characters to a fresh set.
// ID is used only to validate identity. No Add/Touch, activity predicates, hooks,
// dormancy calculation, or character constructor runs during restoration.
func RestoreState[T IsActive](s State, resolve func(string) (T, error)) (*Set[T], error) {
	if err := s.value.validate(); err != nil {
		return nil, err
	}
	candidate := New[T]()
	for _, row := range s.value.All {
		if resolve == nil {
			return nil, fmt.Errorf("missing character resolver")
		}
		character, err := resolve(row.Reference)
		if err != nil {
			return nil, err
		}
		// Generic T can be an interface containing a typed nil pointer. Reflection
		// here only guards that boundary, never serializes or reconstructs objects.
		value := reflect.ValueOf(character)
		if !value.IsValid() {
			return nil, fmt.Errorf("nil resolved character")
		}
		switch value.Kind() {
		case reflect.Chan, reflect.Func, reflect.Interface, reflect.Map, reflect.Pointer, reflect.Slice:
			if value.IsNil() {
				return nil, fmt.Errorf("nil resolved character")
			}
		}
		if character.ID() != row.GUID {
			return nil, fmt.Errorf("resolved character GUID mismatch")
		}
		candidate.characters.Set(row.GUID, character)
	}
	for _, row := range s.value.Awake {
		character, _ := candidate.characters.Get(row.GUID)
		candidate.awake.Set(row.GUID, awakeEntry[T]{character: character, touchedAt: row.TouchedAt, dormantAfter: row.DormantAfter})
	}
	return candidate, nil
}
