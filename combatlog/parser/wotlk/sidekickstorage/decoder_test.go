package sidekickstorage_test

import (
	"context"
	"io"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/types"
	"github.com/Emyrk/chronicle/combatlog/parser/wotlk/sidekickstorage"
	"github.com/stretchr/testify/require"
)

func TestDecoderCanonicalV2SavedVariables(t *testing.T) {
	t.Parallel()
	file, err := os.Open("testdata/realistic.lua")
	require.NoError(t, err)
	defer func() { require.NoError(t, file.Close()) }()

	sourceValue, err := (sidekickstorage.Decoder{}).Decode(context.Background(), file)
	require.NoError(t, err)
	source := sourceValue.(*sidekickstorage.Source)
	require.Equal(t, int32(2), source.SchemaVersion())
	require.True(t, source.SawUnitPosition())
	require.True(t, source.SawUnitResources())

	batch, err := source.Advance(context.Background())
	require.NoError(t, err)
	require.Len(t, batch, 4)

	firstPosition := batch[0].(*messages.UnitPosition)
	require.Equal(t, "0x0000000000000001", firstPosition.Unit.String())
	require.Equal(t, time.UnixMilli(1786244400123), firstPosition.Date())
	require.Equal(t, int32(631), firstPosition.MapID)
	require.InDelta(t, .1234, firstPosition.X, 0.000001)
	require.InDelta(t, .5678, firstPosition.Y, 0.000001)
	require.True(t, firstPosition.IsSynthetic())

	firstResources := batch[1].(*messages.UnitResources)
	require.Equal(t, int64(15000), firstResources.CurrentHealth)
	require.Equal(t, int64(30000), firstResources.MaximumHealth)
	require.Equal(t, int32(5000), firstResources.CurrentPower)
	require.Equal(t, int32(20000), firstResources.MaximumPower)
	require.Equal(t, types.ResourceMana, firstResources.PowerType)
	require.True(t, firstResources.IsSynthetic())

	secondPosition := batch[2].(*messages.UnitPosition)
	require.InDelta(t, 1.0, secondPosition.X, 0.000001)
	require.Zero(t, secondPosition.Y)

	secondResources := batch[3].(*messages.UnitResources)
	require.Equal(t, int64(50000), secondResources.CurrentHealth)
	require.Equal(t, int64(50000), secondResources.MaximumHealth)
	require.Zero(t, secondResources.CurrentPower)
	require.Zero(t, secondResources.MaximumPower)
	require.Equal(t, types.ResourceUnknown, secondResources.PowerType)

	_, err = source.Advance(context.Background())
	require.ErrorIs(t, err, io.EOF)
}

func TestDecoderCanonicalV3Floor(t *testing.T) {
	t.Parallel()
	sourceValue, err := (sidekickstorage.Decoder{}).Decode(context.Background(), strings.NewReader(payloadV3()))
	require.NoError(t, err)
	source := sourceValue.(*sidekickstorage.Source)
	require.Equal(t, int32(3), source.SchemaVersion())

	batch, err := source.Advance(context.Background())
	require.NoError(t, err)
	require.Len(t, batch, 4)
	floor := int32(2)
	require.Equal(t, &floor, batch[0].(*messages.UnitPosition).Floor)
	require.Equal(t, &floor, batch[2].(*messages.UnitPosition).Floor)
}

func TestDecoderV3PreservesFloorZero(t *testing.T) {
	t.Parallel()
	input := payloadV3(`chunks = { "msl7so3f:0hj:00:000ya4dqdw6y017ps000rszz;" }`)
	sourceValue, err := (sidekickstorage.Decoder{}).Decode(context.Background(), strings.NewReader(input))
	require.NoError(t, err)
	batch, err := sourceValue.(*sidekickstorage.Source).Advance(context.Background())
	require.NoError(t, err)
	floor := int32(0)
	require.Equal(t, &floor, batch[0].(*messages.UnitPosition).Floor)
}

func TestDecoderV3PreservesUnknownFloor(t *testing.T) {
	t.Parallel()
	input := payloadV3(`chunks = { "msl7so3f:0hj:zz:000ya4dqdw6y017ps000rszz;" }`)
	sourceValue, err := (sidekickstorage.Decoder{}).Decode(context.Background(), strings.NewReader(input))
	require.NoError(t, err)
	batch, err := sourceValue.(*sidekickstorage.Source).Advance(context.Background())
	require.NoError(t, err)
	require.Nil(t, batch[0].(*messages.UnitPosition).Floor)
}

func TestDecoderRetainsV1Compatibility(t *testing.T) {
	t.Parallel()
	sourceValue, err := (sidekickstorage.Decoder{}).Decode(context.Background(), strings.NewReader(payloadV1()))
	require.NoError(t, err)
	source := sourceValue.(*sidekickstorage.Source)
	require.Equal(t, int32(1), source.SchemaVersion())
	require.True(t, source.SawUnitPosition())
	require.False(t, source.SawUnitResources())
	batch, err := source.Advance(context.Background())
	require.NoError(t, err)
	require.Len(t, batch, 2)
}

