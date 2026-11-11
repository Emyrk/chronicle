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
// Observed metadata/telemetry capabilities live separately on Decoder.
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

// Decoder owns clock/header and combatant state independently of source framing.
// A fresh instance matches a fresh legacy parser. Reusing it explicitly retains
// continuity across input boundaries; completing ReadFile does not reset or
// finalize this state. Reader errors and provisional output remain the caller
// responsibility. This is not a full-log parser or a session finalizer.
type Decoder struct {
	capabilities     Capabilities
	spells           SpellLookup
	chronicleVersion string
	state            HeaderState
	combatants       CombatantState
	combatantOptions CombatantOptions
}

// NewDecoder accepts lookup/build-version dependencies and optional combatant inputs.
func NewDecoder(spells SpellLookup, chronicleVersion string, combatants ...CombatantOptions) *Decoder {
	d := &Decoder{spells: spells, chronicleVersion: chronicleVersion}
	if len(combatants) > 0 {
		d.combatantOptions = combatants[0]
	}
	return d
}

// State returns a copy of the header/clock state, not a combatant snapshot.
// Updating it cannot change the decoder's state.
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
	if event == "RG" || event == "RAID_COMPOSITION" || event == "UNIT_STATE" {
		r, err := decodeCapabilityRecord(ts, event, &recordFields{fields: fields})
		// Preserve partial resource observation even when later position fields fail.
		// Do not turn this into success-only application without a behavior decision.
		d.capabilities.RaidGroup = d.capabilities.RaidGroup || r.Observed.RaidGroup
		d.capabilities.UnitResources = d.capabilities.UnitResources || r.Observed.UnitResources
		d.capabilities.UnitPosition = d.capabilities.UnitPosition || r.Observed.UnitPosition
		return r.Messages, err
	}
	switch event {
	case "COMBATANT_INFO":
		return d.combatants.DecodeInfo(ts, &recordFields{fields: fields}, d.state.version, d.combatantOptions)
	case "COMBATANT_TRANSMOG":
		return d.combatants.DecodeTransmog(ts, &recordFields{fields: fields})
	case "COMBATANT_TALENTS":
		return d.combatants.DecodeTalents(ts, &recordFields{fields: fields}, d.combatantOptions.TalentTrees)
	}
	return decodeFields(ctx, d.spells, ts, event, fields, content)
}

func (d *Decoder) Capabilities() Capabilities { return d.capabilities }
func decodeCapabilityRecord(ts time.Time, event string, m MetadataFields) (MetadataResult, error) {
	switch event {
	case "RG":
		return DecodeRaidGroup(ts, m)
	case "RAID_COMPOSITION":
		return DecodeRaidComposition(ts, m)
	default:
		return DecodeUnitState(ts, m)
	}
}
