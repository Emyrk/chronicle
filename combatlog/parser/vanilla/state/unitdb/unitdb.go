package unitdb

import (
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/types/combatant"
	"github.com/Emyrk/chronicle/combatlog/parser/types/unitinfo"
	"github.com/Emyrk/chronicle/combatlog/parser/vanilla/messages"
	"github.com/Emyrk/chronicle/database/gamedb/chrondbc"
)

type Units struct {
	// TODO: Slain to remove units?
	Info      map[guid.GUID]unitinfo.Info
	Players   map[guid.GUID]combatant.Combatant
	Possessed map[guid.GUID]PossessionState
}

func New() *Units {
	return &Units{
		Info:      make(map[guid.GUID]unitinfo.Info),
		Players:   make(map[guid.GUID]combatant.Combatant),
		Possessed: make(map[guid.GUID]PossessionState),
	}
}

// Classify returns the full classification for a unit based on its GUID,
// stored info, and current possession state.
func (us *Units) Classify(g guid.GUID) UnitClassification {
	c := UnitClassification{
		Type: UnitTypeFromGUID(g),
	}

	if info, ok := us.Info[g]; ok {
		c.Relation.Owner = info.Owner
		if info.CanCooperate {
			c.Affiliation = AffiliationFriendly
		} else {
			c.Affiliation = AffiliationHostile
		}
	}

	if ps, ok := us.Possessed[g]; ok {
		c.Possession = &ps
		// A possessed hostile uses their parent's affiliation.
		cl := us.Classify(ps.Controller)
		c.Affiliation = cl.Affiliation
	}

	return c
}

// ProcessMessage handles messages that affect unit state.
// Lazy-expires stale possessions on every call.
func (us *Units) ProcessMessage(m messages.Message) error {
	us.expirePossessions(m.Date())

	switch msg := m.(type) {
	case *messages.Combatant:
		us.UpdatePlayer(msg.Combatant)
	case *messages.Unit:
		us.Update(msg.Info)
	case *messages.NewOwner:
		us.UpdateOwner(msg.Target, msg.NewOwner)
	case *messages.Slain:
		// Death clears possession
		us.ClearPossessed(msg.Victim)
	case *messages.PossessionChange:
		if msg.Gained {
			us.SetPossessed(msg.Target, msg.Controller, msg.Spell, msg.Date(), msg.Duration)
		} else {
			us.ClearPossessed(msg.Target)
		}
	}

	return nil
}

// expirePossessions removes any possession whose ExpiresAt has passed.
func (us *Units) expirePossessions(now time.Time) {
	for target, ps := range us.Possessed {
		if !ps.ExpiresAt.IsZero() && now.After(ps.ExpiresAt) {
			delete(us.Possessed, target)
		}
	}
}

// SetPossessed marks a unit as temporarily controlled by another unit.
func (us *Units) SetPossessed(target, controller guid.GUID, spell *chrondbc.Spell, t time.Time, duration time.Duration) {
	if controller == target {
		// this should never happen
		return
	}
	ps := PossessionState{
		Controller: controller,
		Spell:      spell,
		StartTime:  t,
	}
	if duration > 0 {
		ps.ExpiresAt = t.Add(duration)
	}
	us.Possessed[target] = ps
}

// ClearPossessed removes the temporary control effect from a unit.
func (us *Units) ClearPossessed(target guid.GUID) {
	delete(us.Possessed, target)
}

func (us *Units) UpdateOwner(target guid.GUID, owner guid.GUID) {
	if info, ok := us.Info[target]; ok {
		info.Owner = &owner
		us.Info[target] = info
	}
}

func (us *Units) Get(gid guid.GUID) (unitinfo.Info, bool) {
	u, ok := us.Info[gid]
	return u, ok
}

func (us *Units) GetPlayer(gid guid.GUID) (combatant.Combatant, bool) {
	c, ok := us.Players[gid]
	return c, ok
}

func (us *Units) Update(u unitinfo.Info) {
	us.Info[u.Guid] = u
}

func (us *Units) UpdateUnitName(gid guid.GUID, name string) {
	if info, ok := us.Info[gid]; ok {
		if info.Name != "" {
			return
		}
		info.Name = name
		us.Info[gid] = info
		return
	}

	us.Info[gid] = unitinfo.Info{Name: name}
}

func (us *Units) UpdatePlayer(c combatant.Combatant) {
	us.Players[c.Guid] = c
	// TODO: REMOVE this. It is a crutch because `unit_info` is not perfect.
	if _, ok := us.Info[c.Guid]; !ok {
		us.Update(unitinfo.Info{
			Seen:         c.Seen,
			Guid:         c.Guid,
			IsPlayer:     c.IsMe(),
			Name:         c.Name,
			CanCooperate: true,
			Owner:        nil,
		})
	}
}
