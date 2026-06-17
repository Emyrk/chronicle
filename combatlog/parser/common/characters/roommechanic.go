package characters

import (
	"strconv"
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
)

type Room struct {
	bossEntry uint32
	Units     map[guid.GUID]*RoomMechanic
	boss      *RoomMechanic
	done      bool
}

func (r *Room) Close() {
	r.done = true
}

func (r *Room) Add(char *RoomMechanic) {
	r.Units[char.ID()] = char
	if entry, ok := char.ID().GetEntry(); entry == r.bossEntry && ok {
		r.boss = char
	}
}

func (r *Room) Remove(me guid.GUID) {
	delete(r.Units, me)
}

func (r *Room) StayActive(me guid.GUID) bool {
	if r.done {
		return false
	}

	if r.boss != nil && r.boss.IsActive() {
		// The boss is handling the activity, let the ad die.
		return false
	}

	want := 1
	if _, hasMe := r.Units[me]; hasMe {
		want += 1
	}

	activeCount := 0
	for _, u := range r.Units {
		if u.IsActive() {
			activeCount++
		}
	}

	//nolint:staticcheck
	if activeCount >= want {
		return false
	}

	return true
}

// RoomMechanic keeps at least 1 anchor ad alive until the boss dies.
// This allows room mechanics to have gaps.
// Ads also bump the boss activity.
type RoomMechanic struct {
	*Common
	all *Characters

	bossEntry uint32

	entry        uint32
	pendingDeath *messages.Message
	room         *Room
	key          string
}

func NewRoomMechanic(id guid.GUID, bossEntry uint32, all *Characters) (*RoomMechanic, bool) {
	key := strconv.Itoa(int(bossEntry))
	shared, ok := all.Load(key)
	if !ok {
		shared = &Room{bossEntry: bossEntry, Units: make(map[guid.GUID]*RoomMechanic)}
		all.Save(key, shared)
	}

	entry, ok := id.GetEntry()
	if !ok {
		return nil, false
	}
	room := shared.(*Room)

	r := &RoomMechanic{
		Common:       NewCommonCharacter(id, all),
		all:          all,
		bossEntry:    bossEntry,
		entry:        entry,
		pendingDeath: nil,
		room:         room,
		key:          key,
	}
	room.Add(r)

	return r, true
}

func (c *RoomMechanic) Process(m messages.Message) error {
	cur, ok := c.Activity.Current()
	if ok {
		cur.HandleTimeout(m.Date())
	}

	if err := ProcessCommonActivity(c, m); err != nil {
		return err
	}

	// Check if we are allowed to die
	c.processPendingDeath(m, false)

	return nil
}

func (c *RoomMechanic) Start(reason string, m messages.Message) {
	if c.entry != c.bossEntry && c.room != nil && c.room.boss != nil {
		// Bump the boss too if they exist
		c.room.boss.Bump(reason, m)
	}
	c.Common.Start(reason, m)
}

func (c *RoomMechanic) Bump(reason string, m messages.Message) {
	if c.entry != c.bossEntry && c.room != nil && c.room.boss != nil {
		// Bump the boss too if they exist
		c.room.boss.Bump(reason, m)
	}
	c.Common.Bump(reason, m)
}

// Died handles the death of Thekal and his zealots.
// During phase 1, deaths are "pending" - if we see activity within the
// resurrection window, the death is cancelled. Otherwise, it's finalized.
func (c *RoomMechanic) Died(reason string, m messages.Message) {
	if c.entry == c.bossEntry {
		// If boss dies, immediately finalize all pending deaths in the room
		c.finalizeDeath(reason, m)
		c.flushAll(m)
		c.all.Delete(c.key)
		return
	}

	if !c.room.StayActive(c.ID()) {
		c.finalizeDeath(reason, m)
		return
	}

	// Record death as pending - need to keep the fight active to continue the encounter
	c.pendingDeath = &m
	c.LastSlain = m
}

func (c *RoomMechanic) flushAll(m messages.Message) {
	c.room.Close()
	for _, char := range c.room.Units {
		char.finalizeDeath("boss_death_flush", m)
	}
}

func (c *RoomMechanic) finalizeDeath(reason string, m messages.Message) {
	c.Common.Died(reason, m)
	c.room.Remove(c.ID())
	c.pendingDeath = nil
}

// checkPendingDeath finalizes a pending death if the resurrection window has passed.
func (c *RoomMechanic) processPendingDeath(m messages.Message, deadBoss bool) {
	if c.pendingDeath == nil {
		return
	}

	deathTime := (*c.pendingDeath).Date()
	if m.Date().Sub(deathTime) >= time.Minute {
		// Intentionally make this a slain message, as they did die. So a timeout would
		// be incorrect.
		c.finalizeDeath("timeout_pending_death", m)
		return
	}

	if c.room.StayActive(c.ID()) {
		return
	}

	c.finalizeDeath("allowed_to_die", *c.pendingDeath)
}
