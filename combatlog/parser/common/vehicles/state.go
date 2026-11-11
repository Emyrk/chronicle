package vehicles

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
)

const StateType = "vehicles.Tracker"
const StateVersion uint32 = 1

// State is a detached, immutable-by-API copy of tracker-owned sessions. The
// current session remains an explicit alias rather than derived state.
type State struct{ value stateValue }

type stateValue struct {
	Sessions       []sessionValue `json:"sessions"`
	CurrentSession *int           `json:"current_session"`
}

type sessionValue struct {
	ID      string                `json:"id"`
	EndedAt *time.Time            `json:"ended_at"`
	Changes []vehicleControlValue `json:"changes"`
}

type vehicleControlValue struct {
	Timestamp      time.Time                     `json:"timestamp"`
	Synthetic      bool                          `json:"synthetic"`
	Action         messages.VehicleControlAction `json:"action"`
	VehicleGUID    guid.GUID                     `json:"vehicle_guid"`
	ControllerGUID guid.GUID                     `json:"controller_guid"`
	VehicleName    string                        `json:"vehicle_name"`
	ControllerName string                        `json:"controller_name"`
	ObservedAt     time.Time                     `json:"observed_at"`
	Ordinal        uint64                        `json:"ordinal"`
}

func cloneTime(value *time.Time) *time.Time {
	if value == nil {
		return nil
	}
	copy := *value
	return &copy
}

func (v stateValue) clone() stateValue {
	v.CurrentSession = clonePointer(v.CurrentSession)
	if v.Sessions != nil {
		sessions := make([]sessionValue, len(v.Sessions))
		for i, session := range v.Sessions {
			session.EndedAt = cloneTime(session.EndedAt)
			if session.Changes != nil {
				changes := make([]vehicleControlValue, len(session.Changes))
				copy(changes, session.Changes)
				session.Changes = changes
			}
			sessions[i] = session
		}
		v.Sessions = sessions
	}
	return v
}

func clonePointer[T any](value *T) *T {
	if value == nil {
		return nil
	}
	copy := *value
	return &copy
}

// CaptureState copies ordered sessions, ordered changes, and the current alias.
// Runtime messages and later processing cannot mutate the returned value.
func (t *Tracker) CaptureState() (State, error) {
	if t == nil {
		return State{}, fmt.Errorf("nil vehicle tracker")
	}
	value := stateValue{}
	if t.sessions != nil {
		value.Sessions = make([]sessionValue, len(t.sessions))
	}
	currentIndex := -1
	seenSessions := make(map[*session]struct{}, len(t.sessions))
	for i, source := range t.sessions {
		if source == nil {
			return State{}, fmt.Errorf("nil vehicle session %d", i)
		}
		if _, exists := seenSessions[source]; exists {
			return State{}, fmt.Errorf("duplicate vehicle session object %d", i)
		}
		seenSessions[source] = struct{}{}
		if source == t.current {
			currentIndex = i
		}
		destination := sessionValue{ID: source.id, EndedAt: cloneTime(source.endedAt)}
		if source.changes != nil {
			destination.Changes = make([]vehicleControlValue, len(source.changes))
		}
		for changeIndex, change := range source.changes {
			if change == nil {
				return State{}, fmt.Errorf("nil vehicle change in session %d at %d", i, changeIndex)
			}
			destination.Changes[changeIndex] = vehicleControlValue{
				Timestamp: change.Date(), Synthetic: change.IsSynthetic(), Action: change.Action,
				VehicleGUID: change.VehicleGUID, ControllerGUID: change.ControllerGUID,
				VehicleName: change.VehicleName, ControllerName: change.ControllerName,
				ObservedAt: change.ObservedAt, Ordinal: change.Ordinal,
			}
		}
		value.Sessions[i] = destination
	}
	if t.current != nil {
		if currentIndex < 0 {
			return State{}, fmt.Errorf("current vehicle session is not owned by tracker")
		}
		value.CurrentSession = &currentIndex
	}
	if err := value.validate(); err != nil {
		return State{}, err
	}
	return State{value: value.clone()}, nil
}

func (s State) Encode() ([]byte, error) { return json.Marshal(s.value) }

// DecodeState validates a complete candidate without mutating a live tracker.
func DecodeState(version uint32, payload []byte) (State, error) {
	if version != StateVersion {
		return State{}, fmt.Errorf("unsupported %s version %d", StateType, version)
	}
	fields, err := decodeVehicleObject(payload, "vehicle state")
	if err != nil {
		return State{}, err
	}
	if len(fields) != 2 || len(fields["sessions"]) == 0 || len(fields["current_session"]) == 0 {
		return State{}, fmt.Errorf("vehicle state requires sessions and current_session")
	}
	var value stateValue
	if bytes.Equal(bytes.TrimSpace(fields["sessions"]), []byte("null")) {
		value.Sessions = nil
	} else {
		var entries []json.RawMessage
		if err := json.Unmarshal(fields["sessions"], &entries); err != nil {
			return State{}, fmt.Errorf("decode vehicle sessions: %w", err)
		}
		value.Sessions = make([]sessionValue, len(entries))
		for i, entry := range entries {
			session, err := decodeSession(entry)
			if err != nil {
				return State{}, fmt.Errorf("vehicle session %d: %w", i, err)
			}
			value.Sessions[i] = session
		}
	}
	if !bytes.Equal(bytes.TrimSpace(fields["current_session"]), []byte("null")) {
		if err := json.Unmarshal(fields["current_session"], &value.CurrentSession); err != nil {
			return State{}, fmt.Errorf("decode current vehicle session: %w", err)
		}
	}
	if err := value.validate(); err != nil {
		return State{}, err
	}
	return State{value: value.clone()}, nil
}

