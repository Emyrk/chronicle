package creatures

import (
	"encoding/json"
	"fmt"
	"github.com/Emyrk/chronicle/combatlog/parser/common/characters"
)

const KelThuzadStateType = "vanilla.KelThuzad"
const KelThuzadStateVersion uint32 = 1

type KelThuzadState struct{ value kelThuzadValue }
type kelThuzadValue struct {
	PermanentDeath string `json:"permanent_death"`
	Room           string `json:"room"`
	P2Emitted      bool   `json:"p2_emitted"`
}

func InitKelThuzad() *kelThuzad { return new(kelThuzad) }
func (c *kelThuzad) CaptureState(permanent func(*characters.PermanentDeath) (string, error), room func(*characters.RoomMechanic) (string, error)) (KelThuzadState, error) {
	if c == nil || c.PermanentDeath == nil || c.room == nil || c.all == nil || permanent == nil || room == nil {
		return KelThuzadState{}, fmt.Errorf("missing KelThuzad dependencies")
	}
	p, e := permanent(c.PermanentDeath)
	if e != nil {
		return KelThuzadState{}, e
	}
	r, e := room(c.room)
	if e != nil {
		return KelThuzadState{}, e
	}
	if p == "" || r == "" {
		return KelThuzadState{}, fmt.Errorf("empty KelThuzad references")
	}
	return KelThuzadState{kelThuzadValue{p, r, c.p2Emitted}}, nil
}
func (s KelThuzadState) Encode() ([]byte, error) { return json.Marshal(s.value) }
func DecodeKelThuzadState(version uint32, payload []byte) (KelThuzadState, error) {
	if version != KelThuzadStateVersion {
		return KelThuzadState{}, fmt.Errorf("unsupported KelThuzad version")
	}
	var v kelThuzadValue
	if e := decodeCreatureValue(payload, &v); e != nil {
		return KelThuzadState{}, e
	}
	if v.PermanentDeath == "" || v.Room == "" {
		return KelThuzadState{}, fmt.Errorf("empty KelThuzad references")
	}
	return KelThuzadState{v}, nil
}

// RestoreState never replays NewKelThuzadRoom or emits a phase transition.
func (c *kelThuzad) RestoreState(s KelThuzadState, all *characters.Characters, permanent func(string) (*characters.PermanentDeath, error), room func(string) (*characters.RoomMechanic, error)) error {
	if c == nil || all == nil || permanent == nil || room == nil || s.value.PermanentDeath == "" || s.value.Room == "" {
		return fmt.Errorf("missing KelThuzad destination/dependencies")
	}
	p, e := permanent(s.value.PermanentDeath)
	if e != nil {
		return e
	}
	if p == nil {
		return fmt.Errorf("nil permanent death")
	}
	r, e := room(s.value.Room)
	if e != nil {
		return e
	}
	if r == nil {
		return fmt.Errorf("nil room mechanic")
	}
	*c = kelThuzad{PermanentDeath: p, room: r, all: all, p2Emitted: s.value.P2Emitted}
	return nil
}