func TestDecoderPreservesTickTimestampRegression(t *testing.T) {
	t.Parallel()
	input := payloadV2(
		`chunks = { "msl7so3g:0hj:000ya4dqdw6y;msl7so3f:0hj:000ya4dqdw6y;" }`,
		`state_chunks = { "msl7so3g:0000n5c00ffk0;" }`,
		`current_chunk_ticks = 2`, `current_state_chunk_records = 1`,
		`tick_count = 2`, `position_count = 2`, `state_count = 1`, `encoded_bytes = 113`,
	)
	sourceValue, err := (sidekickstorage.Decoder{}).Decode(context.Background(), strings.NewReader(input))
	require.NoError(t, err)
	source := sourceValue.(*sidekickstorage.Source)

	first, err := source.Advance(context.Background())
	require.NoError(t, err)
	require.Equal(t, time.UnixMilli(1786244400124), first[0].Date())
	second, err := source.Advance(context.Background())
	require.NoError(t, err)
	require.Equal(t, time.UnixMilli(1786244400123), second[0].Date())
}

func TestDecoderAppliesStateChangesBeforeMatchingTick(t *testing.T) {
	t.Parallel()
	input := payloadV2(
		`chunks = { "msl7so3f:0hj:000ya4dqdw6y;msl7so3g:0hj:000ya4dqdw6y;" }`,
		`state_chunks = { "msl7so3f:0000n5c00ffk0;msl7so3g:0000rs000ffk0;" }`,
		`current_chunk_ticks = 2`, `current_state_chunk_records = 2`,
		`tick_count = 2`, `position_count = 2`, `state_count = 2`, `encoded_bytes = 136`,
	)
	sourceValue, err := (sidekickstorage.Decoder{}).Decode(context.Background(), strings.NewReader(input))
	require.NoError(t, err)
	source := sourceValue.(*sidekickstorage.Source)

	first, err := source.Advance(context.Background())
	require.NoError(t, err)
	require.Equal(t, int64(15000), first[1].(*messages.UnitResources).CurrentHealth)
	second, err := source.Advance(context.Background())
	require.NoError(t, err)
	require.Equal(t, int64(18000), second[1].(*messages.UnitResources).CurrentHealth)
}

func TestDecoderRepeatedTimestampUsesStateStreamOrder(t *testing.T) {
	t.Parallel()
	input := payloadV2(
		`chunks = { "msl7so3f:0hj:000ya4dqdw6y;msl7so3g:0hj:000ya4dqdw6y;msl7so3f:0hj:000ya4dqdw6y;" }`,
		`state_chunks = { "msl7so3f:0000n5c00ffk0;msl7so3g:0000uv400ffk0;msl7so3f:00012kw00ffk0;" }`,
		`current_chunk_ticks = 3`, `current_state_chunk_records = 3`,
		`tick_count = 3`, `position_count = 3`, `state_count = 3`, `encoded_bytes = 185`,
	)
	sourceValue, err := (sidekickstorage.Decoder{}).Decode(context.Background(), strings.NewReader(input))
	require.NoError(t, err)
	source := sourceValue.(*sidekickstorage.Source)

	first, err := source.Advance(context.Background())
	require.NoError(t, err)
	require.Equal(t, int64(15000), first[1].(*messages.UnitResources).CurrentHealth)
	second, err := source.Advance(context.Background())
	require.NoError(t, err)
	require.Equal(t, int64(20000), second[1].(*messages.UnitResources).CurrentHealth)
	third, err := source.Advance(context.Background())
	require.NoError(t, err)
	require.Equal(t, int64(25000), third[1].(*messages.UnitResources).CurrentHealth)
}

