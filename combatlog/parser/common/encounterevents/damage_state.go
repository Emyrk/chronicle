package encounterevents

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"time"

	"github.com/Emyrk/chronicle/api/chronicleproto"
	"github.com/Emyrk/chronicle/api/chronicleproto/types2proto"
	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
)

const PendingDamageStateType = "encounterevents.PendingDamageBuilder"
const PendingDamageStateVersion uint32 = 1

// PendingDamageState is only the active, unencoded Damage builder. Other
// builders (notably already-serialized Slain) are outside this adapter and must
// retain their existing bytes; they must not be rebuilt from attributed Damage.
type PendingDamageState struct {
	First   time.Time                `json:"first"`
	Count   int64                    `json:"count"`
	Entries []PendingDamageReference `json:"entries"`
}
type PendingDamageReference struct {
	Path  string `json:"path"`
	Index int32  `json:"index"`
}

// CapturePendingDamage visits actual pending objects in stable event order. The
// callback assigns canonical owner paths and can register pointer aliases.
func CapturePendingDamage(b *Builder[*messages.Damage, *chronicleproto.Damage], capture func(int, *messages.Damage) (string, error)) (PendingDamageState, error) {
	if b == nil || b.done || !b.buffered || b.data == nil || b.data.Len() != 0 {
		return PendingDamageState{}, fmt.Errorf("damage builder is not an active unencoded buffer")
	}
	if b.Count != int64(len(b.pending)) {
		return PendingDamageState{}, fmt.Errorf("inconsistent pending damage count")
	}
	s := PendingDamageState{First: b.First, Count: b.Count}
	if b.pending != nil {
		s.Entries = make([]PendingDamageReference, len(b.pending))
	}
	for i, entry := range b.pending {
		if capture == nil {
			return PendingDamageState{}, fmt.Errorf("missing damage capture callback")
		}
		p, err := capture(i, entry.message)
		if err != nil {
			return PendingDamageState{}, err
		}
		if p == "" {
			return PendingDamageState{}, fmt.Errorf("empty damage reference")
		}
		s.Entries[i] = PendingDamageReference{Path: p, Index: entry.index}
	}
	return s, nil
}

func (s PendingDamageState) Encode() ([]byte, error) { return json.Marshal(s) }

func DecodePendingDamageState(version uint32, payload []byte) (PendingDamageState, error) {
	if version != PendingDamageStateVersion {
		return PendingDamageState{}, fmt.Errorf("unsupported %s version %d", PendingDamageStateType, version)
	}
	fields, err := decodeDamageObject(payload, "pending damage state")
	if err != nil {
		return PendingDamageState{}, err
	}
	if len(fields) != 3 {
		return PendingDamageState{}, fmt.Errorf("pending damage state requires three fields")
	}
	for _, name := range []string{"first", "count", "entries"} {
		if len(fields[name]) == 0 {
			return PendingDamageState{}, fmt.Errorf("pending damage field %q is missing", name)
		}
	}
	for _, name := range []string{"first", "count"} {
		if bytes.Equal(bytes.TrimSpace(fields[name]), []byte("null")) {
			return PendingDamageState{}, fmt.Errorf("pending damage field %q is null", name)
		}
	}
	var state PendingDamageState
	decoder := json.NewDecoder(bytes.NewReader(payload))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&state); err != nil {
		return PendingDamageState{}, err
	}
	if err := decoder.Decode(new(any)); err != io.EOF {
		return PendingDamageState{}, fmt.Errorf("trailing pending damage state")
	}
	if state.Count < 0 || state.Count != int64(len(state.Entries)) {
		return PendingDamageState{}, fmt.Errorf("inconsistent pending damage count")
	}
	for i, entry := range state.Entries {
		if entry.Path == "" {
			return PendingDamageState{}, fmt.Errorf("empty pending damage reference %d", i)
		}
	}
	return state, nil
}

func decodeDamageObject(payload []byte, label string) (map[string]json.RawMessage, error) {
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

func (s PendingDamageState) Restore(resolve func(string) (*messages.Damage, error)) (*Builder[*messages.Damage, *chronicleproto.Damage], error) {
	if s.Count != int64(len(s.Entries)) {
		return nil, fmt.Errorf("inconsistent pending damage count")
	}
	b := NewBufferedBuilder[*messages.Damage, *chronicleproto.Damage]()
	b.First = s.First
	b.Count = s.Count
	b.convert = types2proto.Damage
	if s.Entries != nil {
		b.pending = make([]bufferedMessage[*messages.Damage], len(s.Entries))
	}
	for i, entry := range s.Entries {
		if resolve == nil || entry.Path == "" {
			return nil, fmt.Errorf("missing damage resolver or reference")
		}
		damage, err := resolve(entry.Path)
		if err != nil {
			return nil, err
		}
		if damage == nil {
			return nil, fmt.Errorf("nil pending damage")
		}
		b.pending[i] = bufferedMessage[*messages.Damage]{message: damage, index: entry.Index}
	}
	return b, nil
}
