// Package sidekickstorage decodes Chronicle Sidekick SavedVariables artifacts.
package sidekickstorage

import (
	"context"
	"fmt"
	"io"
	"math"
	"strconv"
	"strings"
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/messagesource"
	"github.com/Emyrk/chronicle/combatlog/parser/types"
)

const (
	maxSavedVariablesBytes = 8 << 20
	maxEncodedBytes        = 4128768
	maxGUIDs               = 1296
	maxTicksPerChunk       = 60
	maxPositionsPerTick    = 50
	maxStatesPerChunk      = 60

	unknownPermille  = 1295
	unknownMaximum   = 60466175
	unknownPowerType = 35
)

type Decoder struct{}

var _ messagesource.Decoder = Decoder{}

func (Decoder) Decode(ctx context.Context, reader io.Reader) (messagesource.MessageSource, error) {
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	data, err := io.ReadAll(io.LimitReader(reader, maxSavedVariablesBytes+1))
	if err != nil {
		return nil, fmt.Errorf("read SavedVariables: %w", err)
	}
	if len(data) > maxSavedVariablesBytes {
		return nil, fmt.Errorf("SavedVariables exceeds %d bytes", maxSavedVariablesBytes)
	}
	root, err := parseSavedVariables(string(data))
	if err != nil {
		return nil, err
	}
	payload, ok := root.fields["position_payload"]
	if !ok {
		return nil, fmt.Errorf("sidekick SavedVariables position_payload not found")
	}
	decoded, schemaVersion, err := decodePayload(ctx, payload)
	if err != nil {
		return nil, fmt.Errorf("decode position_payload: %w", err)
	}
	source := &Source{messages: decoded, schemaVersion: schemaVersion}
	for _, message := range decoded {
		switch message.(type) {
		case *messages.UnitPosition:
			source.sawUnitPosition = true
		case *messages.UnitResources:
			source.sawUnitResources = true
		}
	}
	return source, nil
}

type Source struct {
	messages         []messages.Message
	next             int
	schemaVersion    int32
	sawUnitPosition  bool
	sawUnitResources bool
}

func (s *Source) Advance(ctx context.Context) ([]messages.Message, error) {
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	if s.next >= len(s.messages) {
		return nil, io.EOF
	}

	start := s.next
	timestamp := s.messages[start].Date()
	for s.next < len(s.messages) && s.messages[s.next].Date().Equal(timestamp) {
		s.next++
	}
	return s.messages[start:s.next], nil
}

func (s *Source) SchemaVersion() int32   { return s.schemaVersion }
func (s *Source) SawUnitPosition() bool  { return s.sawUnitPosition }
func (s *Source) SawUnitResources() bool { return s.sawUnitResources }

func decodePayload(ctx context.Context, payload luaValue) ([]messages.Message, int32, error) {
	if payload.kind != luaTable {
		return nil, 0, fmt.Errorf("payload must be a table")
	}
	schema, err := requiredUint(payload, "schema_version")
	if err != nil {
		return nil, 0, err
	}
	encoding, err := requiredString(payload, "encoding")
	if err != nil {
		return nil, 0, err
	}

	switch {
	case schema == 1 && encoding == "b36-v1":
		decoded, err := decodePayloadV1(ctx, payload)
		return decoded, 1, err
	case schema == 2 && encoding == "b36-v2":
		decoded, err := decodePayloadV2(ctx, payload)
		return decoded, 2, err
	case schema != 1 && schema != 2:
		return nil, 0, fmt.Errorf("unsupported schema_version %d", schema)
	default:
		return nil, 0, fmt.Errorf("unsupported encoding %q for schema_version %d", encoding, schema)
	}
}

