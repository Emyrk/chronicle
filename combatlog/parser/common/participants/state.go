package participants

import (
	"bytes"
	"cmp"
	"encoding/json"
	"fmt"
	"io"
	"slices"

	"github.com/Emyrk/chronicle/combatlog/parser/guid"
)

const TrackerStateType = "participants.Tracker"
const TrackerStateVersion uint32 = 1

// TrackerState is a detached copy of the participant tracker. It contains only
// owner state; hook registration remains session composition.
type TrackerState struct{ value trackerStateValue }

type trackerStateValue struct {
	Active      []activeParticipantValue `json:"active"`
	FightActive bool                     `json:"fight_active"`
	Known       []guid.GUID              `json:"known"`
	Dead        []guid.GUID              `json:"dead"`
}

type activeParticipantValue struct {
	GUID   guid.GUID `json:"guid"`
	Active bool      `json:"active"`
}

func (t *Tracker) CaptureState() (TrackerState, error) {
	if t == nil || t.Active == nil || t.known == nil || t.dead == nil {
		return TrackerState{}, fmt.Errorf("incomplete participants tracker")
	}
	value := trackerStateValue{FightActive: t.fightActive}
	value.Active = make([]activeParticipantValue, 0, len(t.Active))
	for id, active := range t.Active {
		value.Active = append(value.Active, activeParticipantValue{GUID: id, Active: active})
	}
	slices.SortFunc(value.Active, func(a, b activeParticipantValue) int { return cmp.Compare(a.GUID, b.GUID) })
	value.Known = sortedGUIDSet(t.known)
	value.Dead = sortedGUIDSet(t.dead)
	state := TrackerState{value: value}
	if err := state.validate(); err != nil {
		return TrackerState{}, err
	}
	return state, nil
}

func sortedGUIDSet(values map[guid.GUID]struct{}) []guid.GUID {
	result := make([]guid.GUID, 0, len(values))
	for value := range values {
		result = append(result, value)
	}
	slices.Sort(result)
	return result
}

func (s TrackerState) Encode() ([]byte, error) {
	if err := s.validate(); err != nil {
		return nil, err
	}
	return json.Marshal(s.value)
}

func DecodeTrackerState(version uint32, payload []byte) (TrackerState, error) {
	if version != TrackerStateVersion {
		return TrackerState{}, fmt.Errorf("unsupported %s version %d", TrackerStateType, version)
	}
	if err := validateParticipantsJSON(payload); err != nil {
		return TrackerState{}, err
	}
	var value trackerStateValue
	decoder := json.NewDecoder(bytes.NewReader(payload))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&value); err != nil {
		return TrackerState{}, fmt.Errorf("decode participants tracker state: %w", err)
	}
	if err := decoder.Decode(new(any)); err != io.EOF {
		return TrackerState{}, fmt.Errorf("trailing participants tracker state")
	}
	state := TrackerState{value: value}
	if err := state.validate(); err != nil {
		return TrackerState{}, err
	}
	return state, nil
}