func TestDecoderRejectsInvalidV2Payloads(t *testing.T) {
	t.Parallel()
	cases := map[string]string{
		"malformed lua":               `ChronicleSidekickBridgeWoTLKDB = { position_payload = {`,
		"unsupported schema":          payloadV2(`schema_version = 3`),
		"unsupported encoding":        payloadV2(`encoding = "b35-v2"`),
		"invalid guid":                payloadV2(`guids = { "not-a-guid" }`, `chunks = { "msl7so3f:0hj:000ya4dqdw6y;" }`, `state_chunks = {}`, `position_count = 1`, `state_count = 0`, `encoded_bytes = 39`),
		"duplicate guid":              payloadV2(`guids = { "0x0000000000000001", "0x0000000000000001" }`),
		"index out of range":          payloadV2(`chunks = { "msl7so3f:0hj:020ya4dqdw6y;" }`, `position_count = 1`, `encoded_bytes = 113`),
		"duplicate index":             payloadV2(`chunks = { "msl7so3f:0hj:000ya4dqdw6y000ya4dqdw6y;" }`, `encoded_bytes = 125`),
		"coordinate out of range":     payloadV2(`chunks = { "msl7so3f:0hj:007pt000dw6y;" }`, `position_count = 1`, `encoded_bytes = 113`),
		"invalid health permille":     payloadV2(`chunks = { "msl7so3f:0hj:000ya4dqrx6y;" }`, `position_count = 1`, `encoded_bytes = 113`),
		"invalid resource permille":   payloadV2(`chunks = { "msl7so3f:0hj:000ya4dqdwrx;" }`, `position_count = 1`, `encoded_bytes = 113`),
		"invalid base36":              payloadV2(`chunks = { "msl7so3f:0hj:000yA4dqdw6y;" }`, `position_count = 1`, `encoded_bytes = 113`),
		"unterminated tick chunk":     payloadV2(`chunks = { "msl7so3f:0hj:000ya4dqdw6y" }`, `position_count = 1`, `encoded_bytes = 112`),
		"invalid state index":         payloadV2(`state_chunks = { "msl7so3f:0200n5c00ffk0;" }`),
		"invalid state maximum":       payloadV2(`state_chunks = { "msl7so3f:000zzzzx00ffk0;" }`),
		"invalid state resource type": payloadV2(`state_chunks = { "msl7so3f:0000n5c00ffkA;" }`),
		"unterminated state chunk":    payloadV2(`state_chunks = { "msl7so3f:0000n5c00ffk0" }`, `encoded_bytes = 121`),
		"tick count mismatch":         payloadV2(`tick_count = 2`),
		"position count mismatch":     payloadV2(`position_count = 3`),
		"state count mismatch":        payloadV2(`state_count = 3`),
		"encoded bytes mismatch":      payloadV2(`encoded_bytes = 123`),
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
	_, err := (sidekickstorage.Decoder{}).Decode(ctx, strings.NewReader(payloadV2()))
	require.ErrorIs(t, err, context.Canceled)
}

func payloadV3(overrides ...string) string {
	fields := map[string]string{
		"schema_version": `schema_version = 3`, "encoding": `encoding = "b36-v3"`,
		"guids":               `guids = { "0x0000000000000001", "0x0000000000000002" }`,
		"chunks":              `chunks = { "msl7so3f:0hj:02:000ya4dqdw6y017ps000rszz;" }`,
		"state_chunks":        `state_chunks = { "msl7so3f:0000n5c00ffk0;msl7so3f:01012kw000001;" }`,
		"current_chunk_ticks": `current_chunk_ticks = 1`, "current_state_chunk_records": `current_state_chunk_records = 2`,
		"tick_count": `tick_count = 1`, "position_count": `position_count = 2`, "state_count": `state_count = 2`,
		"encoded_bytes": `encoded_bytes = 125`,
	}
	return payload("ChronicleSidekickBridgeWoTLKDB", fields, []string{
		"schema_version", "encoding", "guids", "chunks", "state_chunks", "current_chunk_ticks", "current_state_chunk_records", "tick_count", "position_count", "state_count", "encoded_bytes",
	}, overrides...)
}

func payloadV2(overrides ...string) string {
	fields := map[string]string{
		"schema_version": `schema_version = 2`, "encoding": `encoding = "b36-v2"`,
		"guids":               `guids = { "0x0000000000000001", "0x0000000000000002" }`,
		"chunks":              `chunks = { "msl7so3f:0hj:000ya4dqdw6y017ps000rszz;" }`,
		"state_chunks":        `state_chunks = { "msl7so3f:0000n5c00ffk0;msl7so3f:01012kw000001;" }`,
		"current_chunk_ticks": `current_chunk_ticks = 1`, "current_state_chunk_records": `current_state_chunk_records = 2`,
		"tick_count": `tick_count = 1`, "position_count": `position_count = 2`, "state_count": `state_count = 2`,
		"encoded_bytes": `encoded_bytes = 122`,
	}
	return payload("ChronicleSidekickBridgeWoTLKDB", fields, []string{
		"schema_version", "encoding", "guids", "chunks", "state_chunks", "current_chunk_ticks", "current_state_chunk_records", "tick_count", "position_count", "state_count", "encoded_bytes",
	}, overrides...)
}

func payloadV1(overrides ...string) string {
	fields := map[string]string{
		"schema_version": `schema_version = 1`, "encoding": `encoding = "b36-v1"`,
		"guids":               `guids = { "0x0000000000000001", "0x0000000000000002" }`,
		"chunks":              `chunks = { "msl7so3f:0hj:000ya4dq017ps000;" }`,
		"current_chunk_ticks": `current_chunk_ticks = 1`, "tick_count": `tick_count = 1`,
		"position_count": `position_count = 2`, "encoded_bytes": `encoded_bytes = 68`,
	}
	return payload("ChronicleCompanionWoTLKDB", fields, []string{
		"schema_version", "encoding", "guids", "chunks", "current_chunk_ticks", "tick_count", "position_count", "encoded_bytes",
	}, overrides...)
}

func payload(databaseName string, fields map[string]string, order []string, overrides ...string) string {
	for _, override := range overrides {
		key := strings.TrimSpace(strings.SplitN(override, "=", 2)[0])
		fields[key] = override
	}
	var builder strings.Builder
	builder.WriteString(databaseName)
	builder.WriteString(" = { position_payload = { ")
	for _, key := range order {
		builder.WriteString(fields[key])
		builder.WriteString(", ")
	}
	builder.WriteString("}, unrelated = true }")
	return builder.String()
}
