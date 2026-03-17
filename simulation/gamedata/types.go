// Package gamedata defines data types and the DataProvider interface for
// the DPS simulation engine. All types mirror vmangos server structures
// and WoW DBC data. This package is WASM-safe.
package gamedata

// DataProvider is the interface for fetching game data. Implementations
// include JSON (WASM-safe), DBC+dbcmem (server), and PostgreSQL (server).
type DataProvider interface {
	GetSpell(id int32) (SpellData, bool)
	GetItem(id int32) (ItemData, bool)
	GetCreature(entryID uint32) (CreatureData, bool)
	GetSetBonuses(setID int32) ([]SetBonusData, bool)
	GetSpellsForClass(classID int32) ([]int32, error)
	GetPlayerBaseStats(race, class, level int32) (PlayerBaseStats, bool)
}

// Schools of magic.
const (
	SchoolPhysical = 0
	SchoolHoly     = 1
	SchoolFire     = 2
	SchoolNature   = 3
	SchoolFrost    = 4
	SchoolShadow   = 5
	SchoolArcane   = 6
	NumSchools     = 7
)

// School masks (bit flags).
const (
	SchoolMaskPhysical = 1 << SchoolPhysical
	SchoolMaskHoly     = 1 << SchoolHoly
	SchoolMaskFire     = 1 << SchoolFire
	SchoolMaskNature   = 1 << SchoolNature
	SchoolMaskFrost    = 1 << SchoolFrost
	SchoolMaskShadow   = 1 << SchoolShadow
	SchoolMaskArcane   = 1 << SchoolArcane
)

// Power types.
const (
	PowerMana   = 0
	PowerRage   = 1
	PowerFocus  = 2
	PowerEnergy = 3
)

// Spell damage class — determines which bonus pipeline to use.
const (
	SpellDmgClassNone   = 0
	SpellDmgClassMagic  = 1
	SpellDmgClassMelee  = 2
	SpellDmgClassRanged = 3
)

// Spell effect types (subset relevant to DPS sim).
const (
	SpellEffectNone                = 0
	SpellEffectInstakill           = 1
	SpellEffectSchoolDamage        = 2
	SpellEffectDummy               = 3
	SpellEffectApplyAura           = 6
	SpellEffectPowerDrain          = 8
	SpellEffectHeal                = 10
	SpellEffectEnergize            = 30
	SpellEffectWeaponDamage        = 35
	SpellEffectWeaponDmgPct        = 36
	SpellEffectTriggerSpell        = 64
	SpellEffectNormalizedWeaponDmg = 121
)

// Aura types (subset relevant to DPS sim).
const (
	AuraNone                      = 0
	AuraPeriodicDamage            = 3
	AuraDummy                     = 4
	AuraPeriodicHeal              = 8
	AuraModAttackSpeed            = 9
	AuraModDamageDone             = 13
	AuraModStat                   = 29
	AuraModIncreaseSpeed          = 31
	AuraProcTriggerSpell          = 42
	AuraModDamagePercentDone      = 79
	AuraModDamagePercentTaken     = 87
	AuraAddFlatModifier           = 107
	AuraAddPctModifier            = 108
)

// SpellData mirrors vmangos SpellEntry (src/game/Spells/SpellEntry.h).
// CastTimeMs and DurationMs are pre-resolved from their DBC index values.
type SpellData struct {
	ID                   int32          `json:"id"`
	Name                 string         `json:"name"`
	School               int32          `json:"school"`
	DmgClass             int32          `json:"dmgClass"`
	PowerType            int32          `json:"powerType"`
	ManaCost             int32          `json:"manaCost"`
	ManaCostPct          int32          `json:"manaCostPct"`
	CastTimeMs           int32          `json:"castTimeMs"`
	CooldownMs           int32          `json:"cooldownMs"`
	CategoryCooldownMs   int32          `json:"categoryCooldownMs"`
	GCDMs                int32          `json:"gcdMs"`
	DurationMs           int32          `json:"durationMs"`
	SpellLevel           int32          `json:"spellLevel"`
	BaseLevel            int32          `json:"baseLevel"`
	MaxLevel             int32          `json:"maxLevel"`
	Effects              [3]SpellEffect `json:"effects"`
	ProcFlags            uint32         `json:"procFlags"`
	ProcChance           int32          `json:"procChance"`
	ProcCharges          int32          `json:"procCharges"`
	Speed                float32        `json:"speed"`
	Mechanic             int32          `json:"mechanic"`
	Attributes           [5]uint64      `json:"attributes"`
	SpellFamilyName      int32          `json:"spellFamilyName"`
	SpellFamilyFlags     uint64         `json:"spellFamilyFlags"`
	MaxTargetLevel       int32          `json:"maxTargetLevel"`
	MaxAffectedTargets   int32          `json:"maxAffectedTargets"`
	EquippedItemClass    int32          `json:"equippedItemClass"`
	EquippedItemSubclass int32          `json:"equippedItemSubclass"`
}

// SpellEffect represents one of three effects on a spell.
type SpellEffect struct {
	Type             int32   `json:"type"`
	BasePoints       int32   `json:"basePoints"`
	DieSides         int32   `json:"dieSides"`
	BaseDice         int32   `json:"baseDice"`
	PointsPerLevel   float32 `json:"pointsPerLevel"`
	DicePerLevel     float32 `json:"dicePerLevel"`
	BonusCoefficient float32 `json:"bonusCoefficient"`
	AuraType         int32   `json:"auraType"`
	AuraPeriodMs     int32   `json:"auraPeriodMs"`
	Amplitude        float32 `json:"amplitude"`
	TriggerSpellID   int32   `json:"triggerSpellId"`
	ChainTargets     int32   `json:"chainTargets"`
	PointsPerCombo   float32 `json:"pointsPerCombo"`
	MiscValue        int32   `json:"miscValue"`
	MechanicMask     int32   `json:"mechanicMask"`
}