func validateParticipantsJSON(payload []byte) error {
	decoder := json.NewDecoder(bytes.NewReader(payload))
	var visit func(string) error
	visit = func(path string) error {
		token, err := decoder.Token()
		if err != nil {
			return err
		}
		delim, ok := token.(json.Delim)
		if !ok {
			return nil
		}
		switch delim {
		case '{':
			seen := make(map[string]struct{})
			for decoder.More() {
				nameToken, err := decoder.Token()
				if err != nil {
					return err
				}
				name, ok := nameToken.(string)
				if !ok {
					return fmt.Errorf("non-string JSON field at %s", path)
				}
				if _, exists := seen[name]; exists {
					return fmt.Errorf("duplicate JSON field %s.%s", path, name)
				}
				seen[name] = struct{}{}
				if err := visit(path + "." + name); err != nil {
					return err
				}
			}
			_, err = decoder.Token()
			return err
		case '[':
			for i := 0; decoder.More(); i++ {
				if err := visit(fmt.Sprintf("%s[%d]", path, i)); err != nil {
					return err
				}
			}
			_, err = decoder.Token()
			return err
		default:
			return fmt.Errorf("unexpected JSON delimiter %q", delim)
		}
	}
	if err := visit("state"); err != nil {
		return err
	}
	if err := decoder.Decode(new(any)); err != io.EOF {
		return fmt.Errorf("trailing participants tracker state")
	}
	var fields map[string]json.RawMessage
	if err := json.Unmarshal(payload, &fields); err != nil || fields == nil {
		return fmt.Errorf("participants tracker state must be an object")
	}
	required := []string{"active", "fight_active", "known", "dead"}
	if len(fields) != len(required) {
		return fmt.Errorf("participants tracker state requires %d fields", len(required))
	}
	for _, name := range required {
		raw, exists := fields[name]
		if !exists || bytes.Equal(bytes.TrimSpace(raw), []byte("null")) {
			return fmt.Errorf("participants tracker field %q is missing or null", name)
		}
	}
	var active []json.RawMessage
	if err := json.Unmarshal(fields["active"], &active); err != nil {
		return fmt.Errorf("decode active participants: %w", err)
	}
	for i, raw := range active {
		var entry map[string]json.RawMessage
		if err := json.Unmarshal(raw, &entry); err != nil || entry == nil {
			return fmt.Errorf("active participant %d must be an object", i)
		}
		if len(entry) != 2 {
			return fmt.Errorf("active participant %d requires guid and active", i)
		}
		for _, name := range []string{"guid", "active"} {
			value, exists := entry[name]
			if !exists || bytes.Equal(bytes.TrimSpace(value), []byte("null")) {
				return fmt.Errorf("active participant %d field %q is missing or null", i, name)
			}
		}
	}
	return nil
}

func (s TrackerState) validate() error {
	if s.value.Active == nil || s.value.Known == nil || s.value.Dead == nil {
		return fmt.Errorf("participants tracker collections are nil")
	}
	active := make(map[guid.GUID]struct{}, len(s.value.Active))
	for _, value := range s.value.Active {
		if value.GUID.IsZero() || !value.GUID.IsPlayer() {
			return fmt.Errorf("invalid active participant %s", value.GUID)
		}
		if _, exists := active[value.GUID]; exists {
			return fmt.Errorf("duplicate active participant %s", value.GUID)
		}
		active[value.GUID] = struct{}{}
	}
	known, err := validateParticipantSet("known", s.value.Known)
	if err != nil {
		return err
	}
	dead, err := validateParticipantSet("dead", s.value.Dead)
	if err != nil {
		return err
	}
	for id := range dead {
		if _, exists := known[id]; !exists {
			return fmt.Errorf("dead participant %s is not known", id)
		}
	}
	return nil
}

func validateParticipantSet(name string, values []guid.GUID) (map[guid.GUID]struct{}, error) {
	set := make(map[guid.GUID]struct{}, len(values))
	for _, value := range values {
		if value.IsZero() || !value.IsPlayer() {
			return nil, fmt.Errorf("invalid %s participant %s", name, value)
		}
		if _, exists := set[value]; exists {
			return nil, fmt.Errorf("duplicate %s participant %s", name, value)
		}
		set[value] = struct{}{}
	}
	return set, nil
}

// Restore constructs a fresh tracker without invoking gameplay or registering hooks.
func (s TrackerState) Restore() (*Tracker, error) {
	if err := s.validate(); err != nil {
		return nil, err
	}
	tracker := New()
	tracker.fightActive = s.value.FightActive
	for _, value := range s.value.Active {
		tracker.Active[value.GUID] = value.Active
	}
	for _, value := range s.value.Known {
		tracker.known[value] = struct{}{}
	}
	for _, value := range s.value.Dead {
		tracker.dead[value] = struct{}{}
	}
	return tracker, nil
}
