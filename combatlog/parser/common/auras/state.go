package auras

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"slices"
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/database/gamedb/chrondbc"
)

const TrackingStateType = "auras.Tracking"
const TrackingStateVersion uint32 = 1
const ProjectionStateType = "auras.Projection"
const ProjectionStateVersion uint32 = 1

type auraValue struct {
	Buff           bool             `json:"buff"`
	Source         *guid.GUID       `json:"source"`
	Stacks         int32            `json:"stacks"`
	AppliedAt      time.Time        `json:"applied_at"`
	LastUpdatedAt  time.Time        `json:"last_updated_at"`
	MaxExistsUntil time.Time        `json:"max_exists_until"`
	SpellID        chrondbc.SpellID `json:"spell_id"`
	SpellName      string           `json:"spell_name"`
	SpellPath      string           `json:"spell_path"`
}
type auraValues map[guid.GUID]map[chrondbc.SpellID]auraValue

// TrackingState owns only retained semantic values. Dataset duration modifiers
// and ordered observers are runtime dependencies supplied under the same fixed
// session fingerprint. Spell paths refer to the existing shared derivable graph.
type TrackingState struct{ units auraValues }
type ProjectionState struct{ value projectionValue }
type projectionValue struct {
	Pending    bool             `json:"pending"`
	Snapshot   auraValues       `json:"snapshot"`
	Projected  []projectedValue `json:"projected"`
	NextExpiry time.Time        `json:"next_expiry"`
}
type projectedValue struct {
	Unit           guid.GUID        `json:"unit"`
	SpellID        chrondbc.SpellID `json:"spell_id"`
	StoredUnit     guid.GUID        `json:"stored_unit"`
	StoredSpellID  chrondbc.SpellID `json:"stored_spell_id"`
	Source         *guid.GUID       `json:"source"`
	SpellPath      string           `json:"spell_path"`
	SpellName      string           `json:"spell_name"`
	Stacks         int32            `json:"stacks"`
	Buff           bool             `json:"buff"`
	MaxExistsUntil time.Time        `json:"max_exists_until"`
}

func captureSpell(spell *chrondbc.Spell, capture func(*chrondbc.Spell) (string, error)) (string, error) {
	if spell == nil {
		return "", nil
	}
	if capture == nil {
		return "", fmt.Errorf("missing aura spell capture")
	}
	path, err := capture(spell)
	if err != nil {
		return "", err
	}
	if path == "" {
		return "", fmt.Errorf("empty aura spell reference")
	}
	return path, nil
}
func resolveSpell(path string, resolve func(string) (*chrondbc.Spell, error)) (*chrondbc.Spell, error) {
	if path == "" {
		return nil, nil
	}
	if resolve == nil {
		return nil, fmt.Errorf("missing aura spell resolver")
	}
	spell, err := resolve(path)
	if err != nil {
		return nil, err
	}
	if spell == nil {
		return nil, fmt.Errorf("nil resolved aura spell")
	}
	return spell, nil
}
func captureAuras(units map[guid.GUID]map[chrondbc.SpellID]*AuraState, capture func(*chrondbc.Spell) (string, error)) (auraValues, error) {
	if units == nil {
		return nil, nil
	}
	out := make(auraValues, len(units))
	for _, unit := range sortedGUIDs(units) {
		entries := units[unit]
		var values map[chrondbc.SpellID]auraValue
		if entries != nil {
			values = make(map[chrondbc.SpellID]auraValue, len(entries))
		}
		for _, id := range sortedSpellIDs(entries) {
			a := entries[id]
			if a == nil {
				return nil, fmt.Errorf("nil aura state")
			}
			path, err := captureSpell(a.Spell, capture)
			if err != nil {
				return nil, err
			}
			values[id] = auraValue{a.Buff, cloneGUID(a.Source), a.Stacks, a.AppliedAt, a.LastUpdatedAt, a.MaxExistsUntil, a.SpellID, a.SpellName, path}
		}
		out[unit] = values
	}
	return out, nil
}
func restoreAuras(values auraValues, resolve func(string) (*chrondbc.Spell, error)) (map[guid.GUID]map[chrondbc.SpellID]*AuraState, error) {
	if values == nil {
		return nil, nil
	}
	out := make(map[guid.GUID]map[chrondbc.SpellID]*AuraState, len(values))
	for unit, entries := range values {
		var states map[chrondbc.SpellID]*AuraState
		if entries != nil {
			states = make(map[chrondbc.SpellID]*AuraState, len(entries))
		}
		for id, a := range entries {
			spell, err := resolveSpell(a.SpellPath, resolve)
			if err != nil {
				return nil, err
			}
			states[id] = &AuraState{a.Buff, cloneGUID(a.Source), a.Stacks, a.AppliedAt, a.LastUpdatedAt, a.MaxExistsUntil, a.SpellID, a.SpellName, spell}
		}
		out[unit] = states
	}
	return out, nil
}
func (t *Tracking) CaptureState(capture func(*chrondbc.Spell) (string, error)) (TrackingState, error) {
	if t == nil {
		return TrackingState{}, fmt.Errorf("nil tracking")
	}
	units, err := captureAuras(t.units, capture)
	return TrackingState{units}, err
}
func (s TrackingState) Encode() ([]byte, error) {
	return json.Marshal(struct {
		Units auraValues `json:"units"`
	}{s.units})
}

