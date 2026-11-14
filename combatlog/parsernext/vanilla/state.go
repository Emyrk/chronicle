package vanilla

import (
	"context"
	"fmt"
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/common/parseerrors"
	"github.com/Emyrk/chronicle/combatlog/parser/types/gameversions"
	"github.com/Emyrk/chronicle/combatlog/parsernext/formats/ccv2"
)

// AcceptTimestamp is the legacy per-record clock transition. Headers reuse the
// prior timestamp; their UTC fallback is only for emitted messages. Backward
// jumps of exactly one second are accepted. Call before semantic decoding, even
// for unsupported records: legacy parsing advances the clock before dispatch.
func AcceptTimestamp(last, timestamp time.Time, event string) (time.Time, error) {
	if event == "HEADER" {
		timestamp = last
	}
	if !last.IsZero() && timestamp.Before(last.Add(-time.Second)) {
		return last, parseerrors.AsFatalError(fmt.Errorf("log dates went backwards: last %v, current %v", last, timestamp))
	}
	return timestamp, nil
}

// HeaderState owns only the per-source clock and last valid companion version.
// It makes no claims about observed metadata/telemetry capabilities.
type HeaderState struct {
	lastTimestamp time.Time
	version       *gameversions.GameVersion
}

func (s *HeaderState) LastTimestamp() time.Time { return s.lastTimestamp }

// Version returns a copy of the version envelope; semver versions are immutable.
func (s *HeaderState) Version() (gameversions.GameVersion, bool) {
	if s.version == nil {
		return gameversions.GameVersion{}, false
	}
	return *s.version, true
}
func (s *HeaderState) ApplyHeader(result HeaderResult) {
	if result.Version != nil {
		value := *result.Version
		s.version = &value
	}
}

// Decoder owns semantic clock/header state independently of source framing.
// A fresh instance matches a fresh legacy parser. Reusing it explicitly retains
// continuity across input boundaries; completing ReadFile does not reset or
// finalize this state. Reader errors and provisional output remain the caller
// responsibility. This is not a full-log parser or a session finalizer.
type Decoder struct {
	spells           SpellLookup
	chronicleVersion string
	state            HeaderState
}

// NewDecoder accepts only read-only lookup/build-version dependencies.
func NewDecoder(spells SpellLookup, chronicleVersion string) *Decoder {
	return &Decoder{spells: spells, chronicleVersion: chronicleVersion}
}

// State returns a copy; updating it cannot change the decoder's state.
func (d *Decoder) State() HeaderState { return d.state }
func (d *Decoder) DecodeRecord(ctx context.Context, content string) ([]messages.Message, error) {
	ts, event, fields, err := ccv2.ParseLine(content)
	if err != nil {
		return nil, err
	}
	ts, err = AcceptTimestamp(d.state.lastTimestamp, ts, event)
	if err != nil {
		return nil, err
	}
	d.state.lastTimestamp = ts
	if event == "HEADER" {
		result, err := DecodeHeader(ts, &recordFields{fields: fields}, d.chronicleVersion)
		if err != nil {
			return nil, err
		}
		d.state.ApplyHeader(result)
		return result.Messages, nil
	}
	return decodeFields(ctx, d.spells, ts, event, fields)
}