func decodeGUIDs(ctx context.Context, payload luaValue) ([]guid.GUID, int, error) {
	guidValues, err := requiredArray(payload, "guids")
	if err != nil {
		return nil, 0, err
	}
	if len(guidValues) > maxGUIDs {
		return nil, 0, fmt.Errorf("guids has %d entries, maximum is %d", len(guidValues), maxGUIDs)
	}
	guids := make([]guid.GUID, len(guidValues))
	seenGUIDs := make(map[string]struct{}, len(guidValues))
	guidBytes := 0
	for index, value := range guidValues {
		if err := ctx.Err(); err != nil {
			return nil, 0, err
		}
		if value.kind != luaString {
			return nil, 0, fmt.Errorf("guids[%d] must be a string", index+1)
		}
		if len(value.text) == 0 || len(value.text) > 64 || !isASCII(value.text) {
			return nil, 0, fmt.Errorf("guids[%d] must be non-empty ASCII of at most 64 bytes", index+1)
		}
		key := strings.ToLower(value.text)
		if _, exists := seenGUIDs[key]; exists {
			return nil, 0, fmt.Errorf("duplicate GUID %q", value.text)
		}
		seenGUIDs[key] = struct{}{}
		parsed, err := guid.FromString(value.text)
		if err != nil || parsed.IsZero() {
			return nil, 0, fmt.Errorf("guids[%d] invalid GUID %q", index+1, value.text)
		}
		guids[index] = parsed
		guidBytes += len(value.text) + 1
	}
	return guids, guidBytes, nil
}

func decodePayloadV1(ctx context.Context, payload luaValue) ([]messages.Message, error) {
	guids, guidBytes, err := decodeGUIDs(ctx, payload)
	if err != nil {
		return nil, err
	}
	chunks, err := requiredArray(payload, "chunks")
	if err != nil {
		return nil, err
	}
	var result []messages.Message
	tickCount := uint64(0)
	positionCount := uint64(0)
	encodedBytes := guidBytes
	lastChunkTicks := 0
	for chunkIndex, value := range chunks {
		if err := ctx.Err(); err != nil {
			return nil, err
		}
		if value.kind != luaString || value.text == "" || !isASCII(value.text) {
			return nil, fmt.Errorf("chunks[%d] must be a non-empty ASCII string", chunkIndex+1)
		}
		encodedBytes += len(value.text)
		if encodedBytes > maxEncodedBytes {
			return nil, fmt.Errorf("encoded content exceeds %d bytes", maxEncodedBytes)
		}
		ticks, err := decodeChunkV1(ctx, value.text, guids, &result, &positionCount)
		if err != nil {
			return nil, fmt.Errorf("chunks[%d]: %w", chunkIndex+1, err)
		}
		lastChunkTicks = ticks
		tickCount += uint64(ticks)
	}
	if err := validateDiagnostics(payload, chunks, nil, tickCount, positionCount, 0, uint64(encodedBytes), lastChunkTicks, 0); err != nil {
		return nil, err
	}
	return result, nil
}

type vitalState struct {
	healthMaximum   uint64
	resourceMaximum uint64
	resourceType    uint64
}

type stateRecord struct {
	epoch     uint64
	guidIndex uint64
	state     vitalState
}

func decodePayloadV2(ctx context.Context, payload luaValue) ([]messages.Message, error) {
	guids, guidBytes, err := decodeGUIDs(ctx, payload)
	if err != nil {
		return nil, err
	}
	chunks, err := requiredArray(payload, "chunks")
	if err != nil {
		return nil, err
	}
	stateChunks, err := requiredArray(payload, "state_chunks")
	if err != nil {
		return nil, err
	}

	var stateRecords []stateRecord
	stateCount := uint64(0)
	encodedBytes := guidBytes
	lastStateChunkRecords := 0
	for chunkIndex, value := range stateChunks {
		if err := ctx.Err(); err != nil {
			return nil, err
		}
		if value.kind != luaString || value.text == "" || !isASCII(value.text) {
			return nil, fmt.Errorf("state_chunks[%d] must be a non-empty ASCII string", chunkIndex+1)
		}
		encodedBytes += len(value.text)
		if encodedBytes > maxEncodedBytes {
			return nil, fmt.Errorf("encoded content exceeds %d bytes", maxEncodedBytes)
		}
		records, err := decodeStateChunk(ctx, value.text, guids, &stateRecords)
		if err != nil {
			return nil, fmt.Errorf("state_chunks[%d]: %w", chunkIndex+1, err)
		}
		lastStateChunkRecords = records
		stateCount += uint64(records)
	}

	stateBatchesByEpoch := batchStateRecords(stateRecords)

	var result []messages.Message
	stateByGUID := make(map[uint64]vitalState)
	tickCount := uint64(0)
	positionCount := uint64(0)
	lastChunkTicks := 0
	for chunkIndex, value := range chunks {
		if err := ctx.Err(); err != nil {
			return nil, err
		}
		if value.kind != luaString || value.text == "" || !isASCII(value.text) {
			return nil, fmt.Errorf("chunks[%d] must be a non-empty ASCII string", chunkIndex+1)
		}
		encodedBytes += len(value.text)
		if encodedBytes > maxEncodedBytes {
			return nil, fmt.Errorf("encoded content exceeds %d bytes", maxEncodedBytes)
		}
		ticks, err := decodeChunkV2(ctx, value.text, guids, stateBatchesByEpoch, stateByGUID, &result, &positionCount)
		if err != nil {
			return nil, fmt.Errorf("chunks[%d]: %w", chunkIndex+1, err)
		}
		lastChunkTicks = ticks
		tickCount += uint64(ticks)
	}
	if err := validateDiagnostics(payload, chunks, stateChunks, tickCount, positionCount, stateCount, uint64(encodedBytes), lastChunkTicks, lastStateChunkRecords); err != nil {
		return nil, err
	}
	return result, nil
}

