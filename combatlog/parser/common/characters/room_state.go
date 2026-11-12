package characters

import (
	"encoding/json"
	"fmt"
	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"maps"
	"slices"
	"time"
)

const RoomStateVersion uint32 = 1
const RoomStateType = "characters.Room"

type RoomState struct{ value roomValue }
type roomValue struct {
	BossEntry uint32               `json:"boss_entry"`
	Units     map[guid.GUID]string `json:"units"`
	Boss      string               `json:"boss"`
	Done      bool                 `json:"done"`
}

func (r *Room) CaptureState(capture func(*RoomMechanic) (string, error)) (RoomState, error) {
	if r == nil {
		return RoomState{}, fmt.Errorf("nil room")
	}
	v := roomValue{BossEntry: r.bossEntry, Done: r.done}
	if r.Units != nil {
		v.Units = make(map[guid.GUID]string, len(r.Units))
	}
	ref := func(c *RoomMechanic) (string, error) {
		if c == nil || capture == nil {
			return "", fmt.Errorf("missing room member/capture")
		}
		s, e := capture(c)
		if e != nil {
			return "", e
		}
		if s == "" {
			return "", fmt.Errorf("empty room member reference")
		}
		return s, nil
	}
	for _, id := range slices.Sorted(maps.Keys(r.Units)) {
		c := r.Units[id]
		s, e := ref(c)
		if e != nil {
			return RoomState{}, e
		}
		v.Units[id] = s
	}
	if r.boss != nil {
		s, e := ref(r.boss)
		if e != nil {
			return RoomState{}, e
		}
		v.Boss = s
	}
	return RoomState{v}, nil
}
func (s RoomState) Encode() ([]byte, error) { return json.Marshal(s.value) }
func DecodeRoomState(version uint32, payload []byte) (RoomState, error) {
	if version != RoomStateVersion {
		return RoomState{}, fmt.Errorf("unsupported room version")
	}
	var v roomValue
	if e := decodeCharacterValue(payload, &v); e != nil {
		return RoomState{}, e
	}
	for _, ref := range v.Units {
		if ref == "" {
			return RoomState{}, fmt.Errorf("empty room member reference")
		}
	}
	return RoomState{v}, nil
}

// RestoreState does not call Add: the boss can remain aliased even after it was
// removed from Units. Resolve against preallocated canonical owners to allow cycles.
func (r *Room) RestoreState(s RoomState, resolve func(string) (*RoomMechanic, error)) error {
	if r == nil {
		return fmt.Errorf("nil room destination")
	}
	ref := func(id string) (*RoomMechanic, error) {
		if id == "" || resolve == nil {
			return nil, fmt.Errorf("missing room reference/resolver")
		}
		c, e := resolve(id)
		if e != nil {
			return nil, e
		}
		if c == nil {
			return nil, fmt.Errorf("nil room member")
		}
		return c, nil
	}
	var units map[guid.GUID]*RoomMechanic
	if s.value.Units != nil {
		units = make(map[guid.GUID]*RoomMechanic, len(s.value.Units))
	}
	for id, key := range s.value.Units {
		c, e := ref(key)
		if e != nil {
			return e
		}
		units[id] = c
	}
	var boss *RoomMechanic
	if s.value.Boss != "" {
		c, e := ref(s.value.Boss)
		if e != nil {
			return e
		}
		boss = c
	}
	*r = Room{bossEntry: s.value.BossEntry, Units: units, boss: boss, done: s.value.Done}
	return nil
}

const RoomMechanicStateVersion uint32 = 1
const RoomMechanicStateType = "characters.RoomMechanic"

type RoomMechanicState struct{ value roomMechanicValue }
type roomMechanicValue struct {
	Common             string        `json:"common"`
	Room               string        `json:"room"`
	BossEntry          uint32        `json:"boss_entry"`
	Entry              uint32        `json:"entry"`
	PendingDeath       string        `json:"pending_death"`
	PendingDeathWindow time.Duration `json:"pending_death_window"`
	Key                string        `json:"key"`
}

func (c *RoomMechanic) CaptureState(common func(*Common) (string, error), room func(*Room) (string, error), message func(messages.Message) (string, error)) (RoomMechanicState, error) {
	if c == nil || c.Common == nil || c.all == nil || c.room == nil || common == nil || room == nil {
		return RoomMechanicState{}, fmt.Errorf("missing room mechanic dependencies")
	}
	v := roomMechanicValue{BossEntry: c.bossEntry, Entry: c.entry, PendingDeathWindow: c.pendingDeathWindow, Key: c.key}
	var e error
	v.Common, e = common(c.Common)
	if e != nil {
		return RoomMechanicState{}, e
	}
	v.Room, e = room(c.room)
	if e != nil {
		return RoomMechanicState{}, e
	}
	if v.Common == "" || v.Room == "" {
		return RoomMechanicState{}, fmt.Errorf("empty room mechanic dependency")
	}
	if c.pendingDeath != nil {
		if nilReference(*c.pendingDeath) || message == nil {
			return RoomMechanicState{}, fmt.Errorf("missing pending death/capture")
		}
		v.PendingDeath, e = message(*c.pendingDeath)
		if e != nil {
			return RoomMechanicState{}, e
		}
		if v.PendingDeath == "" {
			return RoomMechanicState{}, fmt.Errorf("empty pending death reference")
		}
	}
	return RoomMechanicState{v}, nil
}
func (s RoomMechanicState) Encode() ([]byte, error) { return json.Marshal(s.value) }
func DecodeRoomMechanicState(version uint32, payload []byte) (RoomMechanicState, error) {
	if version != RoomMechanicStateVersion {
		return RoomMechanicState{}, fmt.Errorf("unsupported room mechanic version")
	}
	var v roomMechanicValue
	if e := decodeCharacterValue(payload, &v); e != nil {
		return RoomMechanicState{}, e
	}
	if v.Common == "" || v.Room == "" {
		return RoomMechanicState{}, fmt.Errorf("empty room mechanic dependency")
	}
	return RoomMechanicState{v}, nil
}

// RestoreState never registers membership, changes sharedState, or processes a
// pending death. The retained message is canonical; the interface cell is local.
func (c *RoomMechanic) RestoreState(s RoomMechanicState, all *Characters, common func(string) (*Common, error), room func(string) (*Room, error), message func(string) (messages.Message, error)) error {
	if c == nil || all == nil || common == nil || room == nil || s.value.Common == "" || s.value.Room == "" {
		return fmt.Errorf("missing room mechanic destination/dependencies")
	}
	base, e := common(s.value.Common)
	if e != nil {
		return e
	}
	if base == nil {
		return fmt.Errorf("nil common")
	}
	r, e := room(s.value.Room)
	if e != nil {
		return e
	}
	if r == nil {
		return fmt.Errorf("nil room")
	}
	var pending *messages.Message
	if s.value.PendingDeath != "" {
		if message == nil {
			return fmt.Errorf("missing message resolver")
		}
		m, e := message(s.value.PendingDeath)
		if e != nil {
			return e
		}
		if nilReference(m) {
			return fmt.Errorf("nil pending death")
		}
		pending = &m
	}
	*c = RoomMechanic{Common: base, all: all, bossEntry: s.value.BossEntry, entry: s.value.Entry, pendingDeath: pending, pendingDeathWindow: s.value.PendingDeathWindow, room: r, key: s.value.Key}
	return nil
}
