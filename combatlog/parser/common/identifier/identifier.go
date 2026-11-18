package identifier

import (
	"github.com/Emyrk/chronicle/combatlog/parser/common/encounter"
	"github.com/Emyrk/chronicle/combatlog/parser/common/unitdb"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/types"
)

type EncounterFuncResult struct {
	// EncounterName, if set, will be used to identify a named encounter.
	EncounterName string
	// Boss indicate if this fight has some bosses that need to be manually included.
	// This is important for fights where the boss comes into the fight after some
	// period of time.
	Bosses []uint32
}

type Identity struct {
	Affiliation types.Affiliation
	// Category optionally overrides the ordinary category of a known zone entry.
	// Boss remains an independent encounter role, not a semantic category.
	Category unitdb.Category
	// Name is the display name for this unit (e.g. "Lava Surger", "Ragnaros").
	Name string
	// EncounterName, if set, will be used to identify a named encounter.
	EncounterName string
	// Boss indicates if the unit is considered a boss for encounter purposes.
	Boss bool
	// BossDeathDoesNotEndEncounter opts this boss out of the default behavior
	// where its death immediately ends the current encounter.
	BossDeathDoesNotEndEncounter bool

	EncounterNameFn func(f encounter.Fight) *EncounterFuncResult
}

func (id Identity) CanBattle() bool {
	return id.Affiliation == types.AffiliationHostile || id.Affiliation == types.AffiliationNeutral
}

type Identifier struct {
	byEntryId       map[uint32]Identity
	byObjectEntryId map[uint32]Identity
}

// NewIdentifier registers creature templates, also used by vehicle GUIDs.
func NewIdentifier(byEntryId map[uint32]Identity) *Identifier {
	return &Identifier{
		byEntryId: byEntryId,
	}
}

func (i *Identifier) AddEntryId(entryId uint32, identity Identity) {
	i.byEntryId[entryId] = identity
}

// AddObjectEntryId registers a gameobject template independently of creature
// entries, which use a separate numeric namespace.
func (i *Identifier) AddObjectEntryId(entryId uint32, identity Identity) {
	if i.byObjectEntryId == nil {
		i.byObjectEntryId = make(map[uint32]Identity)
	}
	i.byObjectEntryId[entryId] = identity
}

func (i *Identifier) lookup(id guid.GUID) (Identity, bool) {
	if i == nil {
		return Identity{}, false
	}
	var entries map[uint32]Identity
	switch {
	case id.IsObject():
		entries = i.byObjectEntryId
	case id.IsCreature(), id.IsVehicle():
		entries = i.byEntryId
	default:
		// Player and pet entry bits are not creature template IDs.
		return Identity{}, false
	}
	entry, ok := id.GetEntry()
	if !ok {
		return Identity{}, false
	}
	identity, exists := entries[entry]
	return identity, exists
}

func (i *Identifier) IdentifyUnit(id guid.GUID) Identity {
	identity, exists := i.lookup(id)
	if !exists {
		return Identity{Affiliation: types.AffiliationUnknown}
	}
	return identity
}

// HostileEntries returns the raw creature entry → Identity map.
func (i *Identifier) HostileEntries() map[uint32]Identity {
	return i.byEntryId
}

// UnitCategory resolves only explicitly registered zone entries. It has no
// lookup-count side effects; unknown reporting uses observed instance membership.
func (i *Identifier) UnitCategory(id guid.GUID) unitdb.Category {
	identity, exists := i.lookup(id)
	if !exists {
		return unitdb.CategoryUnknown
	}
	if identity.Category != "" {
		return identity.Category
	}
	return unitdb.CategoryOrdinary
}