func validateDiagnostics(payload luaValue, chunks, stateChunks []luaValue, tickCount, positionCount, stateCount, encodedBytes uint64, lastChunkTicks, lastStateChunkRecords int) error {
	checks := []struct {
		name string
		got  uint64
	}{
		{name: "tick_count", got: tickCount},
		{name: "position_count", got: positionCount},
		{name: "encoded_bytes", got: encodedBytes},
	}
	if stateChunks != nil {
		checks = append(checks, struct {
			name string
			got  uint64
		}{name: "state_count", got: stateCount})
	}
	for _, check := range checks {
		reported, err := requiredUint(payload, check.name)
		if err != nil {
			return err
		}
		if reported != check.got {
			return fmt.Errorf("%s mismatch: decoded %d, reported %d", check.name, check.got, reported)
		}
	}
	if err := validateOptionalCount(payload, "current_chunk_ticks", len(chunks), lastChunkTicks); err != nil {
		return err
	}
	if stateChunks != nil {
		if err := validateOptionalCount(payload, "current_state_chunk_records", len(stateChunks), lastStateChunkRecords); err != nil {
			return err
		}
	}
	return nil
}

func validateOptionalCount(payload luaValue, name string, chunks, lastCount int) error {
	value, ok := payload.fields[name]
	if !ok {
		return nil
	}
	count, err := valueUint(value, name)
	if err != nil {
		return err
	}
	expected := uint64(lastCount)
	if chunks == 0 {
		expected = 0
	}
	if count != expected {
		return fmt.Errorf("%s mismatch: decoded %d, reported %d", name, expected, count)
	}
	return nil
}

func decodeChunkV1(ctx context.Context, chunk string, guids []guid.GUID, result *[]messages.Message, positionCount *uint64) (int, error) {
	parts, err := splitRecords(chunk, maxTicksPerChunk, "ticks", "unterminated trailing tick")
	if err != nil {
		return 0, err
	}
	for tickIndex, tick := range parts {
		if err := ctx.Err(); err != nil {
			return 0, err
		}
		epoch, mapID, records, err := decodeTickHeader(tickIndex, tick, 8)
		if err != nil {
			return 0, err
		}
		seenIndexes := make(map[uint64]struct{}, len(records)/8)
		for offset := 0; offset < len(records); offset += 8 {
			record := records[offset : offset+8]
			index, indexErr := decodeBase36(record[:2])
			x, xErr := decodeBase36(record[2:5])
			y, yErr := decodeBase36(record[5:])
			if err := validateSample(tickIndex, offset/8, index, indexErr, x, xErr, y, yErr, guids, seenIndexes); err != nil {
				return 0, err
			}
			*result = append(*result, unitPosition(epoch, mapID, guids[index], x, y))
			*positionCount++
		}
	}
	return len(parts), nil
}

