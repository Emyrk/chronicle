package encounterevents

import (
	"bytes"
	"fmt"
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/google/uuid"
	"google.golang.org/protobuf/encoding/protowire"
	"google.golang.org/protobuf/proto"
)

type Builder[M messages.Message, PM proto.Message] struct {
	First time.Time
	Count int64

	done bool
	data *bytes.Buffer
}

func NewBuilder[M messages.Message, PM proto.Message]() *Builder[M, PM] {
	return &Builder[M, PM]{
		First: time.Time{},
		data:  bytes.NewBuffer(nil),
	}
}

// Finalize builds the final byte array for the encounter events.
// Header
// - EncounterID (string bytes)
// - First event timestamp (varint, unix millis)
// - Count of events (varint)
// Body
// - Repeated PM messages
func (b *Builder[M, PM]) Finalize(encounterID uuid.UUID) ([]byte, error) {
	if b.done {
		return nil, fmt.Errorf("builder already finalized")
	}
	header := make([]byte, 0, 50)

	// Use timestamp=0 for empty encounters (First is zero time if no events added)
	// This avoids encoding a huge negative number when zero time is cast to uint64
	var timestampMs int64
	if !b.First.IsZero() {
		timestampMs = b.First.UnixMilli()
	}

	header = protowire.AppendString(header, encounterID.String())
	header = protowire.AppendVarint(header, uint64(timestampMs))
	header = protowire.AppendVarint(header, uint64(b.Count))
	header = protowire.AppendVarint(header, uint64(b.data.Len()))

	b.done = true
	final := append(header, b.data.Bytes()...)
	b.data = nil
	return final, nil
}

func (b *Builder[M, PM]) SetZero(start time.Time) {
	b.First = start
}

func AddToBuilder[M messages.Message, PM proto.Message](b *Builder[M, PM], m M, idx int32, conv func(from time.Time, idx int32, message M) PM) error {
	if b.done {
		return fmt.Errorf("builder already finalized")
	}

	b.Count++
	pm := conv(b.First, idx, m)
	data, err := proto.Marshal(pm)
	if err != nil {
		return err
	}

	prefix := protowire.AppendVarint([]byte{}, uint64(len(data)))

	_, err = b.data.Write(prefix)
	if err != nil {
		return err
	}

	_, err = b.data.Write(data)
	if err != nil {
		return err
	}

	return nil
}
