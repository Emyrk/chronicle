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
	byEntryId map[uint32]Identity
}

func NewIdentifier(byEntryId map[uint32]Identity) *Identifier {
	return &Identifier{
		byEntryId: byEntryId,
	}
}

func (i *Identifier) AddEntryId(entryId uint32, identity Identity) {
	i.byEntryId[entryId] = identity
}

func (i *Identifier) IdentifyUnit(id guid.GUID) Identity {
	if id.IsPlayer() {
		return Identity{Affiliation: types.AffiliationUnknown}
	}
	if id.IsPet() {
		// Pet entry IDs can collide with a regular unit ID.
		// Since their entry ids are just like player IDs, they are random.
		return Identity{Affiliation: types.AffiliationUnknown}
	}

	entryID, ok := id.GetEntry()
	if !ok {
		return Identity{Affiliation: types.AffiliationUnknown}
	}

	identity, exists := i.byEntryId[entryID]
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
	if i == nil || id.IsZero() || id.IsPlayer() || id.IsPet() {
		return unitdb.CategoryUnknown
	}
	entry, ok := id.GetEntry()
	if !ok {
		return unitdb.CategoryUnknown
	}
	identity, exists := i.byEntryId[entry]
	if !exists {
		return unitdb.CategoryUnknown
	}
	if identity.Category != "" {
		return identity.Category
	}
	return unitdb.CategoryOrdinary
}