// Restore leaves observers empty. Re-register trusted callbacks in their original
// order (armory, then NewProjection per instance) before processing any message.
// Existing deadlines are preserved, not recomputed from the injected modifiers.
func (s TrackingState) Restore(mods *chrondbc.DurationModifierSet, resolve func(string) (*chrondbc.Spell, error)) (*Tracking, error) {
	units, err := restoreAuras(s.units, resolve)
	if err != nil {
		return nil, err
	}
	t := New(mods)
	t.units = units
	return t, nil
}
func (s ProjectionState) Encode() ([]byte, error) { return json.Marshal(s.value) }

func (p *Projection) CaptureState(capture func(*chrondbc.Spell) (string, error)) (ProjectionState, error) {
	if p == nil {
		return ProjectionState{}, fmt.Errorf("nil projection")
	}
	snapshot, err := captureAuras(p.snapshot, capture)
	if err != nil {
		return ProjectionState{}, err
	}
	v := projectionValue{Pending: p.pendingProjection, Snapshot: snapshot, NextExpiry: p.nextExpiry}
	if p.projectedAuras != nil {
		v.Projected = make([]projectedValue, 0, len(p.projectedAuras))
	}
	keys := make([]projectedAuraKey, 0, len(p.projectedAuras))
	for key := range p.projectedAuras {
		keys = append(keys, key)
	}
	slices.SortFunc(keys, func(a, b projectedAuraKey) int {
		if a.Unit < b.Unit {
			return -1
		}
		if a.Unit > b.Unit {
			return 1
		}
		if a.SpellID < b.SpellID {
			return -1
		}
		if a.SpellID > b.SpellID {
			return 1
		}
		return 0
	})
	for _, key := range keys {
		a := p.projectedAuras[key]
		if a == nil {
			return ProjectionState{}, fmt.Errorf("nil projected aura")
		}
		path, err := captureSpell(a.Spell, capture)
		if err != nil {
			return ProjectionState{}, err
		}
		v.Projected = append(v.Projected, projectedValue{key.Unit, key.SpellID, a.Key.Unit, a.Key.SpellID, cloneGUID(a.Source), path, a.SpellName, a.Stacks, a.Buff, a.MaxExistsUntil})
	}
	return ProjectionState{v}, nil
}

// Restore resolves every value before registering the new projection's observer.
// The caller supplies the same canonical restored tracker and trusted emit closure.
func (s ProjectionState) Restore(tracker *Tracking, emit func(*messages.Aura), resolve func(string) (*chrondbc.Spell, error)) (*Projection, error) {
	if tracker == nil {
		return nil, fmt.Errorf("projection requires canonical tracker")
	}
	snapshot, err := restoreAuras(s.value.Snapshot, resolve)
	if err != nil {
		return nil, err
	}
	var projected map[projectedAuraKey]*projectedAura
	if s.value.Projected != nil {
		projected = make(map[projectedAuraKey]*projectedAura, len(s.value.Projected))
	}
	for _, a := range s.value.Projected {
		key := projectedAuraKey{a.Unit, a.SpellID}
		if _, ok := projected[key]; ok {
			return nil, fmt.Errorf("duplicate projected aura")
		}
		spell, err := resolveSpell(a.SpellPath, resolve)
		if err != nil {
			return nil, err
		}
		projected[key] = &projectedAura{projectedAuraKey{a.StoredUnit, a.StoredSpellID}, cloneGUID(a.Source), spell, a.SpellName, a.Stacks, a.Buff, a.MaxExistsUntil}
	}
	p := NewProjection(tracker)
	p.SetEmit(emit)
	p.pendingProjection = s.value.Pending
	p.snapshot = snapshot
	p.projectedAuras = projected
	p.nextExpiry = s.value.NextExpiry
	return p, nil
}

func decodeJSON(payload []byte, value any) error {
	// Check duplicates at every map level before typed decoding can overwrite a
	// tracker entry. No object graph identities are inferred from JSON map keys.
	tokens := json.NewDecoder(bytes.NewReader(payload))
	if err := rejectDuplicateKeys(tokens); err != nil {
		return err
	}
	d := json.NewDecoder(bytes.NewReader(payload))
	d.DisallowUnknownFields()
	if err := d.Decode(value); err != nil {
		return err
	}
	if err := d.Decode(new(any)); err != io.EOF {
		return fmt.Errorf("trailing aura state")
	}
	return nil
}

