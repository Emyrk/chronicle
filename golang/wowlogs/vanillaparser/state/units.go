package state

import (
	"time"

	"github.com/Emyrk/chronicle/golang/wowlogs/guid"
	"github.com/Emyrk/chronicle/golang/wowlogs/types/unitinfo"
)

type Units struct {
	Parent *Units
	// Units is a lookup table for unit information.
	Units map[guid.GUID]unitinfo.Info
	// <guid> -> <parent guid>
	ToOwner map[guid.GUID]guid.GUID

	// Active refers to units that is still "fighting". A unit can be considered
	// inactive by death or timeout.
	// TODO: portals too maybe? Like hearth
	Deaths         map[guid.GUID]time.Time
	FriendlyActive map[guid.GUID]time.Time
	EnemiesActive  map[guid.GUID]time.Time
	UnknownActive  map[guid.GUID]time.Time
}

func NewUnits(parent *Units) *Units {
	return &Units{
		Parent:         parent,
		Units:          make(map[guid.GUID]unitinfo.Info),
		ToOwner:        make(map[guid.GUID]guid.GUID),
		Deaths:         make(map[guid.GUID]time.Time),
		FriendlyActive: make(map[guid.GUID]time.Time),
		EnemiesActive:  make(map[guid.GUID]time.Time),
		UnknownActive:  make(map[guid.GUID]time.Time),
	}
}

func (u *Units) Info(gid guid.GUID) (unitinfo.Info, bool) {
	if u == nil {
		return unitinfo.Info{}, false
	}

	if i, ok := u.Units[gid]; ok {
		return i, true
	}
	return u.Parent.Info(gid)
}

func (u *Units) Seen(ts time.Time, ids ...guid.GUID) {
	if u == nil {
		return
	}

	for _, id := range ids {
		info, ok := u.Info(id)
		if !ok {
			// Unknown unit, track as unknown active
			u.UnknownActive[id] = ts
			return
		}

		if info.CanCooperate {
			u.FriendlyActive[id] = ts
		} else {
			u.EnemiesActive[id] = ts
		}
	}

	u.Parent.Seen(ts, ids...)
}

func (u *Units) NewInfo(info unitinfo.Info) {
	if u == nil {
		return
	}

	if info.Guid.IsZero() {
		return
	}

	u.Units[info.Guid] = info
	if info.Owner != nil {
		u.ToOwner[info.Guid] = *info.Owner
	}

	if act, ok := u.UnknownActive[info.Guid]; ok {
		// Found an unknown active, update based on new info
		delete(u.UnknownActive, info.Guid)
		if info.CanCooperate {
			u.FriendlyActive[info.Guid] = act
		} else {
			u.EnemiesActive[info.Guid] = act
		}
	}

	// Always update the parent too
	u.Parent.NewInfo(info)
}

// Bump should be called when a unit is a part of some action (cast, damage, heal, etc).
// This is to track their activity for timeouts, etc.
func (u *Units) Bump(ts time.Time, id guid.GUID) {
	if u == nil {
		return
	}

	if _, ok := u.FriendlyActive[id]; ok {
		u.FriendlyActive[id] = ts
	} else if _, ok := u.EnemiesActive[id]; ok {
		u.EnemiesActive[id] = ts
		return
	} else if _, ok := u.UnknownActive[id]; ok {
		u.UnknownActive[id] = ts
	}

	// Always update the parent too
	u.Parent.Bump(ts, id)
}

func (u *Units) Slain(ts time.Time, gs ...guid.GUID) {
	if u == nil {
		return
	}

	for _, id := range gs {
		u.Deaths[id] = ts
		delete(u.FriendlyActive, id)
		delete(u.EnemiesActive, id)
		delete(u.UnknownActive, id)
	}

	// Always update the parent too
	u.Parent.Slain(ts, gs...)
}

func (u *Units) OnlyFriendlyActive() bool {
	return len(u.EnemiesActive) == 0 && len(u.UnknownActive) == 0
}
