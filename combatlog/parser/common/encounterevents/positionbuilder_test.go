package encounterevents

import (
	"testing"
	"time"

	"github.com/Emyrk/chronicle/api/chronicleproto"
	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
	"google.golang.org/protobuf/encoding/protowire"
	"google.golang.org/protobuf/proto"
)

func TestPositionBuilderCompactsUnchangedRunToEndpoints(t *testing.T) {
	t.Parallel()

	start := time.Date(2026, time.October, 18, 12, 0, 0, 0, time.UTC)
	builder := NewPositionBuilder()
	builder.SetZero(start)
	unit := guid.GUID(1)

	for index, offset := range []time.Duration{0, time.Second, 2 * time.Second, 3 * time.Second} {
		require.NoError(t, builder.Add(&messages.UnitPosition{
			MessageBase: messages.Base(start.Add(offset)),
			Unit:        unit,
			X:           10,
			Y:           20,
		}, int32(index+10)))
	}
	require.NoError(t, builder.Add(&messages.UnitPosition{
		MessageBase: messages.Base(start.Add(8 * time.Second)),
		Unit:        unit,
		X:           30,
		Y:           40,
	}, 14))

	require.Equal(t, int64(3), builder.Count)
	positions := finalizePositions(t, builder)
	require.Equal(t, []int64{0, 3_000, 8_000}, positionOffsets(positions))
	require.Equal(t, []int32{10, 13, 14}, positionIndexes(positions))
	require.Equal(t, []float64{10, 10, 30}, positionXs(positions))
}

func TestPositionBuilderPreservesOrderAroundInterleavedUnits(t *testing.T) {
	t.Parallel()

	start := time.Date(2026, time.October, 18, 12, 0, 0, 0, time.UTC)
	builder := NewPositionBuilder()
	builder.SetZero(start)
	firstUnit := guid.GUID(1)
	secondUnit := guid.GUID(2)

	for _, position := range []struct {
		offset time.Duration
		unit   guid.GUID
		index  int32
	}{
		{offset: time.Second, unit: firstUnit, index: 1},
		{offset: 2 * time.Second, unit: firstUnit, index: 2},
		{offset: 3 * time.Second, unit: secondUnit, index: 3},
		{offset: 4 * time.Second, unit: firstUnit, index: 4},
	} {
		require.NoError(t, builder.Add(&messages.UnitPosition{
			MessageBase: messages.Base(start.Add(position.offset)),
			Unit:        position.unit,
			X:           float64(position.unit),
		}, position.index))
	}

	positions := finalizePositions(t, builder)
	require.Equal(t, []int64{1_000, 3_000, 4_000}, positionOffsets(positions))
	require.Equal(t, []int32{1, 3, 4}, positionIndexes(positions))
	require.Equal(t, []string{firstUnit.String(), secondUnit.String(), firstUnit.String()}, positionUnits(positions))
}

func TestPositionBuilderPreservesMetadataChanges(t *testing.T) {
	t.Parallel()

	start := time.Date(2026, time.October, 18, 12, 0, 0, 0, time.UTC)
	builder := NewPositionBuilder()
	builder.SetZero(start)
	unit := guid.GUID(1)

	positions := []*messages.UnitPosition{
		{MessageBase: messages.Base(start), Unit: unit, X: 10},
		{MessageBase: messages.Base(start.Add(time.Second), messages.WithSynthetic()), Unit: unit, X: 10},
		{MessageBase: messages.Base(start.Add(2 * time.Second)), Unit: unit, X: 10},
		{MessageBase: messages.Base(start.Add(3 * time.Second)), Unit: unit, X: 10},
		{MessageBase: messages.Base(start.Add(4 * time.Second)), Unit: unit, X: 10},
	}
	positions[3].AddActivity(unit, messages.ActivityBump)
	for index, position := range positions {
		require.NoError(t, builder.Add(position, int32(index)))
	}

	result := finalizePositions(t, builder)
	require.Equal(t, []int64{0, 1_000, 2_000, 3_000, 4_000}, positionOffsets(result))
	require.False(t, result[0].Meta.IsSynthetic)
	require.True(t, result[1].Meta.IsSynthetic)
	require.Len(t, result[3].Meta.Activity, 1)
}

func finalizePositions(t *testing.T, builder *PositionBuilder) []*chronicleproto.UnitPosition {
	t.Helper()

	payload, err := builder.Finalize(uuid.New())
	require.NoError(t, err)

	_, body := consumeBytes(t, payload)
	_, body = consumeVarint(t, body)
	count, body := consumeVarint(t, body)
	bodyLength, body := consumeVarint(t, body)
	require.LessOrEqual(t, bodyLength, uint64(len(body)))
	body = body[:bodyLength]

	positions := make([]*chronicleproto.UnitPosition, 0, count)
	for len(body) > 0 {
		messageLength, rest := consumeVarint(t, body)
		require.LessOrEqual(t, messageLength, uint64(len(rest)))
		position := &chronicleproto.UnitPosition{}
		require.NoError(t, proto.Unmarshal(rest[:messageLength], position))
		positions = append(positions, position)
		body = rest[messageLength:]
	}
	require.Len(t, positions, int(count))
	return positions
}

func consumeBytes(t *testing.T, data []byte) ([]byte, []byte) {
	t.Helper()
	value, length := protowire.ConsumeBytes(data)
	require.GreaterOrEqual(t, length, 0)
	return value, data[length:]
}

func consumeVarint(t *testing.T, data []byte) (uint64, []byte) {
	t.Helper()
	value, length := protowire.ConsumeVarint(data)
	require.GreaterOrEqual(t, length, 0)
	return value, data[length:]
}

func positionOffsets(positions []*chronicleproto.UnitPosition) []int64 {
	result := make([]int64, len(positions))
	for index, position := range positions {
		result[index] = position.Meta.OffsetMilli
	}
	return result
}

func positionIndexes(positions []*chronicleproto.UnitPosition) []int32 {
	result := make([]int32, len(positions))
	for index, position := range positions {
		result[index] = position.Meta.Index
	}
	return result
}

func positionXs(positions []*chronicleproto.UnitPosition) []float64 {
	result := make([]float64, len(positions))
	for index, position := range positions {
		result[index] = position.X
	}
	return result
}

func positionUnits(positions []*chronicleproto.UnitPosition) []string {
	result := make([]string, len(positions))
	for index, position := range positions {
		result[index] = position.Unit
	}
	return result
}