// requiredFields enforces the complete owner schema, including explicit nulls
// only for optional pointers/maps. Nested aura payloads use the same check.
func requiredFields(payload []byte, nullable map[string]bool, names ...string) (map[string]json.RawMessage, error) {
	var fields map[string]json.RawMessage
	d := json.NewDecoder(bytes.NewReader(payload))
	token, err := d.Token()
	if err != nil {
		return nil, err
	}
	if token != json.Delim('{') {
		return nil, fmt.Errorf("aura state requires object")
	}
	fields = make(map[string]json.RawMessage)
	for d.More() {
		token, err := d.Token()
		if err != nil {
			return nil, err
		}
		key := token.(string)
		if _, exists := fields[key]; exists {
			return nil, fmt.Errorf("duplicate aura field %q", key)
		}
		var raw json.RawMessage
		if err := d.Decode(&raw); err != nil {
			return nil, err
		}
		fields[key] = raw
	}
	if _, err := d.Token(); err != nil {
		return nil, err
	}
	if len(fields) != len(names) {
		return nil, fmt.Errorf("unexpected aura field count")
	}
	for _, key := range names {
		raw, ok := fields[key]
		if !ok || (!nullable[key] && bytes.Equal(bytes.TrimSpace(raw), []byte("null"))) {
			return nil, fmt.Errorf("missing or null aura field %q", key)
		}
	}
	return fields, nil
}
func validateAuraValues(raw json.RawMessage) error {
	var units map[guid.GUID]map[chrondbc.SpellID]json.RawMessage
	if err := json.Unmarshal(raw, &units); err != nil {
		return err
	}
	for _, spells := range units {
		for _, payload := range spells {
			if _, err := requiredFields(payload, map[string]bool{"source": true}, "buff", "source", "stacks", "applied_at", "last_updated_at", "max_exists_until", "spell_id", "spell_name", "spell_path"); err != nil {
				return err
			}
		}
	}
	return nil
}
func DecodeTrackingState(version uint32, payload []byte) (TrackingState, error) {
	if version != TrackingStateVersion {
		return TrackingState{}, fmt.Errorf("unsupported tracking state version %d", version)
	}
	fields, err := requiredFields(payload, map[string]bool{"units": true}, "units")
	if err != nil {
		return TrackingState{}, err
	}
	var v struct {
		Units auraValues `json:"units"`
	}
	if err := decodeJSON(payload, &v); err != nil {
		return TrackingState{}, err
	}
	if err := validateAuraValues(fields["units"]); err != nil {
		return TrackingState{}, err
	}
	return TrackingState{v.Units}, nil
}
func DecodeProjectionState(version uint32, payload []byte) (ProjectionState, error) {
	if version != ProjectionStateVersion {
		return ProjectionState{}, fmt.Errorf("unsupported projection state version %d", version)
	}
	fields, err := requiredFields(payload, map[string]bool{"snapshot": true, "projected": true}, "pending", "snapshot", "projected", "next_expiry")
	if err != nil {
		return ProjectionState{}, err
	}
	var v projectionValue
	if err := decodeJSON(payload, &v); err != nil {
		return ProjectionState{}, err
	}
	if err := validateAuraValues(fields["snapshot"]); err != nil {
		return ProjectionState{}, err
	}
	var rows []json.RawMessage
	if err := json.Unmarshal(fields["projected"], &rows); err != nil {
		return ProjectionState{}, err
	}
	seen := make(map[projectedAuraKey]bool)
	for index, raw := range rows {
		if _, err := requiredFields(raw, map[string]bool{"source": true}, "unit", "spell_id", "stored_unit", "stored_spell_id", "source", "spell_path", "spell_name", "stacks", "buff", "max_exists_until"); err != nil {
			return ProjectionState{}, err
		}
		key := projectedAuraKey{v.Projected[index].Unit, v.Projected[index].SpellID}
		if seen[key] {
			return ProjectionState{}, fmt.Errorf("duplicate projected aura")
		}
		seen[key] = true
	}
	return ProjectionState{v}, nil
}

func rejectDuplicateKeys(d *json.Decoder) error {
	token, err := d.Token()
	if err != nil {
		return err
	}
	switch token {
	case json.Delim('{'):
		seen := make(map[string]bool)
		for d.More() {
			keyToken, err := d.Token()
			if err != nil {
				return err
			}
			key := keyToken.(string)
			if seen[key] {
				return fmt.Errorf("duplicate aura key %q", key)
			}
			seen[key] = true
			if err := rejectDuplicateKeys(d); err != nil {
				return err
			}
		}
		_, err = d.Token()
		return err
	case json.Delim('['):
		for d.More() {
			if err := rejectDuplicateKeys(d); err != nil {
				return err
			}
		}
		_, err = d.Token()
		return err
	default:
		return nil
	}
}
