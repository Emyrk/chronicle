package encounterevents

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"google.golang.org/protobuf/encoding/protowire"
	"google.golang.org/protobuf/proto"
)

const EagerBuilderStateType = "encounterevents.EagerBuilder"
const EagerBuilderStateVersion uint32 = 1

// EagerBuilderState is a detached, immutable-by-API copy of one builder whose
// events have already been encoded. It owns the exact length-delimited protobuf
// bytes. Buffered pending Damage has a separate reference-based adapter.
type EagerBuilderState struct{ value eagerBuilderValue }

type eagerBuilderValue struct {
	First time.Time `json:"first"`
	Count int64     `json:"count"`
	Done  bool      `json:"done"`
	Data  []byte    `json:"data"`
}

// CaptureEagerState copies already-encoded bytes. It never replays conversion
// from mutable source messages.
func (b *Builder[M, PM]) CaptureEagerState() (EagerBuilderState, error) {
	if b == nil {
		return EagerBuilderState{}, fmt.Errorf("nil eager builder")
	}
	if b.buffered || b.pending != nil {
		return EagerBuilderState{}, fmt.Errorf("builder still has pending buffered messages")
	}
	value := eagerBuilderValue{First: b.First, Count: b.Count, Done: b.done}
	if b.done {
		if b.data != nil {
			return EagerBuilderState{}, fmt.Errorf("finalized builder retains data buffer")
		}
	} else {
		if b.data == nil {
			return EagerBuilderState{}, fmt.Errorf("active eager builder has no data buffer")
		}
		value.Data = make([]byte, b.data.Len())
		copy(value.Data, b.data.Bytes())
	}
	if err := value.validate(); err != nil {
		return EagerBuilderState{}, err
	}
	return EagerBuilderState{value: value}, nil
}

func (s EagerBuilderState) Encode() ([]byte, error) { return json.Marshal(s.value) }

// DecodeEagerBuilderState fails closed before returning a restorable value.
func DecodeEagerBuilderState(version uint32, payload []byte) (EagerBuilderState, error) {
	if version != EagerBuilderStateVersion {
		return EagerBuilderState{}, fmt.Errorf("unsupported %s version %d", EagerBuilderStateType, version)
	}
	fields, err := decodeEagerObject(payload)
	if err != nil {
		return EagerBuilderState{}, err
	}
	required := []string{"first", "count", "done", "data"}
	if len(fields) != len(required) {
		return EagerBuilderState{}, fmt.Errorf("eager builder state requires %d fields", len(required))
	}
	for _, name := range required {
		if len(fields[name]) == 0 {
			return EagerBuilderState{}, fmt.Errorf("missing eager builder field %q", name)
		}
	}
	for _, name := range []string{"first", "count", "done"} {
		if bytes.Equal(bytes.TrimSpace(fields[name]), []byte("null")) {
			return EagerBuilderState{}, fmt.Errorf("null eager builder field %q", name)
		}
	}
	var value eagerBuilderValue
	decoder := json.NewDecoder(bytes.NewReader(payload))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&value); err != nil {
		return EagerBuilderState{}, fmt.Errorf("decode eager builder state: %w", err)
	}
	if err := decoder.Decode(new(any)); err != io.EOF {
		return EagerBuilderState{}, fmt.Errorf("trailing eager builder state")
	}
	if value.Done {
		if !bytes.Equal(bytes.TrimSpace(fields["data"]), []byte("null")) {
			return EagerBuilderState{}, fmt.Errorf("finalized eager builder data must be null")
		}
	} else if bytes.Equal(bytes.TrimSpace(fields["data"]), []byte("null")) {
		return EagerBuilderState{}, fmt.Errorf("active eager builder data must be present")
	}
	if err := value.validate(); err != nil {
		return EagerBuilderState{}, err
	}
	if value.Data != nil {
		data := make([]byte, len(value.Data))
		copy(data, value.Data)
		value.Data = data
	}
	return EagerBuilderState{value: value}, nil
}

func decodeEagerObject(payload []byte) (map[string]json.RawMessage, error) {
	decoder := json.NewDecoder(bytes.NewReader(payload))
	token, err := decoder.Token()
	if err != nil {
		return nil, err
	}
	if token != json.Delim('{') {
		return nil, fmt.Errorf("eager builder state must be an object")
	}
	fields := make(map[string]json.RawMessage)
	for decoder.More() {
		token, err := decoder.Token()
		if err != nil {
			return nil, err
		}
		name, ok := token.(string)
		if !ok {
			return nil, fmt.Errorf("eager builder field name is not a string")
		}
		if _, exists := fields[name]; exists {
			return nil, fmt.Errorf("duplicate eager builder field %q", name)
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
		return nil, fmt.Errorf("trailing eager builder state")
	}
	return fields, nil
}

func (v eagerBuilderValue) validate() error {
	if v.Count < 0 {
		return fmt.Errorf("negative eager builder count")
	}
	if v.Done {
		if v.Data != nil {
			return fmt.Errorf("finalized eager builder retains data")
		}
		return nil
	}
	if v.Data == nil {
		return fmt.Errorf("active eager builder has nil data")
	}
	count, err := countEagerRecords(v.Data)
	if err != nil {
		return err
	}
	if count != v.Count {
		return fmt.Errorf("eager builder count %d does not match %d records", v.Count, count)
	}
	return nil
}

func countEagerRecords(data []byte) (int64, error) {
	var count int64
	for len(data) > 0 {
		length, prefixLength := protowire.ConsumeVarint(data)
		if prefixLength < 0 {
			return 0, fmt.Errorf("invalid eager builder record length")
		}
		data = data[prefixLength:]
		if length > uint64(len(data)) {
			return 0, fmt.Errorf("truncated eager builder record")
		}
		data = data[int(length):]
		count++
	}
	return count, nil
}

// RestoreEagerBuilder constructs a fresh builder with the exact captured bytes
// and lifecycle state. No message conversion callback is required or restored.
func RestoreEagerBuilder[M messages.Message, PM proto.Message](s EagerBuilderState) (*Builder[M, PM], error) {
	if err := s.value.validate(); err != nil {
		return nil, err
	}
	builder := &Builder[M, PM]{First: s.value.First, Count: s.value.Count, done: s.value.Done}
	if !s.value.Done {
		data := make([]byte, len(s.value.Data))
		copy(data, s.value.Data)
		builder.data = bytes.NewBuffer(data)
	}
	return builder, nil
}
