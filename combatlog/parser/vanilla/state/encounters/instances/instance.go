package instances

import (
	"context"

	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/types/realm"
	"github.com/Emyrk/chronicle/combatlog/parser/types/zone"
	"github.com/Emyrk/chronicle/combatlog/parser/vanilla/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/vanilla/state/encounters/encounterevents"
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
	Hostile bool
	// Name is the display name for this unit (e.g. "Lava Surger", "Ragnaros").
	Name string
	// EncounterName, if set, will be used to identify a named encounter.
	EncounterName string
	// Boss indicates if the unit is considered a boss for encounter purposes.
	Boss bool

	EncounterNameFn func(f Fight) *EncounterFuncResult
}

// Instance represents a dungeon or raid instance
type DepreceatedInstance interface {
	// Name returns the instance name (e.g., "Scarlet Monastery Cathedral")
	Name() string

	// MatchesZone checks if this instance handles the given zone
	MatchesZone(z zone.Zone) bool

	// Process handles a message for this instance
	Process(m messages.Message) error

	// CharactersList returns the list of characters in this instance and their
	// associated activity and additional data.
	//CharactersList() map[guid.GUID]character.Character
	// IdentifyUnit returns any hard coded identity information for the given GUID in the
	// instance.
	IdentifyUnit(id guid.GUID) Identity
	// Zone returns the zone of this instance
	//Zone() zone.Zone

	// SetRealm is used to populate some initial state if we have it
	SetRealm(r *realm.Info)

	// Fights returns all completed fights plus any current fight in progress.
	// This is populated live during message processing.
	Fights() []Fight
	Events() *encounterevents.Events
	Finalize(ctx context.Context) (*FinalizedInstance, error)
	Seen() map[guid.GUID]struct{}
}

type Identifier struct {
	byEntryId    map[uint32]Identity
	unknownUnits map[uint32]int // creature entry IDs not in hostiles map, with hit count
}

func NewIdentifier(byEntryId map[uint32]Identity) *Identifier {
	return &Identifier{
		byEntryId:    byEntryId,
		unknownUnits: make(map[uint32]int),
	}
}

func (i *Identifier) IdentifyUnit(id guid.GUID) Identity {
	if id.IsPlayer() {
		return Identity{Hostile: false}
	}

	entryID, ok := id.GetEntry()
	if !ok {
		return Identity{Hostile: false}
	}

	identity, exists := i.byEntryId[entryID]
	if !exists {
		i.unknownUnits[entryID]++
		return Identity{Hostile: false}
	}
	return identity
}

// UnknownUnits returns creature entry IDs that were looked up but not found in the
// hostiles map, with the number of times each was seen.
func (i *Identifier) UnknownUnits() map[uint32]int {
	return i.unknownUnits
}

// HostileEntries returns the raw creature entry → Identity map.
func (i *Identifier) HostileEntries() map[uint32]Identity {
	return i.byEntryId
}
