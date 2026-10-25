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
)

const (
	maxSavedVariablesBytes = 8 << 20
	maxEncodedBytes        = 4128768
	maxGUIDs               = 1296
	maxTicksPerChunk       = 60
	maxPositionsPerTick    = 50
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
		return nil, fmt.Errorf("ChronicleCompanionWoTLKDB.position_payload not found")
	}
	decoded, err := decodePayload(ctx, payload)
	if err != nil {
		return nil, fmt.Errorf("decode position_payload: %w", err)
	}
	return &Source{messages: decoded}, nil
}

type Source struct {
	messages []messages.Message
	done     bool
}

func (s *Source) Advance(ctx context.Context) ([]messages.Message, error) {
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	if s.done {
		return nil, io.EOF
	}
	s.done = true
	if len(s.messages) == 0 {
		return nil, io.EOF
	}
	return s.messages, nil
}

func (s *Source) SawUnitPosition() bool { return len(s.messages) > 0 }
func (*Source) SawUnitResources() bool  { return false }

func decodePayload(ctx context.Context, payload luaValue) ([]messages.Message, error) {
	if payload.kind != luaTable {
		return nil, fmt.Errorf("payload must be a table")
	}
	schema, err := requiredUint(payload, "schema_version")
	if err != nil {
		return nil, err
	}
	if schema != 1 {
		return nil, fmt.Errorf("unsupported schema_version %d", schema)
	}
	encoding, err := requiredString(payload, "encoding")
	if err != nil {
		return nil, err
	}
	if encoding != "b36-v1" {
		return nil, fmt.Errorf("unsupported encoding %q", encoding)
	}
	guidValues, err := requiredArray(payload, "guids")
	if err != nil {
		return nil, err
	}
	if len(guidValues) > maxGUIDs {
		return nil, fmt.Errorf("guids has %d entries, maximum is %d", len(guidValues), maxGUIDs)
	}
	guids := make([]guid.GUID, len(guidValues))
	seenGUIDs := make(map[string]struct{}, len(guidValues))
	guidBytes := 0
	for index, value := range guidValues {
		if err := ctx.Err(); err != nil {
			return nil, err
		}
		if value.kind != luaString {
			return nil, fmt.Errorf("guids[%d] must be a string", index+1)
		}
		if len(value.text) == 0 || len(value.text) > 64 || !isASCII(value.text) {
			return nil, fmt.Errorf("guids[%d] must be non-empty ASCII of at most 64 bytes", index+1)
		}
		key := strings.ToLower(value.text)
		if _, exists := seenGUIDs[key]; exists {
			return nil, fmt.Errorf("duplicate GUID %q", value.text)
		}
		seenGUIDs[key] = struct{}{}
		parsed, err := guid.FromString(value.text)
		if err != nil || parsed.IsZero() {
			return nil, fmt.Errorf("guids[%d] invalid GUID %q", index+1, value.text)
		}
		guids[index] = parsed
		guidBytes += len(value.text) + 1
	}
	chunks, err := requiredArray(payload, "chunks")
	if err != nil {
		return nil, err
	}
	reportedTicks, err := requiredUint(payload, "tick_count")
	if err != nil {
		return nil, err
	}
	reportedPositions, err := requiredUint(payload, "position_count")
	if err != nil {
		return nil, err
	}
	reportedBytes, err := requiredUint(payload, "encoded_bytes")
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
		ticks, err := decodeChunk(ctx, value.text, guids, &result, &positionCount)
		if err != nil {
			return nil, fmt.Errorf("chunks[%d]: %w", chunkIndex+1, err)
		}
		lastChunkTicks = ticks
		tickCount += uint64(ticks)
	}
	if tickCount != reportedTicks {
		return nil, fmt.Errorf("tick_count mismatch: decoded %d, reported %d", tickCount, reportedTicks)
	}
	if positionCount != reportedPositions {
		return nil, fmt.Errorf("position_count mismatch: decoded %d, reported %d", positionCount, reportedPositions)
	}
	if uint64(encodedBytes) != reportedBytes {
		return nil, fmt.Errorf("encoded_bytes mismatch: decoded %d, reported %d", encodedBytes, reportedBytes)
	}
	if value, ok := payload.fields["current_chunk_ticks"]; ok {
		count, err := valueUint(value, "current_chunk_ticks")
		if err != nil {
			return nil, err
		}
		expected := uint64(lastChunkTicks)
		if len(chunks) == 0 {
			expected = 0
		}
		if count != expected {
			return nil, fmt.Errorf("current_chunk_ticks mismatch: decoded %d, reported %d", expected, count)
		}
	}
	return result, nil
}

