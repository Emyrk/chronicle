package encounterevents

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"maps"
	"slices"
	"time"

	"github.com/Emyrk/chronicle/api/chronicleproto"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"google.golang.org/protobuf/proto"
)

const PositionBuilderStateType = "encounterevents.PositionBuilder"
const PositionBuilderStateVersion uint32 = 1

// PositionBuilderState owns the exact already-encoded position entries plus the
// active compaction runs needed to continue at the next file boundary.
type PositionBuilderState struct{ value positionBuilderValue }

type positionBuilderValue struct {
	First   time.Time          `json:"first"`
	Count   int64              `json:"count"`
	Done    bool               `json:"done"`
	Entries [][]byte           `json:"entries"`
	Runs    []positionRunValue `json:"runs"`
}

type positionRunValue struct {
	Unit        guid.GUID             `json:"unit"`
	Snapshot    positionSnapshotValue `json:"snapshot"`
	Tail        int                   `json:"tail"`
	Compactable bool                  `json:"compactable"`
}

type positionSnapshotValue struct {
	X         float64 `json:"x"`
	Y         float64 `json:"y"`
	Z         float64 `json:"z"`
	HasZ      bool    `json:"has_z"`
	MapID     int32   `json:"map_id"`
	Floor     int32   `json:"floor"`
	HasFloor  bool    `json:"has_floor"`
	Facing    float64 `json:"facing"`
	HasFacing bool    `json:"has_facing"`
	Synthetic bool    `json:"synthetic"`
}

func positionSnapshotValueFromRuntime(value unitPositionSnapshot) positionSnapshotValue {
	return positionSnapshotValue{value.x, value.y, value.z, value.hasZ, value.mapID, value.floor, value.hasFloor, value.facing, value.hasFacing, value.synthetic}
}

func (v positionSnapshotValue) runtime() unitPositionSnapshot {
	return unitPositionSnapshot{v.X, v.Y, v.Z, v.HasZ, v.MapID, v.Floor, v.HasFloor, v.Facing, v.HasFacing, v.Synthetic}
}

func clonePositionEntries(entries [][]byte) [][]byte {
	if entries == nil {
		return nil
	}
	cloned := make([][]byte, len(entries))
	for i, entry := range entries {
		cloned[i] = slices.Clone(entry)
	}
	return cloned
}

func (b *PositionBuilder) CaptureState() (PositionBuilderState, error) {
	if b == nil {
		return PositionBuilderState{}, fmt.Errorf("nil position builder")
	}
	value := positionBuilderValue{First: b.First, Count: b.Count, Done: b.done}
	if b.done {
		if b.entries != nil || b.runs != nil {
			return PositionBuilderState{}, fmt.Errorf("finalized position builder retains active state")
		}
	} else {
		if b.runs == nil {
			return PositionBuilderState{}, fmt.Errorf("active position builder has nil runs")
		}
		value.Entries = clonePositionEntries(b.entries)
		value.Runs = make([]positionRunValue, 0, len(b.runs))
		units := slices.Sorted(maps.Keys(b.runs))
		for _, unit := range units {
			run := b.runs[unit]
			value.Runs = append(value.Runs, positionRunValue{unit, positionSnapshotValueFromRuntime(run.snapshot), run.tail, run.compactable})
		}
	}
	if err := value.validate(); err != nil {
		return PositionBuilderState{}, err
	}
	return PositionBuilderState{value: value}, nil
}

func (s PositionBuilderState) Encode() ([]byte, error) { return json.Marshal(s.value) }

