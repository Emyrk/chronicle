package sidekickstorage_test

import (
	"context"
	"io"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/wotlk/sidekickstorage"
	"github.com/stretchr/testify/require"
)

func TestDecoderRealisticSavedVariables(t *testing.T) {
	t.Parallel()
	file, err := os.Open("testdata/realistic.lua")
	require.NoError(t, err)
	defer file.Close()
	sourceValue, err := (sidekickstorage.Decoder{}).Decode(context.Background(), file)
	require.NoError(t, err)
	source := sourceValue.(*sidekickstorage.Source)
	require.True(t, source.SawUnitPosition())
	require.False(t, source.SawUnitResources())
	batch, err := source.Advance(context.Background())
	require.NoError(t, err)
	require.Len(t, batch, 2)
	first := batch[0].(*messages.UnitPosition)
	require.Equal(t, "0x0000000000000001", first.Unit.String())
	require.Equal(t, time.UnixMilli(1786244400123), first.Date())
	require.Equal(t, int32(631), first.MapID)
	require.InDelta(t, .1234, first.X, 0.000001)
	require.InDelta(t, .5678, first.Y, 0.000001)
	require.True(t, first.IsSynthetic())
	second := batch[1].(*messages.UnitPosition)
	require.InDelta(t, 1.0, second.X, 0.000001)
	require.Zero(t, second.Y)
	_, err = source.Advance(context.Background())
	require.ErrorIs(t, err, io.EOF)
}

func TestDecoderRejectsInvalidPayloads(t *testing.T) {
	t.Parallel()
	cases := map[string]string{
		"malformed lua":           `ChronicleCompanionWoTLKDB = { position_payload = {`,
		"unsupported schema":      payload(`schema_version = 2`),
		"unsupported encoding":    payload(`encoding = "b35-v1"`),
		"invalid guid":            payload(`guids = { "not-a-guid" }`, `chunks = { "msl7so3f:0hj:000ya4dq;" }`, `position_count = 1`, `encoded_bytes = 37`),
		"duplicate guid":          payload(`guids = { "0x0000000000000001", "0x0000000000000001" }`, `encoded_bytes = 68`),
		"index out of range":      payload(`chunks = { "msl7so3f:0hj:020ya4dq;" }`, `position_count = 1`, `encoded_bytes = 60`),
		"duplicate index":         payload(`chunks = { "msl7so3f:0hj:000ya4dq007ps000;" }`, `encoded_bytes = 68`),
		"coordinate out of range": payload(`chunks = { "msl7so3f:0hj:007pt000;" }`, `position_count = 1`, `encoded_bytes = 60`),
		"invalid base36":          payload(`chunks = { "msl7so3f:0hj:000yA4dq;" }`, `position_count = 1`, `encoded_bytes = 60`),
		"unterminated chunk":      payload(`chunks = { "msl7so3f:0hj:000ya4dq" }`, `position_count = 1`, `encoded_bytes = 59`),
		"tick count mismatch":     payload(`tick_count = 2`),
		"position count mismatch": payload(`position_count = 3`),
		"encoded bytes mismatch":  payload(`encoded_bytes = 69`),
	}
	for name, input := range cases {
		name, input := name, input
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			_, err := (sidekickstorage.Decoder{}).Decode(context.Background(), strings.NewReader(input))
			require.Error(t, err)
		})
	}
}

func TestDecoderCancellation(t *testing.T) {
	t.Parallel()
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	_, err := (sidekickstorage.Decoder{}).Decode(ctx, strings.NewReader(payload()))
	require.ErrorIs(t, err, context.Canceled)
}

func payload(overrides ...string) string {
	fields := map[string]string{
		"schema_version": `schema_version = 1`, "encoding": `encoding = "b36-v1"`,
		"guids":               `guids = { "0x0000000000000001", "0x0000000000000002" }`,
		"chunks":              `chunks = { "msl7so3f:0hj:000ya4dq017ps000;" }`,
		"current_chunk_ticks": `current_chunk_ticks = 1`, "tick_count": `tick_count = 1`,
		"position_count": `position_count = 2`, "encoded_bytes": `encoded_bytes = 68`,
	}
	for _, override := range overrides {
		key := strings.TrimSpace(strings.SplitN(override, "=", 2)[0])
		fields[key] = override
	}
	order := []string{"schema_version", "encoding", "guids", "chunks", "current_chunk_ticks", "tick_count", "position_count", "encoded_bytes"}
	var builder strings.Builder
	builder.WriteString("ChronicleCompanionWoTLKDB = { position_payload = { ")
	for _, key := range order {
		builder.WriteString(fields[key])
		builder.WriteString(", ")
	}
	builder.WriteString("}, unrelated = true }")
	return builder.String()
}