func decodeChunk(ctx context.Context, chunk string, guids []guid.GUID, result *[]messages.Message, positionCount *uint64) (int, error) {
	if !strings.HasSuffix(chunk, ";") {
		return 0, fmt.Errorf("unterminated trailing tick")
	}
	parts := strings.Split(chunk, ";")
	parts = parts[:len(parts)-1]
	if len(parts) < 1 || len(parts) > maxTicksPerChunk {
		return 0, fmt.Errorf("contains %d ticks, want 1 through %d", len(parts), maxTicksPerChunk)
	}
	for tickIndex, tick := range parts {
		if err := ctx.Err(); err != nil {
			return 0, err
		}
		first := strings.IndexByte(tick, ':')
		if first <= 0 {
			return 0, fmt.Errorf("tick %d: missing epoch separator", tickIndex+1)
		}
		secondRelative := strings.IndexByte(tick[first+1:], ':')
		if secondRelative < 0 {
			return 0, fmt.Errorf("tick %d: missing map separator", tickIndex+1)
		}
		second := first + 1 + secondRelative
		epoch, err := decodeBase36(tick[:first])
		if err != nil || epoch == 0 || epoch > 1<<53-1 {
			return 0, fmt.Errorf("tick %d: invalid epoch %q", tickIndex+1, tick[:first])
		}
		mapText := tick[first+1 : second]
		if len(mapText) != 3 {
			return 0, fmt.Errorf("tick %d: map ID width is %d, want 3", tickIndex+1, len(mapText))
		}
		mapID, err := decodeBase36(mapText)
		if err != nil || mapID > 46655 {
			return 0, fmt.Errorf("tick %d: invalid map ID %q", tickIndex+1, mapText)
		}
		records := tick[second+1:]
		if len(records) == 0 || len(records)%8 != 0 || len(records)/8 > maxPositionsPerTick {
			return 0, fmt.Errorf("tick %d: invalid position record length %d", tickIndex+1, len(records))
		}
		seenIndexes := make(map[uint64]struct{}, len(records)/8)
		for offset := 0; offset < len(records); offset += 8 {
			record := records[offset : offset+8]
			index, indexErr := decodeBase36(record[:2])
			x, xErr := decodeBase36(record[2:5])
			y, yErr := decodeBase36(record[5:])
			if indexErr != nil {
				return 0, fmt.Errorf("tick %d position %d: invalid GUID index", tickIndex+1, offset/8+1)
			}
			if index >= uint64(len(guids)) {
				return 0, fmt.Errorf("tick %d position %d: GUID index %d out of range", tickIndex+1, offset/8+1, index)
			}
			if _, duplicate := seenIndexes[index]; duplicate {
				return 0, fmt.Errorf("tick %d: duplicate GUID index %d", tickIndex+1, index)
			}
			seenIndexes[index] = struct{}{}
			if xErr != nil || x > 10000 {
				return 0, fmt.Errorf("tick %d position %d: invalid x coordinate", tickIndex+1, offset/8+1)
			}
			if yErr != nil || y > 10000 {
				return 0, fmt.Errorf("tick %d position %d: invalid y coordinate", tickIndex+1, offset/8+1)
			}
			*result = append(*result, &messages.UnitPosition{MessageBase: messages.Base(time.UnixMilli(int64(epoch)), messages.WithSynthetic()), Unit: guids[index], X: float64(x) / 10000, Y: float64(y) / 10000, MapID: int32(mapID)})
			*positionCount++
		}
	}
	return len(parts), nil
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