func DecodePositionBuilderState(version uint32, payload []byte) (PositionBuilderState, error) {
	if version != PositionBuilderStateVersion {
		return PositionBuilderState{}, fmt.Errorf("unsupported %s version %d", PositionBuilderStateType, version)
	}
	fields, err := decodePositionObject(payload)
	if err != nil {
		return PositionBuilderState{}, err
	}
	required := []string{"first", "count", "done", "entries", "runs"}
	if len(fields) != len(required) {
		return PositionBuilderState{}, fmt.Errorf("position builder state requires %d fields", len(required))
	}
	for _, name := range required {
		if len(fields[name]) == 0 {
			return PositionBuilderState{}, fmt.Errorf("missing position builder field %q", name)
		}
	}
	for _, name := range []string{"first", "count", "done"} {
		if bytes.Equal(bytes.TrimSpace(fields[name]), []byte("null")) {
			return PositionBuilderState{}, fmt.Errorf("null position builder field %q", name)
		}
	}
	var value positionBuilderValue
	decoder := json.NewDecoder(bytes.NewReader(payload))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&value); err != nil {
		return PositionBuilderState{}, fmt.Errorf("decode position builder state: %w", err)
	}
	if err := decoder.Decode(new(any)); err != io.EOF {
		return PositionBuilderState{}, fmt.Errorf("trailing position builder state")
	}
	if value.Done {
		if !bytes.Equal(bytes.TrimSpace(fields["entries"]), []byte("null")) || !bytes.Equal(bytes.TrimSpace(fields["runs"]), []byte("null")) {
			return PositionBuilderState{}, fmt.Errorf("finalized position builder active fields must be null")
		}
	} else if bytes.Equal(bytes.TrimSpace(fields["runs"]), []byte("null")) {
		return PositionBuilderState{}, fmt.Errorf("active position builder runs must be present")
	}
	value.Entries = clonePositionEntries(value.Entries)
	value.Runs = slices.Clone(value.Runs)
	if err := value.validate(); err != nil {
		return PositionBuilderState{}, err
	}
	return PositionBuilderState{value: value}, nil
}

func decodePositionObject(payload []byte) (map[string]json.RawMessage, error) {
	decoder := json.NewDecoder(bytes.NewReader(payload))
	token, err := decoder.Token()
	if err != nil {
		return nil, err
	}
	if token != json.Delim('{') {
		return nil, fmt.Errorf("position builder state must be an object")
	}
	fields := make(map[string]json.RawMessage)
	for decoder.More() {
		token, err := decoder.Token()
		if err != nil {
			return nil, err
		}
		name, ok := token.(string)
		if !ok {
			return nil, fmt.Errorf("position builder field name is not a string")
		}
		if _, exists := fields[name]; exists {
			return nil, fmt.Errorf("duplicate position builder field %q", name)
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
		return nil, fmt.Errorf("trailing position builder state")
	}
	return fields, nil
}

func (v positionBuilderValue) validate() error {
	if v.Count < 0 {
		return fmt.Errorf("negative position count")
	}
	if v.Done {
		if v.Entries != nil || v.Runs != nil {
			return fmt.Errorf("finalized position builder retains active state")
		}
		return nil
	}
	if v.Runs == nil {
		return fmt.Errorf("active position builder has nil runs")
	}
	var count int64
	for i, entry := range v.Entries {
		if entry == nil {
			continue
		}
		var position chronicleproto.UnitPosition
		if err := proto.Unmarshal(entry, &position); err != nil {
			return fmt.Errorf("position entry %d: %w", i, err)
		}
		count++
	}
	if count != v.Count {
		return fmt.Errorf("position count %d does not match %d entries", v.Count, count)
	}
	seen := make(map[guid.GUID]struct{}, len(v.Runs))
	for _, run := range v.Runs {
		if _, exists := seen[run.Unit]; exists {
			return fmt.Errorf("duplicate position run for %s", run.Unit)
		}
		seen[run.Unit] = struct{}{}
		if run.Tail < -1 || run.Tail >= len(v.Entries) {
			return fmt.Errorf("invalid position run tail %d", run.Tail)
		}
		if run.Tail >= 0 && v.Entries[run.Tail] == nil {
			return fmt.Errorf("position run tail %d points to tombstone", run.Tail)
		}
	}
	return nil
}

func (s PositionBuilderState) Restore() (*PositionBuilder, error) {
	if err := s.value.validate(); err != nil {
		return nil, err
	}
	builder := &PositionBuilder{First: s.value.First, Count: s.value.Count, done: s.value.Done}
	if !s.value.Done {
		builder.entries = clonePositionEntries(s.value.Entries)
		builder.runs = make(map[guid.GUID]unitPositionRun, len(s.value.Runs))
		for _, run := range s.value.Runs {
			builder.runs[run.Unit] = unitPositionRun{run.Snapshot.runtime(), run.Tail, run.Compactable}
		}
	}
	return builder, nil
}