// ItemData mirrors vmangos ItemPrototype.
type ItemData struct {
	ID             int32         `json:"id"`
	Name           string        `json:"name"`
	Class          int32         `json:"class"`
	SubClass       int32         `json:"subClass"`
	Quality        int32         `json:"quality"`
	ItemLevel      int32         `json:"itemLevel"`
	RequiredLevel  int32         `json:"requiredLevel"`
	InventoryType  int32         `json:"inventoryType"`
	Stats          [10]ItemStat  `json:"stats"`
	Damage         [5]ItemDamage `json:"damage"`
	Delay          int32         `json:"delay"`
	Armor          int32         `json:"armor"`
	Resistances    [6]int32      `json:"resistances"`
	Spells         [5]ItemSpell  `json:"spells"`
	SetID          int32         `json:"setId"`
	RandomProperty int32         `json:"randomProperty"`
	Block          int32         `json:"block"`
}

// ItemStat is a single stat bonus on an item.
type ItemStat struct {
	Type  int32 `json:"type"`
	Value int32 `json:"value"`
}

// ItemDamage is a weapon damage entry.
type ItemDamage struct {
	Min        float32 `json:"min"`
	Max        float32 `json:"max"`
	DamageType int32   `json:"damageType"`
}

// ItemSpell is a spell trigger on an item.
type ItemSpell struct {
	SpellID            int32   `json:"spellId"`
	Trigger            int32   `json:"trigger"`
	Charges            int32   `json:"charges"`
	PPMRate            float32 `json:"ppmRate"`
	CooldownMs         int32   `json:"cooldownMs"`
	CategoryCooldownMs int32   `json:"categoryCooldownMs"`
}

// CreatureData mirrors vmangos CreatureInfo + CreatureClassLevelStats.
type CreatureData struct {
	EntryID            uint32  `json:"entryId"`
	Name               string  `json:"name"`
	Level              int32   `json:"level"`
	Health             int32   `json:"health"`
	Mana               int32   `json:"mana"`
	Armor              int32   `json:"armor"`
	Resistances        [6]int32 `json:"resistances"`
	CreatureType       int32   `json:"creatureType"`
	Rank               int32   `json:"rank"`
	DamageSchool       int32   `json:"damageSchool"`
	MeleeAttackTimeMs  int32   `json:"meleeAttackTimeMs"`
	MeleeDmgMin        float32 `json:"meleeDmgMin"`
	MeleeDmgMax        float32 `json:"meleeDmgMax"`
	AttackPower        int32   `json:"attackPower"`
	DamageVariance     float32 `json:"damageVariance"`
	MechanicImmuneMask uint32  `json:"mechanicImmuneMask"`
	SchoolImmuneMask   uint32  `json:"schoolImmuneMask"`
	UnitClass          int32   `json:"unitClass"`
	DefenseSkill       int32   `json:"defenseSkill"`
}

// PlayerBaseStats per race/class/level.
type PlayerBaseStats struct {
	Health    int32 `json:"health"`
	Mana      int32 `json:"mana"`
	Strength  int32 `json:"strength"`
	Agility   int32 `json:"agility"`
	Stamina   int32 `json:"stamina"`
	Intellect int32 `json:"intellect"`
	Spirit    int32 `json:"spirit"`
}

// SetBonusData describes a set bonus threshold.
type SetBonusData struct {
	SetID     int32 `json:"setId"`
	Threshold int32 `json:"threshold"`
	SpellID   int32 `json:"spellId"`
}

// Item stat type constants.
const (
	ItemModMana              = 0
	ItemModHealth            = 1
	ItemModAgility           = 3
	ItemModStrength          = 4
	ItemModIntellect         = 5
	ItemModSpirit            = 6
	ItemModStamina           = 7
	ItemModHitRating         = 31
	ItemModCritRating        = 32
	ItemModAttackPower       = 38
	ItemModRangedAttackPower = 39
	ItemModSpellPower        = 45
)

// CreatureType constants.
const (
	CreatureTypeBeast      = 1
	CreatureTypeDragonkin  = 2
	CreatureTypeDemon      = 3
	CreatureTypeElemental  = 4
	CreatureTypeGiant      = 5
	CreatureTypeUndead     = 6
	CreatureTypeHumanoid   = 7
	CreatureTypeCritter    = 8
	CreatureTypeMechanical = 9
)

// CreatureRank constants.
const (
	CreatureRankNormal    = 0
	CreatureRankElite     = 1
	CreatureRankRareElite = 2
	CreatureRankWorldBoss = 3
)

// Inventory type (slot) constants.
const (
	InvTypeHead     = 1
	InvTypeNeck     = 2
	InvTypeShoulder = 3
	InvTypeChest    = 5
	InvTypeWaist    = 6
	InvTypeLegs     = 7
	InvTypeFeet     = 8
	InvTypeWrist    = 9
	InvTypeHands    = 10
	InvTypeFinger   = 11
	InvTypeTrinket  = 12
	InvTypeWeapon   = 13
	InvTypeShield   = 14
	InvTypeRanged   = 15
	InvTypeBack     = 16
	InvType2HWeapon = 17
	InvTypeMainHand = 21
	InvTypeOffHand  = 22
)

// Item trigger types.
const (
	ItemTriggerOnEquip = 0
	ItemTriggerOnHit   = 1
	ItemTriggerOnUse   = 2
	ItemTriggerOnProc  = 6
)
