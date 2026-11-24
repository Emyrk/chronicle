package unitdb

import (
	"github.com/Emyrk/chronicle/combatlog/parser/common/critters"
	"github.com/Emyrk/chronicle/combatlog/parser/common/totems"
	"github.com/Emyrk/chronicle/combatlog/parser/common/traps"
	"github.com/Emyrk/chronicle/combatlog/parser/common/warlockdemon"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/database"
)

// Category describes a unit's semantic role, independently of GUID structure,
// affiliation, ownership, encounter boss role and temporary control.
type Category string

const (
	CategoryUnknown        Category = "unknown"
	CategoryOrdinary       Category = "ordinary"
	CategoryGuardian       Category = "guardian"
	CategoryScriptedObject Category = "scripted_object"
	CategoryObject         Category = "object"
	CategoryEnvironment    Category = "environment"
	CategoryCritter        Category = "critter"
	CategoryTotem          Category = "totem"
	CategoryTrap           Category = "trap"
	CategoryDemon          Category = "demon"
	CategoryPlayer         Category = "player"
	CategoryPet            Category = "pet"
)

// knownObjects recognizes specific gameobject templates, not every object GUID.
var knownObjects = map[uint32]Category{
	2061:   CategoryEnvironment, // Campfire
	176296: CategoryObject,      // Portal to Stormwind
	176497: CategoryObject,      // Portal to Ironforge
	176499: CategoryObject,      // Portal to Orgrimmar
}

// knownUrsolObjects recognizes gameobjects specific to Nightmare of Ursol.
var knownUrsolObjects = map[uint32]Category{
	176399: CategoryObject, // Portal to Theramore
	181102: CategoryObject, // Lightwell
}

var knownForeverObjects = map[uint32]Category{
	656243: CategoryObject, // Portal To the Violet Chamber in the City of Dalaran
	214589: CategoryObject, // Cozy Sleeping Bag
}

// knownForeverCreatures provides semantic categories only, not affiliation,
// ownership, boss roles, or activity/lifetime rules.
var knownForeverCreatures = map[uint32]Category{
	264850: CategoryGuardian, // Hawk
	268744: CategoryGuardian, // Frog Familiar
}

// CategoryIdentifier supplies zone definitions without coupling the shared unit
// database to an instance or retaining zone classifications across instances.
type CategoryIdentifier interface {
	UnitCategory(guid.GUID) Category
}

func (us *Units) Category(g guid.GUID, identifiers ...CategoryIdentifier) Category {
	if g.IsZero() {
		return CategoryUnknown
	}
	if g.IsPlayer() {
		return CategoryPlayer
	}
	// Pet entry bits are not creature template IDs.
	if g.IsPet() {
		return CategoryPet
	}
	if critters.IsCritter(g) {
		return CategoryCritter
	}
	if _, ok := totems.IsTotem(g); ok {
		return CategoryTotem
	}
	if _, ok := traps.IsTrap(g); ok {
		return CategoryTrap
	}
	// Only recognized gameobjects have an object category. Unknown objects stay
	// unknown, and creature entry IDs must not collide with gameobject entries.
	if g.IsObject() {
		entry, _ := g.GetEntry()
		if us.flavor.Has(database.FlavorNightmareOfUrsol) {
			if category, ok := knownUrsolObjects[entry]; ok {
				return category
			}
		}
		if us.flavor.Has(database.FlavorWoWForever) {
			if category, ok := knownForeverObjects[entry]; ok {
				return category
			}
		}
		if category, ok := knownObjects[entry]; ok {
			return category
		}
	}
	if (g.IsCreature() || g.IsVehicle()) && us.flavor.Has(database.FlavorWoWForever) {
		entry, _ := g.GetEntry()
		if category, ok := knownForeverCreatures[entry]; ok {
			return category
		}
	}
	if g.IsCreature() {
		if _, ok := warlockdemon.IsWarlockDemon(g); ok {
			return CategoryDemon
		}
	}
	for _, identifier := range identifiers {
		if identifier != nil {
			if category := identifier.UnitCategory(g); category != CategoryUnknown {
				return category
			}
		}
	}
	// Neither a name, affiliation nor ownership proves a semantic category.
	return CategoryUnknown
}
