//go:generate go tool go-enum -f constants.go
package types

// ENUM(casts, begins to cast, channels, fails casting)
type CastActions string

// ENUM(DRUID,HUNTER,MAGE,PALADIN,PRIEST,ROGUE,SHAMAN,WARLOCK,WARRIOR)
type HeroClasses string

// ENUM(Scourge,Orc,Troll,Tauren,Goblin,Human,Gnome,Dwarf,NightElf,BloodElf)
type HeroRaces string

// ENUM(NotSet,Unknown,EMPTY,Male,Female)
type HeroGender int
