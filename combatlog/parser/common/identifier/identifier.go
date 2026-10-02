package identifier

import (
	"github.com/Emyrk/chronicle/combatlog/parser/common/critters"
	"github.com/Emyrk/chronicle/combatlog/parser/common/encounter"
	"github.com/Emyrk/chronicle/combatlog/parser/common/totems"
	"github.com/Emyrk/chronicle/combatlog/parser/common/warlockdemon"
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
	// Name is the display name for this unit (e.g. "Lava Surger", "Ragnaros").
	Name string
	// EncounterName, if set, will be used to identify a named encounter.
	EncounterName string
	// Boss indicates if the unit is considered a boss for encounter purposes.
	Boss bool

	EncounterNameFn func(f encounter.Fight) *EncounterFuncResult
}

func (id Identity) CanBattle() bool {
	return id.Affiliation == types.AffiliationHostile || id.Affiliation == types.AffiliationNeutral
}

type Identifier struct {
	byEntryId    map[uint32]Identity
	unknownUnits map[uint32]int // unclassified creature entry IDs, with hit count
}

func NewIdentifier(byEntryId map[uint32]Identity) *Identifier {
	return &Identifier{
		byEntryId:    byEntryId,
		unknownUnits: make(map[uint32]int),
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
		_, isTotem := totems.IsTotem(id)
		_, isWarlockDemon := warlockdemon.IsWarlockDemon(id)
		if !critters.IsCritter(id) && !isTotem && !isWarlockDemon {
			i.unknownUnits[entryID]++
		}
		return Identity{Affiliation: types.AffiliationUnknown}
	}
	return identity
}

// UnknownUnits returns unclassified creature entry IDs that were looked up but not
// found in the hostiles map, with the number of times each was seen.
func (i *Identifier) UnknownUnits() map[uint32]int {
	return i.unknownUnits
}

// HostileEntries returns the raw creature entry → Identity map.
func (i *Identifier) HostileEntries() map[uint32]Identity {
	return i.byEntryId
}
