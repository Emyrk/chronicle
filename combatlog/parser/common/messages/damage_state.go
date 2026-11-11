package messages

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"maps"
	"slices"
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/types"
	"github.com/Emyrk/chronicle/database/gamedb/chrondbc"
)

// MessageBaseState owns private activity/marks as well as the public envelope.
// Capture and Restore detach maps, including nested mark targets. The pointer to
// marks, nil marks map, and allocated empty marks map remain distinct.
type MessageBaseState struct {
	Timestamp    time.Time                       `json:"timestamp"`
	Synthetic    bool                            `json:"synthetic"`
	Activity     map[guid.GUID]ActivityEventType `json:"activity"`
	Marks        map[MarkType]Mark               `json:"marks"`
	MarksPresent bool                            `json:"marks_present"`
}

func (b MessageBase) CaptureState() MessageBaseState {
	s := MessageBaseState{Timestamp: b.Timestamp, Synthetic: b.Synthetic, Activity: maps.Clone(b.activity)}
	if b.marks != nil {
		m := maps.Clone(map[MarkType]Mark(*b.marks))
		for key, v := range m {
			v.Targets = maps.Clone(v.Targets)
			m[key] = v
		}
		s.Marks = m
		s.MarksPresent = true
	}
	return s
}

func (s MessageBaseState) Restore() MessageBase {
	b := MessageBase{Timestamp: s.Timestamp, Synthetic: s.Synthetic, activity: maps.Clone(s.Activity)}
	if s.MarksPresent {
		m := marks(maps.Clone(s.Marks))
		for key, v := range m {
			v.Targets = maps.Clone(v.Targets)
			m[key] = v
		}
		b.marks = &m
	}
	return b
}

const DamageStateType = "messages.Damage"
const DamageStateVersion uint32 = 1

type damageValue struct {
	Base            MessageBaseState       `json:"base"`
	SpellName       *string                `json:"spell_name"`
	SpellID         chrondbc.SpellID       `json:"spell_id"`
	SpellPath       string                 `json:"spell_path"`
	Caster          *guid.GUID             `json:"caster"`
	Target          guid.GUID              `json:"target"`
	HitType         types.HitType          `json:"hit_type"`
	Amount          int32                  `json:"amount"`
	Unranked        int64                  `json:"unranked"`
	Overkill        int32                  `json:"overkill"`
	School          types.School           `json:"school"`
	Trailer         types.Trailer          `json:"trailer"`
	EnvironmentType *types.EnvironmentType `json:"environment_type"`
}

// DamageState contains owned fields and one reference to a derivable spell.
// It contains no spell payload and never mutates a live message on restore.
type DamageState struct{ value damageValue }

func cloneDamagePointer[T any](v *T) *T {
	if v == nil {
		return nil
	}
	c := *v
	return &c
}
func cloneTrailer(v types.Trailer) types.Trailer {
	v = slices.Clone(v)
	for i := range v {
		v[i].Amount = cloneDamagePointer(v[i].Amount)
	}
	return v
}

func (d *Damage) CaptureState(spellPath string) (DamageState, error) {
	if d == nil {
		return DamageState{}, fmt.Errorf("nil damage")
	}
	if (d.SpellData == nil) != (spellPath == "") {
		return DamageState{}, fmt.Errorf("damage spell reference presence mismatch")
	}
	return DamageState{value: damageValue{Base: d.MessageBase.CaptureState(), SpellName: cloneDamagePointer(d.SpellName), SpellID: d.SpellID, SpellPath: spellPath, Caster: cloneDamagePointer(d.Caster), Target: d.Target, HitType: d.HitType, Amount: d.Amount, Unranked: d.Unranked, Overkill: d.Overkill, School: d.School, Trailer: cloneTrailer(d.Trailer), EnvironmentType: cloneDamagePointer(d.EnvironmentType)}}, nil
}
func (s DamageState) Encode() ([]byte, error) { return json.Marshal(s.value) }
func (s DamageState) SpellPath() string       { return s.value.SpellPath }
func DecodeDamageState(version uint32, payload []byte) (DamageState, error) {
	if version != DamageStateVersion {
		return DamageState{}, fmt.Errorf("unsupported damage version %d", version)
	}
	var v damageValue
	d := json.NewDecoder(bytes.NewReader(payload))
	d.DisallowUnknownFields()
	if err := d.Decode(&v); err != nil {
		return DamageState{}, err
	}
	if err := d.Decode(new(any)); err != io.EOF {
		return DamageState{}, fmt.Errorf("trailing damage data")
	}
	var fields map[string]json.RawMessage
	if err := json.Unmarshal(payload, &fields); err != nil {
		return DamageState{}, err
	}
	for _, key := range []string{"base", "spell_name", "spell_id", "spell_path", "caster", "target", "hit_type", "amount", "unranked", "overkill", "school", "trailer", "environment_type"} {
		if _, ok := fields[key]; !ok {
			return DamageState{}, fmt.Errorf("missing damage field %s", key)
		}
	}
	for _, key := range []string{"base", "spell_id", "spell_path", "target", "hit_type", "amount", "unranked", "overkill", "school"} {
		if bytes.Equal(bytes.TrimSpace(fields[key]), []byte("null")) {
			return DamageState{}, fmt.Errorf("null damage field %s", key)
		}
	}
	var base map[string]json.RawMessage
	if err := json.Unmarshal(fields["base"], &base); err != nil {
		return DamageState{}, err
	}
	for _, key := range []string{"timestamp", "synthetic", "activity", "marks", "marks_present"} {
		if _, ok := base[key]; !ok {
			return DamageState{}, fmt.Errorf("missing message base field %s", key)
		}
	}
	for _, key := range []string{"timestamp", "synthetic", "marks_present"} {
		if bytes.Equal(bytes.TrimSpace(base[key]), []byte("null")) {
			return DamageState{}, fmt.Errorf("null message base field %s", key)
		}
	}
	if !v.Base.MarksPresent && v.Base.Marks != nil {
		return DamageState{}, fmt.Errorf("marks payload without marks pointer")
	}
	return DamageState{value: v}, nil
}

// Restore resolves only the declared spell reference; its caller supplies a
// validated canonical spell table. No existing message is partially modified.
func (s DamageState) Restore(resolve func(string) (*chrondbc.Spell, error)) (*Damage, error) {
	v := s.value
	var spell *chrondbc.Spell
	if v.SpellPath != "" {
		if resolve == nil {
			return nil, fmt.Errorf("missing spell resolver")
		}
		var err error
		spell, err = resolve(v.SpellPath)
		if err != nil {
			return nil, err
		}
		if spell == nil {
			return nil, fmt.Errorf("nil resolved spell")
		}
	}
	return &Damage{MessageBase: v.Base.Restore(), SpellName: cloneDamagePointer(v.SpellName), SpellID: v.SpellID, SpellData: spell, Caster: cloneDamagePointer(v.Caster), Target: v.Target, HitType: v.HitType, Amount: v.Amount, Unranked: v.Unranked, Overkill: v.Overkill, School: v.School, Trailer: cloneTrailer(v.Trailer), EnvironmentType: cloneDamagePointer(v.EnvironmentType)}, nil
}
