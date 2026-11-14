package synthetic

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"sort"
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/types"
	"github.com/Emyrk/chronicle/database/gamedb/chrondbc"
)

const AbsorptionStateType = "synthetic.Absorption"
const AbsorptionStateVersion uint32 = 1

// AbsorptionState preserves target-local insertion order and every shield field.
// Spells are direct references to the SAME derivable nodes used by Damage; this
// codec owns no spell registry or resolver context. Logger is runtime-only.
type AbsorptionState struct{ shields map[guid.GUID][]shieldValue }
type shieldValue struct {
	SpellPath  string       `json:"spell_path"`
	SpellName  string       `json:"spell_name"`
	AppliedAt  time.Time    `json:"applied_at"`
	RemovedAt  time.Time    `json:"removed_at"`
	DurationMS int32        `json:"duration_ms"`
	Caster     guid.GUID    `json:"caster"`
	Remaining  int32        `json:"remaining"`
	SchoolMask types.School `json:"school_mask"`
	Exhausted  bool         `json:"exhausted"`
}

func (a *Absorption) CaptureState(capture func(*chrondbc.Spell) (string, error)) (AbsorptionState, error) {
	s := AbsorptionState{}
	if a.activeShields == nil {
		return s, nil
	}
	s.shields = make(map[guid.GUID][]shieldValue, len(a.activeShields))
	targets := make([]guid.GUID, 0, len(a.activeShields))
	for target := range a.activeShields {
		targets = append(targets, target)
	}
	sort.Slice(targets, func(i, j int) bool { return targets[i] < targets[j] })
	for _, target := range targets {
		shields := a.activeShields[target]
		var values []shieldValue
		if shields != nil {
			values = make([]shieldValue, len(shields))
		}
		for i, shield := range shields {
			if shield == nil {
				return AbsorptionState{}, fmt.Errorf("nil active shield")
			}
			var p string
			if shield.spell != nil {
				if capture == nil {
					return AbsorptionState{}, fmt.Errorf("missing shield spell capture")
				}
				var err error
				p, err = capture(shield.spell)
				if err != nil {
					return AbsorptionState{}, err
				}
				if p == "" {
					return AbsorptionState{}, fmt.Errorf("empty shield spell reference")
				}
			}
			values[i] = shieldValue{SpellPath: p, SpellName: shield.spellName, AppliedAt: shield.appliedAt, RemovedAt: shield.removedAt, DurationMS: shield.durationMS, Caster: shield.caster, Remaining: shield.estRemaining, SchoolMask: shield.schoolMask, Exhausted: shield.exhausted}
		}
		s.shields[target] = values
	}
	return s, nil
}
func (s AbsorptionState) Encode() ([]byte, error) {
	return json.Marshal(struct {
		Shields map[guid.GUID][]shieldValue `json:"shields"`
	}{s.shields})
}
func DecodeAbsorptionState(version uint32, payload []byte) (AbsorptionState, error) {
	if version != AbsorptionStateVersion {
		return AbsorptionState{}, fmt.Errorf("unsupported absorption version %d", version)
	}
	var root struct {
		Shields json.RawMessage `json:"shields"`
	}
	d := json.NewDecoder(bytes.NewReader(payload))
	d.DisallowUnknownFields()
	if err := d.Decode(&root); err != nil {
		return AbsorptionState{}, err
	}
	if err := d.Decode(new(any)); err != io.EOF {
		return AbsorptionState{}, fmt.Errorf("trailing absorption state")
	}
	if len(root.Shields) == 0 {
		return AbsorptionState{}, fmt.Errorf("missing shields")
	}
	var raw map[guid.GUID][]json.RawMessage
	if err := json.Unmarshal(root.Shields, &raw); err != nil {
		return AbsorptionState{}, err
	}
	s := AbsorptionState{}
	if raw != nil {
		s.shields = make(map[guid.GUID][]shieldValue, len(raw))
	}
	for target, entries := range raw {
		var values []shieldValue
		if entries != nil {
			values = make([]shieldValue, len(entries))
		}
		for i, entry := range entries {
			var fields map[string]json.RawMessage
			if err := json.Unmarshal(entry, &fields); err != nil {
				return AbsorptionState{}, err
			}
			for _, key := range []string{"spell_path", "spell_name", "applied_at", "removed_at", "duration_ms", "caster", "remaining", "school_mask", "exhausted"} {
				v, ok := fields[key]
				if !ok || bytes.Equal(bytes.TrimSpace(v), []byte("null")) {
					return AbsorptionState{}, fmt.Errorf("missing or null shield field %s", key)
				}
			}
			decoder := json.NewDecoder(bytes.NewReader(entry))
			decoder.DisallowUnknownFields()
			if err := decoder.Decode(&values[i]); err != nil {
				return AbsorptionState{}, err
			}
		}
		s.shields[target] = values
	}
	return s, nil
}
func (s AbsorptionState) Restore(logger *slog.Logger, resolve func(string) (*chrondbc.Spell, error)) (*Absorption, error) {
	a := NewAbsorption(logger)
	for target, values := range s.shields {
		var shields []*activeShield
		if values != nil {
			shields = make([]*activeShield, len(values))
		}
		for i, v := range values {
			var spell *chrondbc.Spell
			if v.SpellPath != "" {
				if resolve == nil {
					return nil, fmt.Errorf("missing shield spell resolver")
				}
				var err error
				spell, err = resolve(v.SpellPath)
				if err != nil {
					return nil, err
				}
				if spell == nil {
					return nil, fmt.Errorf("nil resolved shield spell")
				}
			}
			shields[i] = &activeShield{spell: spell, spellName: v.SpellName, appliedAt: v.AppliedAt, removedAt: v.RemovedAt, durationMS: v.DurationMS, caster: v.Caster, estRemaining: v.Remaining, schoolMask: v.SchoolMask, exhausted: v.Exhausted}
		}
		a.activeShields[target] = shields
	}
	return a, nil
}
