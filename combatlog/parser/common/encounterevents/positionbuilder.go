package encounterevents

import (
	"fmt"
	"time"

	"github.com/Emyrk/chronicle/api/chronicleproto/types2proto"
	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/google/uuid"
	"google.golang.org/protobuf/encoding/protowire"
	"google.golang.org/protobuf/proto"
)

type unitPositionSnapshot struct {
	x         float64
	y         float64
	z         float64
	hasZ      bool
	mapID     int32
	floor     int32
	hasFloor  bool
	facing    float64
	hasFacing bool
	synthetic bool
}

type unitPositionRun struct {
	snapshot    unitPositionSnapshot
	tail        int
	compactable bool
}

// PositionBuilder retains the first and last sample of each unchanged position
// run. The endpoints preserve when movement began without storing every
// identical observation between them.
type PositionBuilder struct {
	First time.Time
	Count int64

	done    bool
	entries [][]byte
	runs    map[guid.GUID]unitPositionRun
}

func NewPositionBuilder() *PositionBuilder {
	return &PositionBuilder{
		runs: make(map[guid.GUID]unitPositionRun),
	}
}

func (b *PositionBuilder) SetZero(start time.Time) {
	b.First = start
}

func (b *PositionBuilder) Add(position *messages.UnitPosition, idx int32) error {
	if b.done {
		return fmt.Errorf("builder already finalized")
	}

	data, err := proto.Marshal(types2proto.UnitPosition(b.First, idx, position))
	if err != nil {
		return err
	}

	snapshot := positionSnapshot(position)
	compactable := len(position.Activity()) == 0
	run, ok := b.runs[position.Unit]
	if !ok || run.snapshot != snapshot || !run.compactable || !compactable {
		b.entries = append(b.entries, data)
		b.Count++
		b.runs[position.Unit] = unitPositionRun{
			snapshot:    snapshot,
			tail:        -1,
			compactable: compactable,
		}
		return nil
	}

	if run.tail >= 0 {
		b.entries[run.tail] = nil
		b.Count--
	}
	b.entries = append(b.entries, data)
	run.tail = len(b.entries) - 1
	b.Count++
	b.runs[position.Unit] = run
	return nil
}

func (b *PositionBuilder) Finalize(encounterID uuid.UUID) ([]byte, error) {
	if b.done {
		return nil, fmt.Errorf("builder already finalized")
	}

	body := make([]byte, 0)
	for _, data := range b.entries {
		if data == nil {
			continue
		}
		body = protowire.AppendVarint(body, uint64(len(data)))
		body = append(body, data...)
	}

	var timestampMs int64
	if !b.First.IsZero() {
		timestampMs = b.First.UnixMilli()
	}
	header := make([]byte, 0, 50)
	header = protowire.AppendString(header, encounterID.String())
	header = protowire.AppendVarint(header, uint64(timestampMs))
	header = protowire.AppendVarint(header, uint64(b.Count))
	header = protowire.AppendVarint(header, uint64(len(body)))

	b.done = true
	b.entries = nil
	b.runs = nil
	return append(header, body...), nil
}

func positionSnapshot(position *messages.UnitPosition) unitPositionSnapshot {
	snapshot := unitPositionSnapshot{
		x:         position.X,
		y:         position.Y,
		mapID:     position.MapID,
		facing:    position.Facing,
		hasFacing: position.HasFacing,
		synthetic: position.IsSynthetic(),
	}
	if position.Z != nil {
		snapshot.z = *position.Z
		snapshot.hasZ = true
	}
	if position.Floor != nil {
		snapshot.floor = *position.Floor
		snapshot.hasFloor = true
	}
	return snapshot
}
