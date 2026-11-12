package armory

import (
	"bytes"
	"encoding/json"
	"fmt"
	"github.com/Emyrk/chronicle/combatlog/parser/common/unitdb"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/types/combatant"
	"io"
	"maps"
)

const StateType = "armory.Tracker"
const StateVersion uint32 = 1

// State owns detached per-instance observations, never a second current-player
// cache. Units remains one externally resolved canonical dependency.
type State struct{ value stateValue }
type pendingTalentValue struct {
	Name    string             `json:"name"`
	Talents *combatant.Talents `json:"talents"`
}
type stateValue struct {
	Guilds                 map[string]map[guid.GUID]struct{} `json:"guilds"`
	Participant            map[guid.GUID]struct{}            `json:"participant"`
	PlayerObservations     map[guid.GUID]combatant.Combatant `json:"player_observations"`
	ByName                 map[string]guid.GUID              `json:"by_name"`
	PendingTalents         map[guid.GUID]pendingTalentValue  `json:"pending_talents"`
	InvalidatedTalents     map[guid.GUID]struct{}            `json:"invalidated_talents"`
	ObservedRespecAura     map[guid.GUID]struct{}            `json:"observed_respec_aura"`
	InvalidatedTalentBuild map[guid.GUID]*combatant.Talents  `json:"invalidated_talent_build"`
	PlayerLevel            map[guid.GUID]int32               `json:"player_level"`
}

func (v stateValue) validate() error {
	if v.Guilds == nil || v.Participant == nil || v.PlayerObservations == nil || v.ByName == nil || v.PendingTalents == nil || v.InvalidatedTalents == nil || v.ObservedRespecAura == nil || v.InvalidatedTalentBuild == nil || v.PlayerLevel == nil {
		return fmt.Errorf("armory maps must be initialized")
	}
	for _, members := range v.Guilds {
		if members == nil {
			return fmt.Errorf("nil guild membership set")
		}
	}
	return nil
}
func (v stateValue) clone() stateValue {
	v.Guilds = maps.Clone(v.Guilds)
	for name, members := range v.Guilds {
		v.Guilds[name] = maps.Clone(members)
	}
	v.Participant = maps.Clone(v.Participant)
	v.PlayerObservations = maps.Clone(v.PlayerObservations)
	for id, p := range v.PlayerObservations {
		v.PlayerObservations[id] = p.Clone()
	}
	v.ByName = maps.Clone(v.ByName)
	v.PendingTalents = maps.Clone(v.PendingTalents)
	for id, p := range v.PendingTalents {
		p.Talents = combatant.CloneTalents(p.Talents)
		v.PendingTalents[id] = p
	}
	v.InvalidatedTalents = maps.Clone(v.InvalidatedTalents)
	v.ObservedRespecAura = maps.Clone(v.ObservedRespecAura)
	v.InvalidatedTalentBuild = maps.Clone(v.InvalidatedTalentBuild)
	for id, t := range v.InvalidatedTalentBuild {
		v.InvalidatedTalentBuild[id] = combatant.CloneTalents(t)
	}
	v.PlayerLevel = maps.Clone(v.PlayerLevel)
	return v
}
func (t *Tracker) CaptureState() (State, error) {
	if t == nil || t.units == nil || t.PendingTalents == nil {
		return State{}, fmt.Errorf("missing armory owner/Units or pending talents map")
	}
	pending := make(map[guid.GUID]pendingTalentValue, len(t.PendingTalents))
	for id, p := range t.PendingTalents {
		pending[id] = pendingTalentValue{p.name, p.talents}
	}
	v := stateValue{t.Guilds, t.Participant, t.PlayerObservations, t.ByName, pending, t.InvalidatedTalents, t.observedRespecAura, t.invalidatedTalentBuild, t.PlayerLevel}
	if e := v.validate(); e != nil {
		return State{}, e
	}
	return State{v.clone()}, nil
}
func (s State) Encode() ([]byte, error) { return json.Marshal(s.value) }
func DecodeState(version uint32, payload []byte) (State, error) {
	if version != StateVersion {
		return State{}, fmt.Errorf("unsupported armory version")
	}
	var v stateValue
	if e := decodeArmoryValue(payload, &v); e != nil {
		return State{}, e
	}
	if e := v.validate(); e != nil {
		return State{}, e
	}
	return State{v}, nil
}

// RestoreState assigns owned state only after validation and cloning. It does not
// query or modify Units, replay metadata observations, register hooks, or fetch
// database/talent data. Historical values stay detached from current Units and
// from the reusable snapshot, including nil/empty nested talent/gear slices.
func (t *Tracker) RestoreState(s State, units *unitdb.Units) error {
	if t == nil || units == nil {
		return fmt.Errorf("missing armory destination/Units")
	}
	if e := s.value.validate(); e != nil {
		return e
	}
	v := s.value.clone()
	pending := make(map[guid.GUID]pendingTalent, len(v.PendingTalents))
	for id, p := range v.PendingTalents {
		pending[id] = pendingTalent{p.Name, p.Talents}
	}
	*t = Tracker{units: units, Guilds: v.Guilds, Participant: v.Participant, PlayerObservations: v.PlayerObservations, ByName: v.ByName, PendingTalents: pending, InvalidatedTalents: v.InvalidatedTalents, observedRespecAura: v.ObservedRespecAura, invalidatedTalentBuild: v.InvalidatedTalentBuild, PlayerLevel: v.PlayerLevel}
	return nil
}

// Strict shape validation rejects missing, duplicate and unknown fields at all
// depths without reflecting over or serializing live owner identities.
func decodeArmoryValue(payload []byte, value any) error {
	d := json.NewDecoder(bytes.NewReader(payload))
	d.DisallowUnknownFields()
	if err := d.Decode(value); err != nil {
		return err
	}
	if err := d.Decode(new(any)); err != io.EOF {
		return fmt.Errorf("trailing armory state")
	}
	expected, err := json.Marshal(value)
	if err != nil {
		return err
	}
	a, err := armoryJSON(payload)
	if err != nil {
		return err
	}
	b, err := armoryJSON(expected)
	if err != nil {
		return err
	}
	if !bytes.Equal(a, b) {
		return fmt.Errorf("incomplete armory state")
	}
	return nil
}
func armoryJSON(payload []byte) ([]byte, error) {
	d := json.NewDecoder(bytes.NewReader(payload))
	d.UseNumber()
	var read func() (any, error)
	read = func() (any, error) {
		token, err := d.Token()
		if err != nil {
			return nil, err
		}
		switch token {
		case json.Delim('{'):
			v := map[string]any{}
			for d.More() {
				token, err := d.Token()
				if err != nil {
					return nil, err
				}
				key := token.(string)
				if _, ok := v[key]; ok {
					return nil, fmt.Errorf("duplicate armory field")
				}
				child, err := read()
				if err != nil {
					return nil, err
				}
				v[key] = child
			}
			_, err = d.Token()
			return v, err
		case json.Delim('['):
			v := []any{}
			for d.More() {
				child, err := read()
				if err != nil {
					return nil, err
				}
				v = append(v, child)
			}
			_, err = d.Token()
			return v, err
		default:
			return token, nil
		}
	}
	value, err := read()
	if err != nil {
		return nil, err
	}
	return json.Marshal(value)
}