func decodeChunkV2(ctx context.Context, chunk string, guids []guid.GUID, stateBatchesByEpoch map[uint64][][]stateRecord, stateByGUID map[uint64]vitalState, result *[]messages.Message, positionCount *uint64) (int, error) {
	parts, err := splitRecords(chunk, maxTicksPerChunk, "ticks", "unterminated trailing tick")
	if err != nil {
		return 0, err
	}
	for tickIndex, tick := range parts {
		if err := ctx.Err(); err != nil {
			return 0, err
		}
		epoch, mapID, records, err := decodeTickHeader(tickIndex, tick, 12)
		if err != nil {
			return 0, err
		}
		if batches := stateBatchesByEpoch[epoch]; len(batches) > 0 {
			for _, record := range batches[0] {
				stateByGUID[record.guidIndex] = record.state
			}
			if len(batches) == 1 {
				delete(stateBatchesByEpoch, epoch)
			} else {
				stateBatchesByEpoch[epoch] = batches[1:]
			}
		}

		seenIndexes := make(map[uint64]struct{}, len(records)/12)
		for offset := 0; offset < len(records); offset += 12 {
			record := records[offset : offset+12]
			index, indexErr := decodeBase36(record[:2])
			x, xErr := decodeBase36(record[2:5])
			y, yErr := decodeBase36(record[5:8])
			healthPermille, healthErr := decodeBase36(record[8:10])
			resourcePermille, resourceErr := decodeBase36(record[10:])
			if err := validateSample(tickIndex, offset/12, index, indexErr, x, xErr, y, yErr, guids, seenIndexes); err != nil {
				return 0, err
			}
			if healthErr != nil || !validPermille(healthPermille) {
				return 0, fmt.Errorf("tick %d position %d: invalid health permille", tickIndex+1, offset/12+1)
			}
			if resourceErr != nil || !validPermille(resourcePermille) {
				return 0, fmt.Errorf("tick %d position %d: invalid resource permille", tickIndex+1, offset/12+1)
			}

			unit := guids[index]
			*result = append(*result, unitPosition(epoch, mapID, unit, x, y))
			if resource, ok := unitResources(epoch, unit, healthPermille, resourcePermille, stateByGUID[index]); ok {
				*result = append(*result, resource)
			}
			*positionCount++
		}
	}
	return len(parts), nil
}

func decodeTickHeader(tickIndex int, tick string, recordWidth int) (uint64, uint64, string, error) {
	first := strings.IndexByte(tick, ':')
	if first <= 0 {
		return 0, 0, "", fmt.Errorf("tick %d: missing epoch separator", tickIndex+1)
	}
	secondRelative := strings.IndexByte(tick[first+1:], ':')
	if secondRelative < 0 {
		return 0, 0, "", fmt.Errorf("tick %d: missing map separator", tickIndex+1)
	}
	second := first + 1 + secondRelative
	epoch, err := decodeBase36(tick[:first])
	if err != nil || epoch == 0 || epoch > 1<<53-1 {
		return 0, 0, "", fmt.Errorf("tick %d: invalid epoch %q", tickIndex+1, tick[:first])
	}
	mapText := tick[first+1 : second]
	if len(mapText) != 3 {
		return 0, 0, "", fmt.Errorf("tick %d: map ID width is %d, want 3", tickIndex+1, len(mapText))
	}
	mapID, err := decodeBase36(mapText)
	if err != nil || mapID > 46655 {
		return 0, 0, "", fmt.Errorf("tick %d: invalid map ID %q", tickIndex+1, mapText)
	}
	records := tick[second+1:]
	if len(records) == 0 || len(records)%recordWidth != 0 || len(records)/recordWidth > maxPositionsPerTick {
		return 0, 0, "", fmt.Errorf("tick %d: invalid position record length %d", tickIndex+1, len(records))
	}
	return epoch, mapID, records, nil
}

func validateSample(tickIndex, positionIndex int, index uint64, indexErr error, x uint64, xErr error, y uint64, yErr error, guids []guid.GUID, seenIndexes map[uint64]struct{}) error {
	if indexErr != nil {
		return fmt.Errorf("tick %d position %d: invalid GUID index", tickIndex+1, positionIndex+1)
	}
	if index >= uint64(len(guids)) {
		return fmt.Errorf("tick %d position %d: GUID index %d out of range", tickIndex+1, positionIndex+1, index)
	}
	if _, duplicate := seenIndexes[index]; duplicate {
		return fmt.Errorf("tick %d: duplicate GUID index %d", tickIndex+1, index)
	}
	seenIndexes[index] = struct{}{}
	if xErr != nil || x > 10000 {
		return fmt.Errorf("tick %d position %d: invalid x coordinate", tickIndex+1, positionIndex+1)
	}
	if yErr != nil || y > 10000 {
		return fmt.Errorf("tick %d position %d: invalid y coordinate", tickIndex+1, positionIndex+1)
	}
	return nil
}

