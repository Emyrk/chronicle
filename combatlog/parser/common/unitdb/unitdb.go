package unitdb

import (
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/types/combatant"
	"github.com/Emyrk/chronicle/combatlog/parser/types/unitinfo"
	"github.com/Emyrk/chronicle/database/gamedb/chrondbc"
)

type Units struct {
	// TODO: Slain to remove units?
	Info         map[guid.GUID]unitinfo.Info
	Players      map[guid.GUID]combatant.Combatant
	PlayerByName map[string]guid.GUID
	Possessed    map[guid.GUID]PossessionState

	// directOwners preserves the observed ownership graph while Info stores the
	// flattened root owner used by downstream attribution.
	directOwners map[guid.GUID]guid.GUID
}

func New() *Units {
	return &Units{
		Info:         make(map[guid.GUID]unitinfo.Info),
		Players:      make(map[guid.GUID]combatant.Combatant),
		PlayerByName: make(map[string]guid.GUID),
		Possessed:    make(map[guid.GUID]PossessionState),
		directOwners: make(map[guid.GUID]guid.GUID),
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
		// Vehicle control is reconstructed after parsing from delayed addon
		// messages. Until that timeline is available, CanCooperate cannot
		// reliably describe whether the vehicle belongs to the raid.
		if c.Type != UnitTypeVehicle {
			if info.CanCooperate {
				c.Affiliation = AffiliationFriendly
			} else {
				c.Affiliation = AffiliationHostile
			}
		}
	}

	if ps, ok := us.Possessed[g]; ok {
		c.Possession = &ps
		// A possessed hostile uses their controller's affiliation.
		// If the controller isn't registered (e.g. player not in Info map),
		// default to Friendly since only friendly units can possess.
		cl := us.Classify(ps.Controller)
		if cl.Affiliation != AffiliationUnknown {
			c.Affiliation = cl.Affiliation
		} else {
			c.Affiliation = AffiliationFriendly
		}
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

// GetPossession returns the temporary control effect (e.g. Mind Control)
// currently applied to the unit, if any.
func (us *Units) GetPossession(target guid.GUID) (PossessionState, bool) {
	ps, ok := us.Possessed[target]
	return ps, ok
}

// ClearPossessed removes the temporary control effect from a unit.
func (us *Units) ClearPossessed(target guid.GUID) {
	delete(us.Possessed, target)
}

func (us *Units) UpdateOwner(target guid.GUID, owner guid.GUID) {
	if _, ok := us.Info[target]; !ok {
		return
	}
	us.ensureDirectOwners()

	if _, ok := us.resolveOwner(owner, target); !ok {
		return
	}
	us.directOwners[target] = owner
	us.flattenOwners()
}

func (us *Units) ensureDirectOwners() {
	if us.directOwners != nil {
		return
	}
	us.directOwners = make(map[guid.GUID]guid.GUID)
	for target, info := range us.Info {
		if info.Owner != nil {
			us.directOwners[target] = *info.Owner
		}
	}
}

// resolveOwner iteratively follows the observed ownership chain to its root.
// stop is the unit receiving the owner update; reaching it means the update
// would form a cycle, so resolution stops immediately and rejects the update.
func (us *Units) resolveOwner(owner, stop guid.GUID) (guid.GUID, bool) {
	seen := make(map[guid.GUID]struct{})
	for {
		if owner == stop {
			return 0, false
		}
		if _, ok := seen[owner]; ok {
			return 0, false
		}
		seen[owner] = struct{}{}

		next, ok := us.directOwners[owner]
		if !ok {
			return owner, true
		}
		owner = next
	}
}

// flattenOwners updates every known ownership relationship to point directly
// at its root owner. The direct graph is retained so later ownership changes
// can be propagated through already-flattened descendants.
func (us *Units) flattenOwners() {
	for target, info := range us.Info {
		directOwner, ok := us.directOwners[target]
		if !ok {
			info.Owner = nil
			us.Info[target] = info
			continue
		}
		owner, ok := us.resolveOwner(directOwner, target)
		if !ok {
			continue
		}
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

func (us *Units) GetPlayerByName(name string) (combatant.Combatant, bool) {
	gid, ok := us.PlayerByName[name]
	if !ok {
		return combatant.Combatant{}, false
	}
	return us.GetPlayer(gid)
}

func (us *Units) Update(u unitinfo.Info) {
	us.ensureDirectOwners()
	existing, exists := us.Info[u.Guid]
	if u.Name == "" && exists {
		// Do no overwrite an existing entry if this one is missing a name.
		return
	}

	directOwner, hadDirectOwner := us.directOwners[u.Guid]
	preserveOwner := func() {
		if hadDirectOwner {
			owner := directOwner
			u.Owner = &owner
		} else {
			u.Owner = nil
		}
	}

	if u.Guid.IsPet() && u.Owner == nil && existing.Owner != nil {
		// For some reason, a pet has been recorded not having an owner in a `UNIT_INFO` message.
		// This bug might exist for things like totems as well, I am not sure.
		//
		// In the hunter case, we can at least be sure the pet doesn't go ownerless if we seen it have
		// an owner at any point.
		preserveOwner()
	}

	if u.Owner != nil {
		if ps, ok := us.Possessed[u.Guid]; ok && ps.Controller == *u.Owner {
			// A temporarily possessed unit (e.g. Mind Control, Orb of Dominion)
			// reports its controller as its owner in UNIT_INFO. That control is
			// temporary, so do not persist it as permanent ownership. Otherwise
			// the possessed unit would "die" with its controller (owner_slain),
			// e.g. ending the Razorgore encounter when the MC'ing player dies.
			preserveOwner()
		} else if _, ok := us.resolveOwner(*u.Owner, u.Guid); !ok {
			// Reject self-ownership and ownership chains that would form a cycle.
			preserveOwner()
		}
	}

	if u.Guid.IsPlayer() && u.Name != "" {
		us.PlayerByName[u.Name] = u.Guid
	}

	if u.Owner == nil {
		delete(us.directOwners, u.Guid)
	} else {
		us.directOwners[u.Guid] = *u.Owner
	}
	us.Info[u.Guid] = u
	us.flattenOwners()
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

// InvalidatePlayerTalents clears the talents used by encounter ranking snapshots.
func (us *Units) InvalidatePlayerTalents(gid guid.GUID) {
	player, ok := us.Players[gid]
	if !ok {
		return
	}
	player.Talents = nil
	us.Players[gid] = player
}

// UpdatePlayerTalents replaces the talents used by encounter ranking snapshots.
func (us *Units) UpdatePlayerTalents(gid guid.GUID, talents *combatant.Talents) {
	player, ok := us.Players[gid]
	if !ok {
		return
	}
	player.Talents = talents
	us.Players[gid] = player
}

func (us *Units) UpdatePlayer(c combatant.Combatant) {
	existing, ok := us.Players[c.Guid]
	if ok {
		c.MergeExisting(existing)
	}

	us.Players[c.Guid] = c
	us.PlayerByName[c.Name] = c.Guid
}