func decodeSession(payload []byte) (sessionValue, error) {
	fields, err := decodeVehicleObject(payload, "vehicle session")
	if err != nil {
		return sessionValue{}, err
	}
	for _, name := range []string{"id", "ended_at", "changes"} {
		if len(fields[name]) == 0 {
			return sessionValue{}, fmt.Errorf("vehicle session requires %s", name)
		}
	}
	if len(fields) != 3 || bytes.Equal(bytes.TrimSpace(fields["id"]), []byte("null")) {
		return sessionValue{}, fmt.Errorf("invalid vehicle session fields")
	}
	var result sessionValue
	if err := json.Unmarshal(fields["id"], &result.ID); err != nil {
		return sessionValue{}, err
	}
	if !bytes.Equal(bytes.TrimSpace(fields["ended_at"]), []byte("null")) {
		if err := json.Unmarshal(fields["ended_at"], &result.EndedAt); err != nil {
			return sessionValue{}, fmt.Errorf("decode vehicle session end: %w", err)
		}
	}
	if bytes.Equal(bytes.TrimSpace(fields["changes"]), []byte("null")) {
		return result, nil
	}
	var changes []json.RawMessage
	if err := json.Unmarshal(fields["changes"], &changes); err != nil {
		return sessionValue{}, fmt.Errorf("decode vehicle changes: %w", err)
	}
	result.Changes = make([]vehicleControlValue, len(changes))
	for i, change := range changes {
		decoded, err := decodeVehicleControl(change)
		if err != nil {
			return sessionValue{}, fmt.Errorf("vehicle change %d: %w", i, err)
		}
		result.Changes[i] = decoded
	}
	return result, nil
}

func decodeVehicleControl(payload []byte) (vehicleControlValue, error) {
	fields, err := decodeVehicleObject(payload, "vehicle change")
	if err != nil {
		return vehicleControlValue{}, err
	}
	required := []string{"timestamp", "synthetic", "action", "vehicle_guid", "controller_guid", "vehicle_name", "controller_name", "observed_at", "ordinal"}
	if len(fields) != len(required) {
		return vehicleControlValue{}, fmt.Errorf("vehicle change requires %d fields", len(required))
	}
	for _, name := range required {
		if len(fields[name]) == 0 || bytes.Equal(bytes.TrimSpace(fields[name]), []byte("null")) {
			return vehicleControlValue{}, fmt.Errorf("vehicle change missing or null %s", name)
		}
	}
	var result vehicleControlValue
	decoder := json.NewDecoder(bytes.NewReader(payload))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&result); err != nil {
		return vehicleControlValue{}, err
	}
	return result, nil
}

func decodeVehicleObject(payload []byte, label string) (map[string]json.RawMessage, error) {
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

func (v stateValue) validate() error {
	if len(v.Sessions) == 0 {
		if v.CurrentSession != nil {
			return fmt.Errorf("current vehicle session without sessions")
		}
		return nil
	}
	if v.CurrentSession == nil || *v.CurrentSession != len(v.Sessions)-1 {
		return fmt.Errorf("current vehicle session must alias the last session")
	}
	for i, session := range v.Sessions {
		if i == *v.CurrentSession {
			if session.EndedAt != nil {
				return fmt.Errorf("current vehicle session is ended")
			}
		} else if session.EndedAt == nil {
			return fmt.Errorf("non-current vehicle session %d has no end", i)
		}
		for j, change := range session.Changes {
			if change.Action != messages.VehicleControlAssign && change.Action != messages.VehicleControlRelease {
				return fmt.Errorf("vehicle session %d change %d has invalid action %q", i, j, change.Action)
			}
			if !change.VehicleGUID.IsVehicle() {
				return fmt.Errorf("vehicle session %d change %d has non-vehicle GUID", i, j)
			}
		}
	}
	return nil
}

// Restore creates fresh sessions, messages, pointer fields, and the exact
// current-session alias. It does not derive metadata or replay transitions.
func (s State) Restore() (*Tracker, error) {
	value := s.value.clone()
	if err := value.validate(); err != nil {
		return nil, err
	}
	tracker := &Tracker{}
	if value.Sessions != nil {
		tracker.sessions = make([]*session, len(value.Sessions))
	}
	for i, source := range value.Sessions {
		destination := &session{id: source.ID, endedAt: cloneTime(source.EndedAt)}
		if source.Changes != nil {
			destination.changes = make([]*messages.VehicleControl, len(source.Changes))
		}
		for j, change := range source.Changes {
			base := messages.Base(change.Timestamp)
			if change.Synthetic {
				base = messages.Base(change.Timestamp, messages.WithSynthetic())
			}
			destination.changes[j] = &messages.VehicleControl{
				MessageBase: base, Action: change.Action,
				VehicleGUID: change.VehicleGUID, ControllerGUID: change.ControllerGUID,
				VehicleName: change.VehicleName, ControllerName: change.ControllerName,
				ObservedAt: change.ObservedAt, Ordinal: change.Ordinal,
			}
		}
		tracker.sessions[i] = destination
	}
	if value.CurrentSession != nil {
		tracker.current = tracker.sessions[*value.CurrentSession]
	}
	return tracker, nil
}