func decodeStateChunk(ctx context.Context, chunk string, guids []guid.GUID, result *[]stateRecord) (int, error) {
	parts, err := splitRecords(chunk, maxStatesPerChunk, "state records", "unterminated trailing state record")
	if err != nil {
		return 0, err
	}
	for recordIndex, record := range parts {
		if err := ctx.Err(); err != nil {
			return 0, err
		}
		separator := strings.IndexByte(record, ':')
		if separator <= 0 || strings.IndexByte(record[separator+1:], ':') >= 0 {
			return 0, fmt.Errorf("state record %d: expected exactly one separator", recordIndex+1)
		}
		epoch, err := decodeBase36(record[:separator])
		if err != nil || epoch == 0 || epoch > 1<<53-1 {
			return 0, fmt.Errorf("state record %d: invalid epoch %q", recordIndex+1, record[:separator])
		}
		body := record[separator+1:]
		if len(body) != 13 {
			return 0, fmt.Errorf("state record %d: body width is %d, want 13", recordIndex+1, len(body))
		}
		index, indexErr := decodeBase36(body[:2])
		healthMaximum, healthErr := decodeBase36(body[2:7])
		resourceMaximum, resourceErr := decodeBase36(body[7:12])
		resourceType, typeErr := decodeBase36(body[12:])
		if indexErr != nil || index >= uint64(len(guids)) {
			return 0, fmt.Errorf("state record %d: invalid GUID index", recordIndex+1)
		}
		if healthErr != nil || healthMaximum > unknownMaximum {
			return 0, fmt.Errorf("state record %d: invalid maximum health", recordIndex+1)
		}
		if resourceErr != nil || resourceMaximum > unknownMaximum {
			return 0, fmt.Errorf("state record %d: invalid maximum resource", recordIndex+1)
		}
		if typeErr != nil || resourceType > unknownPowerType {
			return 0, fmt.Errorf("state record %d: invalid resource type", recordIndex+1)
		}
		*result = append(*result, stateRecord{
			epoch:     epoch,
			guidIndex: index,
			state: vitalState{
				healthMaximum: healthMaximum, resourceMaximum: resourceMaximum, resourceType: resourceType,
			},
		})
	}
	return len(parts), nil
}

func batchStateRecords(records []stateRecord) map[uint64][][]stateRecord {
	batches := make(map[uint64][][]stateRecord)
	for len(records) > 0 {
		epoch := records[0].epoch
		seen := make(map[uint64]struct{})
		end := 0
		for end < len(records) && records[end].epoch == epoch {
			if _, duplicate := seen[records[end].guidIndex]; duplicate {
				break
			}
			seen[records[end].guidIndex] = struct{}{}
			end++
		}
		batches[epoch] = append(batches[epoch], records[:end])
		records = records[end:]
	}
	return batches
}

func splitRecords(chunk string, maximum int, name, unterminated string) ([]string, error) {
	if !strings.HasSuffix(chunk, ";") {
		return nil, fmt.Errorf("%s", unterminated)
	}
	parts := strings.Split(chunk, ";")
	parts = parts[:len(parts)-1]
	if len(parts) < 1 || len(parts) > maximum {
		return nil, fmt.Errorf("contains %d %s, want 1 through %d", len(parts), name, maximum)
	}
	return parts, nil
}

func validPermille(value uint64) bool {
	return value <= 1000 || value == unknownPermille
}

func unitPosition(epoch, mapID uint64, unit guid.GUID, x, y uint64) *messages.UnitPosition {
	return &messages.UnitPosition{
		MessageBase: messages.Base(time.UnixMilli(int64(epoch)), messages.WithSynthetic()),
		Unit:        unit, X: float64(x) / 10000, Y: float64(y) / 10000, MapID: int32(mapID),
	}
}

