package serviceeventrepair

import (
	"bytes"
	"compress/gzip"
	"errors"
	"fmt"
	"io"
	"time"

	"github.com/Emyrk/chronicle/api/chronicleproto"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/google/uuid"
	"google.golang.org/protobuf/encoding/protowire"
	"google.golang.org/protobuf/proto"
)

type razorgoreDeath struct {
	target guid.GUID
	offset int64
}

// Decode the stored encounter framing, not a bare protobuf list. Bound inflation
// and validate every frame length/count, including unrelated encounters, so a
// partial stream cannot be mistaken for evidence that nobody died.
func razorgoreSlainEvents(compressed []byte, encounterID uuid.UUID, start time.Time, duration int64) ([]razorgoreDeath, error) {
	const maxBytes = 64 << 20
	zr, err := gzip.NewReader(bytes.NewReader(compressed))
	if err != nil {
		return nil, err
	}
	defer func() { _ = zr.Close() }()
	data, err := io.ReadAll(io.LimitReader(zr, maxBytes+1))
	if err != nil {
		return nil, err
	}
	if len(data) > maxBytes {
		return nil, errors.New("slain stream exceeds repair limit")
	}
	var deaths []razorgoreDeath
	found := false
	for len(data) > 0 {
		id, n := protowire.ConsumeString(data)
		if n < 0 {
			return nil, errors.New("invalid encounter header")
		}
		data = data[n:]
		parsed, err := uuid.Parse(id)
		if err != nil {
			return nil, err
		}
		timestamp, n := protowire.ConsumeVarint(data)
		if n < 0 {
			return nil, errors.New("invalid timestamp")
		}
		data = data[n:]
		count, n := protowire.ConsumeVarint(data)
		if n < 0 {
			return nil, errors.New("invalid event count")
		}
		data = data[n:]
		size, n := protowire.ConsumeVarint(data)
		if n < 0 {
			return nil, errors.New("invalid body size")
		}
		data = data[n:]
		if size > uint64(len(data)) {
			return nil, errors.New("truncated encounter body")
		}
		body := data[:int(size)]
		data = data[int(size):]
		selected := parsed == encounterID
		if selected {
			if found {
				return nil, errors.New("duplicate encounter frame")
			}
			found = true
			if int64(timestamp) != start.UnixMilli() {
				return nil, errors.New("slain frame origin differs from encounter start")
			}
		}
		var prevOffset int64 = -1
		var prevIndex int32 = -1
		for i := uint64(0); i < count; i++ {
			msg, n := protowire.ConsumeBytes(body)
			if n < 0 {
				return nil, errors.New("truncated event")
			}
			body = body[n:]
			if !selected {
				continue
			}
			var slain chronicleproto.Slain
			if err := proto.Unmarshal(msg, &slain); err != nil {
				return nil, err
			}
			if slain.Meta == nil || slain.Meta.IsSynthetic || slain.Meta.OffsetMilli < 0 || slain.Meta.OffsetMilli > duration || slain.Meta.OffsetMilli < prevOffset || slain.Meta.Index <= prevIndex {
				return nil, errors.New("invalid or synthetic slain event metadata")
			}
			target, err := guid.FromString(slain.Target)
			if err != nil || target.IsZero() {
				return nil, fmt.Errorf("invalid slain target %q", slain.Target)
			}
			prevOffset = slain.Meta.OffsetMilli
			prevIndex = slain.Meta.Index
			deaths = append(deaths, razorgoreDeath{target: target, offset: slain.Meta.OffsetMilli})
		}
		if len(body) != 0 {
			return nil, errors.New("event count does not consume frame")
		}
	}
	if !found {
		return nil, errors.New("missing encounter frame")
	}
	return deaths, nil
}
