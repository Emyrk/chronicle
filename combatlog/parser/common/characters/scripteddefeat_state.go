package characters

import (
	"encoding/json"
	"fmt"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"maps"
	"time"
)

const ScriptedDefeatDetectorStateType = "characters.ScriptedDefeatDetector"
const ScriptedDefeatDetectorStateVersion uint32 = 1

type ScriptedDefeatDetectorState struct{ value scriptedDefeatValue }
type scriptedDefeatValue struct {
	ID                     guid.GUID           `json:"id"`
	PositiveOverkill       bool                `json:"positive_overkill"`
	Evade                  bool                `json:"evade"`
	EvadeWindow            time.Duration       `json:"evade_window"`
	DistinctAuras          int                 `json:"distinct_auras"`
	BurstWindow            time.Duration       `json:"burst_window"`
	DamageWindow           time.Duration       `json:"damage_window"`
	HasParticipantCallback bool                `json:"has_participant_callback"`
	Active                 bool                `json:"active"`
	LastIncomingDamage     time.Time           `json:"last_incoming_damage"`
	PendingEvade           time.Time           `json:"pending_evade"`
	CleanupBurstStart      time.Time           `json:"cleanup_burst_start"`
	CleanupAuras           map[string]struct{} `json:"cleanup_auras"`
}

func (d *ScriptedDefeatDetector) CaptureState() (ScriptedDefeatDetectorState, error) {
	if d == nil {
		return ScriptedDefeatDetectorState{}, fmt.Errorf("nil scripted defeat detector")
	}
	c := d.config
	return ScriptedDefeatDetectorState{scriptedDefeatValue{
		ID: d.id, PositiveOverkill: c.PositiveOverkill, Evade: c.Evade, EvadeWindow: c.EvadeConfirmationWindow, DistinctAuras: c.AuraCleanup.DistinctAuras, BurstWindow: c.AuraCleanup.BurstWindow, DamageWindow: c.AuraCleanup.DamageWindow, HasParticipantCallback: c.AuraCleanup.NoKnownParticipantsAlive != nil,
		Active: d.active, LastIncomingDamage: d.lastIncomingDamage, PendingEvade: d.pendingEvade, CleanupBurstStart: d.cleanupBurstStart, CleanupAuras: maps.Clone(d.cleanupAuras),
	}}, nil
}
func (s ScriptedDefeatDetectorState) Encode() ([]byte, error) { return json.Marshal(s.value) }
func DecodeScriptedDefeatDetectorState(version uint32, payload []byte) (ScriptedDefeatDetectorState, error) {
	if version != ScriptedDefeatDetectorStateVersion {
		return ScriptedDefeatDetectorState{}, fmt.Errorf("unsupported scripted defeat version")
	}
	var v scriptedDefeatValue
	if e := decodeCharacterValue(payload, &v); e != nil {
		return ScriptedDefeatDetectorState{}, e
	}
	return ScriptedDefeatDetectorState{v}, nil
}

// RestoreState injects but never invokes the trusted participant callback. Its
// identity belongs to the parse fingerprint, not the persisted representation.
func (d *ScriptedDefeatDetector) RestoreState(s ScriptedDefeatDetectorState, noParticipants func() bool) error {
	if d == nil || s.value.HasParticipantCallback != (noParticipants != nil) {
		return fmt.Errorf("missing detector or callback presence mismatch")
	}
	v := s.value
	*d = ScriptedDefeatDetector{id: v.ID, config: ScriptedDefeatConfig{PositiveOverkill: v.PositiveOverkill, Evade: v.Evade, EvadeConfirmationWindow: v.EvadeWindow, AuraCleanup: AuraCleanupDefeatConfig{DistinctAuras: v.DistinctAuras, BurstWindow: v.BurstWindow, DamageWindow: v.DamageWindow, NoKnownParticipantsAlive: noParticipants}}, active: v.Active, lastIncomingDamage: v.LastIncomingDamage, pendingEvade: v.PendingEvade, cleanupBurstStart: v.CleanupBurstStart, cleanupAuras: maps.Clone(v.CleanupAuras)}
	return nil
}

const ScriptedDefeatCharacterStateType = "characters.ScriptedDefeatCharacter"
const ScriptedDefeatCharacterStateVersion uint32 = 1

type ScriptedDefeatCharacterState struct{ value scriptedDefeatCharacterValue }
type scriptedDefeatCharacterValue struct {
	Character string `json:"character"`
	Detector  string `json:"detector"`
}

func InitScriptedDefeatCharacter() *scriptedDefeatCharacter { return new(scriptedDefeatCharacter) }
func (c *scriptedDefeatCharacter) CaptureState(character func(Character) (string, error), detector func(*ScriptedDefeatDetector) (string, error)) (ScriptedDefeatCharacterState, error) {
	if c == nil || nilReference(c.Character) || c.defeat == nil || character == nil || detector == nil {
		return ScriptedDefeatCharacterState{}, fmt.Errorf("missing scripted defeat dependencies")
	}
	ch, e := character(c.Character)
	if e != nil {
		return ScriptedDefeatCharacterState{}, e
	}
	d, e := detector(c.defeat)
	if e != nil {
		return ScriptedDefeatCharacterState{}, e
	}
	if ch == "" || d == "" {
		return ScriptedDefeatCharacterState{}, fmt.Errorf("empty scripted defeat references")
	}
	return ScriptedDefeatCharacterState{scriptedDefeatCharacterValue{ch, d}}, nil
}
func (s ScriptedDefeatCharacterState) Encode() ([]byte, error) { return json.Marshal(s.value) }
func DecodeScriptedDefeatCharacterState(version uint32, payload []byte) (ScriptedDefeatCharacterState, error) {
	if version != ScriptedDefeatCharacterStateVersion {
		return ScriptedDefeatCharacterState{}, fmt.Errorf("unsupported scripted defeat character version")
	}
	var v scriptedDefeatCharacterValue
	if e := decodeCharacterValue(payload, &v); e != nil {
		return ScriptedDefeatCharacterState{}, e
	}
	if v.Character == "" || v.Detector == "" {
		return ScriptedDefeatCharacterState{}, fmt.Errorf("empty scripted defeat references")
	}
	return ScriptedDefeatCharacterState{v}, nil
}
func (c *scriptedDefeatCharacter) RestoreState(s ScriptedDefeatCharacterState, character func(string) (Character, error), detector func(string) (*ScriptedDefeatDetector, error)) error {
	if c == nil || character == nil || detector == nil || s.value.Character == "" || s.value.Detector == "" {
		return fmt.Errorf("missing scripted defeat destination/dependencies")
	}
	ch, e := character(s.value.Character)
	if e != nil {
		return e
	}
	if nilReference(ch) {
		return fmt.Errorf("nil character")
	}
	d, e := detector(s.value.Detector)
	if e != nil {
		return e
	}
	if d == nil {
		return fmt.Errorf("nil detector")
	}
	*c = scriptedDefeatCharacter{Character: ch, defeat: d}
	return nil
}