func unitResources(epoch uint64, unit guid.GUID, healthPermille, resourcePermille uint64, state vitalState) (*messages.UnitResources, bool) {
	if healthPermille == unknownPermille || state.healthMaximum == 0 || state.healthMaximum == unknownMaximum {
		return nil, false
	}
	resource := &messages.UnitResources{
		MessageBase:   messages.Base(time.UnixMilli(int64(epoch)), messages.WithSynthetic()),
		Unit:          unit,
		CurrentHealth: approximateCurrent(state.healthMaximum, healthPermille),
		MaximumHealth: int64(state.healthMaximum),
		PowerType:     types.ResourceUnknown,
	}
	if resourcePermille != unknownPermille && state.resourceMaximum > 0 && state.resourceMaximum != unknownMaximum && state.resourceType != unknownPowerType {
		resource.CurrentPower = int32(approximateCurrent(state.resourceMaximum, resourcePermille))
		resource.MaximumPower = int32(state.resourceMaximum)
		resource.PowerType = powerTypeResource(state.resourceType)
	}
	return resource, true
}

func approximateCurrent(maximum, permille uint64) int64 {
	return int64((maximum*permille + 500) / 1000)
}

func powerTypeResource(powerType uint64) types.Resource {
	switch powerType {
	case 0:
		return types.ResourceMana
	case 1:
		return types.ResourceRage
	case 2:
		return types.ResourceFocus
	case 3:
		return types.ResourceEnergy
	case 4:
		return types.ResourceHappiness
	default:
		return types.Resource(fmt.Sprintf("PowerType%d", powerType))
	}
}

func decodeBase36(text string) (uint64, error) {
	if text == "" {
		return 0, fmt.Errorf("empty base36")
	}
	var value uint64
	for _, ch := range []byte(text) {
		var digit uint64
		switch {
		case ch >= '0' && ch <= '9':
			digit = uint64(ch - '0')
		case ch >= 'a' && ch <= 'z':
			digit = uint64(ch - 'a' + 10)
		default:
			return 0, fmt.Errorf("invalid base36 character %q", ch)
		}
		if value > (math.MaxUint64-digit)/36 {
			return 0, fmt.Errorf("base36 overflow")
		}
		value = value*36 + digit
	}
	return value, nil
}

func requiredArray(table luaValue, name string) ([]luaValue, error) {
	value, ok := table.fields[name]
	if !ok || value.kind != luaTable {
		return nil, fmt.Errorf("%s must be an array", name)
	}
	result := append([]luaValue(nil), value.array...)
	for key, element := range value.fields {
		index, err := strconv.Atoi(key)
		if err != nil || index < 1 {
			return nil, fmt.Errorf("%s must contain only positive integer keys", name)
		}
		if index <= len(value.array) || index > len(value.array)+len(value.fields) {
			return nil, fmt.Errorf("%s array index %d is duplicate or non-contiguous", name, index)
		}
		for len(result) < index {
			result = append(result, luaValue{})
		}
		result[index-1] = element
	}
	for index, element := range result {
		if element.kind == luaNil {
			return nil, fmt.Errorf("%s array index %d is missing", name, index+1)
		}
	}
	return result, nil
}
func requiredString(table luaValue, name string) (string, error) {
	value, ok := table.fields[name]
	if !ok || value.kind != luaString {
		return "", fmt.Errorf("%s must be a string", name)
	}
	return value.text, nil
}
func requiredUint(table luaValue, name string) (uint64, error) {
	value, ok := table.fields[name]
	if !ok {
		return 0, fmt.Errorf("%s is required", name)
	}
	return valueUint(value, name)
}
func valueUint(value luaValue, name string) (uint64, error) {
	if value.kind != luaNumber {
		return 0, fmt.Errorf("%s must be a non-negative integer", name)
	}
	parsed, err := strconv.ParseUint(value.text, 10, 64)
	if err != nil {
		return 0, fmt.Errorf("%s must be a non-negative integer", name)
	}
	return parsed, nil
}
func isASCII(value string) bool {
	for i := range len(value) {
		if value[i] > 0x7f {
			return false
		}
	}
	return true
}
