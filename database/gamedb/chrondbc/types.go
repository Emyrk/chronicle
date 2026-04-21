package chrondbc

import (
	"github.com/Emyrk/chronicle/combatlog/parser/types"
	"github.com/Emyrk/chronicle/database/gamedb/chrondbc/dbcmem"
	"github.com/Emyrk/chronicle/internal/bitmask"
)

type ItemID int32
type SpellID int32
type IconID int32

func (i IconID) Get() dbcmem.SpellIcon {
	return dbcmem.SpellIcons[int32(i)]
}

type SpellCategoryID int32

func (s SpellCategoryID) Get() dbcmem.SpellCategory {
	return dbcmem.SpellCategories[int32(s)]
}

type DurationID int32

func (d DurationID) Get() dbcmem.SpellDuration {
	return dbcmem.SpellDurations[int32(d)]
}

type RangeID int32

func (d RangeID) Get() dbcmem.SpellRange {
	return dbcmem.SpellRanges[int32(d)]
}

type CastingTimeID int32

func (d CastingTimeID) Get() dbcmem.SpellCastTime {
	return dbcmem.SpellCastTimes[int32(d)]
}

type SpellRadiusID int32

func (d SpellRadiusID) Get() dbcmem.SpellRadius {
	return dbcmem.SpellRadii[int32(d)]
}

type SpellFocusObject int32

func (d SpellFocusObject) Get() dbcmem.SpellFocusObject {
	return dbcmem.SpellFocusObjects[int32(d)]
}

//go:generate stringer -type School -trimprefix=School
type School bitmask.Bitmask32

const (
	SchoolPhysical School = 0
	SchoolHoly     School = 1
	SchoolFire     School = 2
	SchoolNature   School = 4
	SchoolFrost    School = 8
	SchoolShadow   School = 16
	SchoolArcane   School = 32
)

func (s School) ToType() types.School {
	switch s {
	case SchoolPhysical:
		return types.PhysicalSchool
	case SchoolHoly:
		return types.HolySchool
	case SchoolFire:
		return types.FireSchool
	case SchoolNature:
		return types.NatureSchool
	case SchoolFrost:
		return types.FrostSchool
	case SchoolShadow:
		return types.ShadowSchool
	case SchoolArcane:
		return types.ArcaneSchool
	default:
		return types.NoneSchool
	}
}

//go:generate stringer -type Power -trimprefix=Power
type Power int32

const (
	PowerMana   Power = 0x00
	PowerRage   Power = 1
	PowerFocus  Power = 2
	PowerEnergy Power = 3
)

type SpellClassMask uint64

// Helper to construct from the two DBC values
func NewSpellClassMask(a, b int32) SpellClassMask {
	return SpellClassMask(uint32(a)) | (SpellClassMask(uint32(b)) << 32)
}

func (m SpellClassMask) Has(other SpellClassMask) bool {
	return m&other != 0
}

//go:generate stringer -type SpellClassSet -trimprefix=SpellClassSet
type SpellClassSet int32

const (
	SpellClassSetGeneric     SpellClassSet = 0
	SpellClassSet1           SpellClassSet = 1 // Unknown/unused in vanilla
	SpellClassSet2           SpellClassSet = 2 // Unknown/unused in vanilla
	SpellClassSetMage        SpellClassSet = 3
	SpellClassSetWarrior     SpellClassSet = 4
	SpellClassSetWarlock     SpellClassSet = 5
	SpellClassSetPriest      SpellClassSet = 6
	SpellClassSetDruid       SpellClassSet = 7
	SpellClassSetRogue       SpellClassSet = 8
	SpellClassSetHunter      SpellClassSet = 9
	SpellClassSetPaladin     SpellClassSet = 10
	SpellClassSetShaman      SpellClassSet = 11
	SpellClassSetDeathKnight SpellClassSet = 15
)

//go:generate stringer -type DispelType -trimprefix=DispelType
type DispelType int32

const (
	DispelTypeNone         DispelType = 0
	DispelTypeMagic        DispelType = 1
	DispelTypeCurse        DispelType = 2
	DispelTypeDisease      DispelType = 3
	DispelTypePoison       DispelType = 4
	DispelTypeStealth      DispelType = 5
	DispelTypeInvisibility DispelType = 6
)

//go:generate stringer -type ProcFlags -trimprefix=ProcFlag
type ProcFlags bitmask.Bitmask32

func (b ProcFlags) Has(flag ProcFlags) bool { return b&flag != 0 }

const (
	ProcFlagNone                       ProcFlags = 0x00000000
	ProcFlagKilled                     ProcFlags = 0x00000001 // 00 Killed by aggressor
	ProcFlagKill                       ProcFlags = 0x00000002 // 01 Kill target (in most cases need XP/Honor reward)
	ProcFlagDoneMeleeAutoAttack        ProcFlags = 0x00000004 // 02 Done melee auto attack
	ProcFlagTakenMeleeAutoAttack       ProcFlags = 0x00000008 // 03 Taken melee auto attack
	ProcFlagDoneSpellMeleeDmgClass     ProcFlags = 0x00000010 // 04 Done attack by Spell that has dmg class melee
	ProcFlagTakenSpellMeleeDmgClass    ProcFlags = 0x00000020 // 05 Taken attack by Spell that has dmg class melee
	ProcFlagDoneRangedAutoAttack       ProcFlags = 0x00000040 // 06 Done ranged auto attack
	ProcFlagTakenRangedAutoAttack      ProcFlags = 0x00000080 // 07 Taken ranged auto attack
	ProcFlagDoneSpellRangedDmgClass    ProcFlags = 0x00000100 // 08 Done attack by Spell that has dmg class ranged
	ProcFlagTakenSpellRangedDmgClass   ProcFlags = 0x00000200 // 09 Taken attack by Spell that has dmg class ranged
	ProcFlagDoneSpellNoneDmgClassPos   ProcFlags = 0x00000400 // 10 Done positive spell that has dmg class none
	ProcFlagTakenSpellNoneDmgClassPos  ProcFlags = 0x00000800 // 11 Taken positive spell that has dmg class none
	ProcFlagDoneSpellNoneDmgClassNeg   ProcFlags = 0x00001000 // 12 Done negative spell that has dmg class none
	ProcFlagTakenSpellNoneDmgClassNeg  ProcFlags = 0x00002000 // 13 Taken negative spell that has dmg class none
	ProcFlagDoneSpellMagicDmgClassPos  ProcFlags = 0x00004000 // 14 Done positive spell that has dmg class magic
	ProcFlagTakenSpellMagicDmgClassPos ProcFlags = 0x00008000 // 15 Taken positive spell that has dmg class magic
	ProcFlagDoneSpellMagicDmgClassNeg  ProcFlags = 0x00010000 // 16 Done negative spell that has dmg class magic
	ProcFlagTakenSpellMagicDmgClassNeg ProcFlags = 0x00020000 // 17 Taken negative spell that has dmg class magic
	ProcFlagDonePeriodic               ProcFlags = 0x00040000 // 18 Successful do periodic (damage / healing)
	ProcFlagTakenPeriodic              ProcFlags = 0x00080000 // 19 Taken spell periodic (damage / healing)
	ProcFlagTakenDamage                ProcFlags = 0x00100000 // 20 Taken any damage
	ProcFlagDoneTrapActivation         ProcFlags = 0x00200000 // 21 On trap activation
	ProcFlagDoneMainhandAttack         ProcFlags = 0x00400000 // 22 Done main-hand melee attacks (spell and autoattack)
	ProcFlagDoneOffhandAttack          ProcFlags = 0x00800000 // 23 Done off-hand melee attacks (spell and autoattack)
	ProcFlagDeath                      ProcFlags = 0x01000000 // 24 Died in any way
	ProcFlag_END                       ProcFlags = 0x02000000 // Sentinel for iteration
)

//go:generate stringer -type AuraInterruptFlags -trimprefix=AuraInterruptFlags
type AuraInterruptFlags bitmask.Bitmask32

func (b AuraInterruptFlags) Has(flag AuraInterruptFlags) bool { return b&flag != 0 }

const (
	AuraInterruptFlagHitBySpell            AuraInterruptFlags = 0x00000001 // Cancelled when hit by any spell
	AuraInterruptFlagTakeDamage            AuraInterruptFlags = 0x00000002 // Cancelled when taking damage
	AuraInterruptFlagCast                  AuraInterruptFlags = 0x00000004 // Cancelled when casting a spell
	AuraInterruptFlagMove                  AuraInterruptFlags = 0x00000008 // Cancelled when moving
	AuraInterruptFlagTurning               AuraInterruptFlags = 0x00000010 // Cancelled when turning
	AuraInterruptFlagJump                  AuraInterruptFlags = 0x00000020 // Cancelled when jumping
	AuraInterruptFlagNotMounted            AuraInterruptFlags = 0x00000040 // Cancelled when not mounted
	AuraInterruptFlagNotAbovewater         AuraInterruptFlags = 0x00000080 // Cancelled when underwater
	AuraInterruptFlagNotUnderwater         AuraInterruptFlags = 0x00000100 // Cancelled when above water
	AuraInterruptFlagNotSheathed           AuraInterruptFlags = 0x00000200 // Cancelled when weapon is drawn
	AuraInterruptFlagTalk                  AuraInterruptFlags = 0x00000400 // Cancelled when talking to NPC
	AuraInterruptFlagUse                   AuraInterruptFlags = 0x00000800 // Cancelled when using object
	AuraInterruptFlagMeleeAttack           AuraInterruptFlags = 0x00001000 // Cancelled on melee attack
	AuraInterruptFlagSpellAttack           AuraInterruptFlags = 0x00002000 // Cancelled on spell attack
	AuraInterruptFlagUnknown14             AuraInterruptFlags = 0x00004000 // Unknown
	AuraInterruptFlagTransform             AuraInterruptFlags = 0x00008000 // Cancelled by shapeshift
	AuraInterruptFlagUnknown16             AuraInterruptFlags = 0x00010000 // Unknown
	AuraInterruptFlagUnknown17             AuraInterruptFlags = 0x00020000 // Unknown
	AuraInterruptFlagMount                 AuraInterruptFlags = 0x00040000 // Cancelled when mounting
	AuraInterruptFlagNotSeated             AuraInterruptFlags = 0x00080000 // Cancelled when standing up
	AuraInterruptFlagChangeMap             AuraInterruptFlags = 0x00100000 // Cancelled on zone/map change
	AuraInterruptFlagImmuneOrLostSelection AuraInterruptFlags = 0x00200000 // Cancelled when losing target or immune
	AuraInterruptFlagUnattackable          AuraInterruptFlags = 0x00400000 // Cancelled when becoming unattackable
	AuraInterruptFlagTeleported            AuraInterruptFlags = 0x00800000 // Cancelled on teleport
	AuraInterruptFlagEnterPvPCombat        AuraInterruptFlags = 0x01000000 // Cancelled when entering PvP combat
	AuraInterruptFlagDirectDamage          AuraInterruptFlags = 0x02000000 // Cancelled by direct damage (not DoT)
	AuraInterruptFlagLanding               AuraInterruptFlags = 0x04000000 // Cancelled when landing (flying mount)
	AuraInterruptFlag_END                  AuraInterruptFlags = 0x08000000 // Sentinel for iteration
)

//go:generate stringer -type WeaponSubclass -trimprefix=WeaponSubclass

// WeaponSubclass is a bitmask for EquippedItemSubclass when ItemClass = Weapon
type WeaponSubclass bitmask.Bitmask32

func (b WeaponSubclass) Has(flag WeaponSubclass) bool { return b&flag != 0 }

const (
	WeaponSubclassAxe1H       WeaponSubclass = 0x00000001 // 0
	WeaponSubclassAxe2H       WeaponSubclass = 0x00000002 // 1
	WeaponSubclassBow         WeaponSubclass = 0x00000004 // 2
	WeaponSubclassGun         WeaponSubclass = 0x00000008 // 3
	WeaponSubclassMace1H      WeaponSubclass = 0x00000010 // 4
	WeaponSubclassMace2H      WeaponSubclass = 0x00000020 // 5
	WeaponSubclassPolearm     WeaponSubclass = 0x00000040 // 6
	WeaponSubclassSword1H     WeaponSubclass = 0x00000080 // 7
	WeaponSubclassSword2H     WeaponSubclass = 0x00000100 // 8
	WeaponSubclassObsolete    WeaponSubclass = 0x00000200 // 9
	WeaponSubclassStaff       WeaponSubclass = 0x00000400 // 10
	WeaponSubclassExotic1     WeaponSubclass = 0x00000800 // 11
	WeaponSubclassExotic2     WeaponSubclass = 0x00001000 // 12
	WeaponSubclassFist        WeaponSubclass = 0x00002000 // 13
	WeaponSubclassMisc        WeaponSubclass = 0x00004000 // 14 (tools, blacksmith hammer)
	WeaponSubclassDagger      WeaponSubclass = 0x00008000 // 15
	WeaponSubclassThrown      WeaponSubclass = 0x00010000 // 16
	WeaponSubclassSpear       WeaponSubclass = 0x00020000 // 17
	WeaponSubclassCrossbow    WeaponSubclass = 0x00040000 // 18
	WeaponSubclassWand        WeaponSubclass = 0x00080000 // 19
	WeaponSubclassFishingPole WeaponSubclass = 0x00100000 // 20
)

// Common weapon groups
const (
	WeaponSubclassAllSwords = WeaponSubclassSword1H | WeaponSubclassSword2H
	WeaponSubclassAllAxes   = WeaponSubclassAxe1H | WeaponSubclassAxe2H
	WeaponSubclassAllMaces  = WeaponSubclassMace1H | WeaponSubclassMace2H
	WeaponSubclassAllRanged = WeaponSubclassBow | WeaponSubclassGun | WeaponSubclassCrossbow
)

//go:generate stringer -type EquippedItemClass -trimprefix=EquippedItemClass
type EquippedItemClass int32

const (
	ItemClassConsumable    EquippedItemClass = 0
	ItemClassContainer     EquippedItemClass = 1 // Bags
	ItemClassWeapon        EquippedItemClass = 2
	ItemClassGem           EquippedItemClass = 3
	ItemClassArmor         EquippedItemClass = 4
	ItemClassReagent       EquippedItemClass = 5
	ItemClassProjectile    EquippedItemClass = 6 // Ammo
	ItemClassTradeGoods    EquippedItemClass = 7
	ItemClassGeneric       EquippedItemClass = 8 // Unused
	ItemClassRecipe        EquippedItemClass = 9
	ItemClassMoney         EquippedItemClass = 10 // Unused
	ItemClassQuiver        EquippedItemClass = 11
	ItemClassQuest         EquippedItemClass = 12
	ItemClassKey           EquippedItemClass = 13
	ItemClassPermanent     EquippedItemClass = 14 // Unused
	ItemClassMiscellaneous EquippedItemClass = 15
	ItemClassGlyph         EquippedItemClass = 16 // Later expansions
)

//go:generate stringer -type ArmorSubclass -trimprefix=ArmorSubclass

// ArmorSubclass is a bitmask for EquippedItemSubclass when ItemClass = Armor
type ArmorSubclass bitmask.Bitmask32

func (b ArmorSubclass) Has(flag ArmorSubclass) bool { return b&flag != 0 }

const (
	ArmorSubclassMisc    ArmorSubclass = 0x00000001 // 0 (miscellaneous)
	ArmorSubclassCloth   ArmorSubclass = 0x00000002 // 1
	ArmorSubclassLeather ArmorSubclass = 0x00000004 // 2
	ArmorSubclassMail    ArmorSubclass = 0x00000008 // 3
	ArmorSubclassPlate   ArmorSubclass = 0x00000010 // 4
	ArmorSubclassBuckler ArmorSubclass = 0x00000020 // 5 (obsolete)
	ArmorSubclassShield  ArmorSubclass = 0x00000040 // 6
	ArmorSubclassLibram  ArmorSubclass = 0x00000080 // 7 (Paladin relic)
	ArmorSubclassIdol    ArmorSubclass = 0x00000100 // 8 (Druid relic)
	ArmorSubclassTotem   ArmorSubclass = 0x00000200 // 9 (Shaman relic)
)

//go:generate stringer -type EquippedItemInvTypes -trimprefix=EquippedItemInvTypes
type EquippedItemInvTypes bitmask.Bitmask32

func (b EquippedItemInvTypes) Has(flag EquippedItemInvTypes) bool { return b&flag != 0 }

const (
	InvTypeHead        EquippedItemInvTypes = 0x00000001
	InvTypeNeck        EquippedItemInvTypes = 0x00000002
	InvTypeShoulder    EquippedItemInvTypes = 0x00000004
	InvTypeBody        EquippedItemInvTypes = 0x00000008 // Shirt
	InvTypeChest       EquippedItemInvTypes = 0x00000010
	InvTypeWaist       EquippedItemInvTypes = 0x00000020
	InvTypeLegs        EquippedItemInvTypes = 0x00000040
	InvTypeFeet        EquippedItemInvTypes = 0x00000080
	InvTypeWrists      EquippedItemInvTypes = 0x00000100
	InvTypeHands       EquippedItemInvTypes = 0x00000200
	InvTypeFinger      EquippedItemInvTypes = 0x00000400
	InvTypeTrinket     EquippedItemInvTypes = 0x00000800
	InvTypeOneHand     EquippedItemInvTypes = 0x00001000
	InvTypeShield      EquippedItemInvTypes = 0x00002000
	InvTypeRanged      EquippedItemInvTypes = 0x00004000 // Bow, Gun, Crossbow
	InvTypeBack        EquippedItemInvTypes = 0x00008000 // Cloak
	InvTypeTwoHand     EquippedItemInvTypes = 0x00010000
	InvTypeBag         EquippedItemInvTypes = 0x00020000
	InvTypeTabard      EquippedItemInvTypes = 0x00040000
	InvTypeRobe        EquippedItemInvTypes = 0x00080000
	InvTypeMainHand    EquippedItemInvTypes = 0x00100000
	InvTypeOffHand     EquippedItemInvTypes = 0x00200000
	InvTypeHoldable    EquippedItemInvTypes = 0x00400000 // Off-hand frill (books, orbs)
	InvTypeAmmo        EquippedItemInvTypes = 0x00800000
	InvTypeThrown      EquippedItemInvTypes = 0x01000000
	InvTypeRangedRight EquippedItemInvTypes = 0x02000000 // Wands
	InvType_END        EquippedItemInvTypes = 0x04000000 // Sentinel for iteration
)

//go:generate stringer -type AuraEffect -trimprefix=AuraEffect
type AuraEffect uint32

const (
	AuraEffectNone                           AuraEffect = iota // 0
	AuraEffectBindSight                                        // 1
	AuraEffectModPossess                                       // 2
	AuraEffectPeriodicDamage                                   // 3
	AuraEffectDummy                                            // 4
	AuraEffectModConfuse                                       // 5
	AuraEffectModCharm                                         // 6
	AuraEffectModFear                                          // 7
	AuraEffectPeriodicHeal                                     // 8
	AuraEffectModAttackspeed                                   // 9
	AuraEffectModThreat                                        // 10
	AuraEffectModTaunt                                         // 11
	AuraEffectModStun                                          // 12
	AuraEffectModDamageDone                                    // 13
	AuraEffectModDamageTaken                                   // 14
	AuraEffectDamageShield                                     // 15
	AuraEffectModStealth                                       // 16
	AuraEffectModStealth_DETECT                                // 17
	AuraEffectModInvisibility                                  // 18
	AuraEffectModInvisibilityDetect                            // 19
	AuraEffectObsModHealth                                     // 20 // 20 21 unofficial
	AuraEffectObsModPower                                      // 21
	AuraEffectModResistance                                    // 22
	AuraEffectPeriodicTriggerSpell                             // 23
	AuraEffectPeriodicEnergize                                 // 24
	AuraEffectModPacify                                        // 25
	AuraEffectModRoot                                          // 26
	AuraEffectModSilence                                       // 27
	AuraEffectReflectSpells                                    // 28
	AuraEffectModStat                                          // 29
	AuraEffectModSkill                                         // 30
	AuraEffectModIncreaseSpeed                                 // 31
	AuraEffectModIncreaseMountedSpeed                          // 32
	AuraEffectModDecreaseSpeed                                 // 33
	AuraEffectModIncreaseHealth                                // 34
	AuraEffectModIncreaseEnergy                                // 35
	AuraEffectModShapeshift                                    // 36
	AuraEffectEffectImmunity                                   // 37
	AuraEffectStateImmunity                                    // 38
	AuraEffectSchoolImmunity                                   // 39
	AuraEffectDamageImmunity                                   // 40
	AuraEffectDispelImmunity                                   // 41
	AuraEffectProcTriggerSpell                                 // 42
	AuraEffectProcTriggerDamage                                // 43
	AuraEffectTrackCreatures                                   // 44
	AuraEffectTrackResources                                   // 45
	AuraEffect46                                               // 46 // Ignore all Gear test spells
	AuraEffectModParryPercent                                  // 47
	AuraEffectPeriodicTriggerSpellFromClient                   // 48 // One periodic spell
	AuraEffectModDodgePercent                                  // 49
	AuraEffectModCriticalHealingAmount                         // 50
	AuraEffectModBlockPercent                                  // 51
	AuraEffectModWeaponCritPercent                             // 52
	AuraEffectPeriodicLeech                                    // 53
	AuraEffectModHitChance                                     // 54
	AuraEffectModSpellHitChance                                // 55
	AuraEffectTransform                                        // 56
	AuraEffectModSpellCritChance                               // 57
	AuraEffectModIncreaseSwimSpeed                             // 58
	AuraEffectModDamageDoneCreature                            // 59
	AuraEffectModPacifySilence                                 // 60
	AuraEffectModScale                                         // 61
	AuraEffectPeriodicHealthFunnel                             // 62
	AuraEffectModAdditionalPowerCost                           // 63
	AuraEffectPeriodicManaLeech                                // 64
	AuraEffectModCastingSpeed_NOT_STACK                        // 65
	AuraEffectFeignDeath                                       // 66
	AuraEffectModDisarm                                        // 67
	AuraEffectModStalked                                       // 68
	AuraEffectSchoolAbsorb                                     // 69
	AuraEffectPeriodicWeaponPercentDamage                      // 70
	AuraEffectStoreTeleportReturnPoint                         // 71
	AuraEffectModPowerCostSchoolPct                            // 72
	AuraEffectModPowerCostSchool                               // 73
	AuraEffectReflectSpells_SCHOOL                             // 74
	AuraEffectModLanguage                                      // 75
	AuraEffectFarSight                                         // 76
	AuraEffectMechanicImmunity                                 // 77
	AuraEffectMounted                                          // 78
	AuraEffectModDamagePercentDone                             // 79
	AuraEffectModPercentStat                                   // 80
	AuraEffectSplitDamagePct                                   // 81
	AuraEffectWaterBreathing                                   // 82
	AuraEffectModBaseResistance                                // 83
	AuraEffectModRegen                                         // 84
	AuraEffectModPowerRegen                                    // 85
	AuraEffectChannelDeathItem                                 // 86
	// AuraEffectModDamagePercentTaken uses the EffectMiscValue as a bitmask against the spell School.
	AuraEffectModDamagePercentTaken                    // 87
	AuraEffectModHealthRegenPercent                    // 88
	AuraEffectPeriodicDamagePercent                    // 89
	AuraEffect90                                       // 90 // old SPELL_AURA_MOD_RESIST_CHANCE
	AuraEffectModDetectRange                           // 91
	AuraEffectPreventsFleeing                          // 92
	AuraEffectModUnattackable                          // 93
	AuraEffectInterruptRegen                           // 94
	AuraEffectGhost                                    // 95
	AuraEffectSpellMagnet                              // 96
	AuraEffectManaShield                               // 97
	AuraEffectModSkillTalent                           // 98
	AuraEffectModAttackPower                           // 99
	AuraEffectAurasVisible                             // 100
	AuraEffectModResistancePct                         // 101
	AuraEffectModMeleeAttackPowerVersus                // 102
	AuraEffectModTotalThreat                           // 103
	AuraEffectWaterWalk                                // 104
	AuraEffectFeatherFall                              // 105
	AuraEffectHover                                    // 106
	AuraEffectAddFlatModifier                          // 107
	AuraEffectAddPctModifier                           // 108
	AuraEffectAddTargetTrigger                         // 109
	AuraEffectModPowerRegenPercent                     // 110
	AuraEffectInterceptMeleeRangedAttacks              // 111
	AuraEffectOverrideClassScripts                     // 112
	AuraEffectModRangedDamageTaken                     // 113
	AuraEffectModRangedDamageTaken_PCT                 // 114
	AuraEffectModHealing                               // 115
	AuraEffectModRegen_DURING_COMBAT                   // 116
	AuraEffectModMechanicResistance                    // 117
	AuraEffectModHealing_PCT                           // 118
	AuraEffectPvpTalents                               // 119
	AuraEffectUntrackable                              // 120
	AuraEffectEmpathy                                  // 121
	AuraEffectModOffhandDamagePct                      // 122
	AuraEffectModTargetResistance                      // 123
	AuraEffectModRangedAttackPower                     // 124
	AuraEffectModMeleeDamageTaken                      // 125
	AuraEffectModMeleeDamageTaken_PCT                  // 126
	AuraEffectRangedAttackPowerAttackerBonus           // 127
	AuraEffectModFixate                                // 128
	AuraEffectModSpeedAlways                           // 129
	AuraEffectModMountedSpeedAlways                    // 130
	AuraEffectModRangedAttackPowerVersus               // 131
	AuraEffectModIncreaseEnergy_PERCENT                // 132
	AuraEffectModIncreaseHealth_PERCENT                // 133
	AuraEffectModManaRegenInterrupt                    // 134
	AuraEffectModHealingDone                           // 135
	AuraEffectModHealingDone_PERCENT                   // 136
	AuraEffectModTotalStatPercentage                   // 137
	AuraEffectModMeleeHaste                            // 138
	AuraEffectForceReaction                            // 139
	AuraEffectModRangedHaste                           // 140
	AuraEffect141                                      // 141 // old SPELL_AURA_MOD_RANGED_AMMO_HASTE unused now
	AuraEffectModBaseResistance_PCT                    // 142
	AuraEffectModRecoveryRate_BY_SPELL_LABEL           // 143 // NYI
	AuraEffectSafeFall                                 // 144
	AuraEffectModIncreaseHealthPercent2                // 145
	AuraEffectAllowTamePetType                         // 146
	AuraEffectMechanicImmunity_MASK                    // 147
	AuraEffectModChargeRecoveryRate                    // 148 // NYI
	AuraEffectReducePushback                           // 149 //    Reduce Pushback
	AuraEffectModShieldBlockvaluePct                   // 150
	AuraEffectTrackStealthed                           // 151 //    Track Stealthed
	AuraEffectModDetectedRange                         // 152 //    Mod Detected Range
	AuraEffectModAutoattackRange                       // 153
	AuraEffectModStealth_LEVEL                         // 154 //    Stealth Level Modifier
	AuraEffectModWaterBreathing                        // 155 //    Mod Water Breathing
	AuraEffectModReputationGain                        // 156 //    Mod Reputation Gain
	AuraEffectPetDamageMulti                           // 157 //    Mod Pet Damage
	AuraEffectAllowTalentSwapping                      // 158
	AuraEffectNoPvpCredit                              // 159
	AuraEffect160                                      // 160 // old SPELL_AURA_MOD_AOE_AVOIDANCE. Unused 4.3.4
	AuraEffectModHealthRegenInCombat                   // 161
	AuraEffectPowerBurn                                // 162
	AuraEffectModCritDamageBonus                       // 163
	AuraEffectForceBreathBar                           // 164
	AuraEffectMeleeAttackPowerAttackerBonus            // 165
	AuraEffectModAttackPowerPct                        // 166
	AuraEffectModRangedAttackPowerPct                  // 167
	AuraEffectModDamageDoneVersus                      // 168
	AuraEffectSetFfaPvp                                // 169
	AuraEffectDetectAmore                              // 170
	AuraEffectModSpeedNotStack                         // 171
	AuraEffectModMountedSpeedNotStack                  // 172
	AuraEffectModRecoveryRate2                         // 173 // NYI
	AuraEffectModSpellDamageOfStatPercent              // 174 // by defeult intelect dependent from AuraEffectModSpellHealingOfStatPercent
	AuraEffectModSpellHealingOfStatPercent             // 175
	AuraEffectSpiritOfRedemption                       // 176
	AuraEffectAoeCharm                                 // 177
	AuraEffectModMaxPowerPct                           // 178
	AuraEffectModPowerDisplay                          // 179
	AuraEffectModFlatSpellDamageVersus                 // 180
	AuraEffectModSpellCurrencyReagentsCountPct         // 181 // NYI
	AuraEffectSuppressItemPassiveEffectBySpellLabel    // 182
	AuraEffectModCritChanceVersusTargetHealth          // 183
	AuraEffectModAttackerMeleeHitChance                // 184
	AuraEffectModAttackerRangedHitChance               // 185
	AuraEffectModAttackerSpellHitChance                // 186
	AuraEffectModAttackerMeleeCritChance               // 187
	AuraEffectModAttackerRangedCritChance              // 188
	AuraEffectModRating                                // 189
	AuraEffectModFactionReputationGain                 // 190
	AuraEffectUseNormalMovementSpeed                   // 191
	AuraEffectModMeleeRangedHaste                      // 192
	AuraEffectMeleeSlow                                // 193
	AuraEffectModTargetAbsorbSchool                    // 194
	AuraEffectLearnSpell                               // 195
	AuraEffectModCooldown                              // 196 // only 24818 Noxious Breath
	AuraEffectModAttackerSpellAndWeaponCritChance      // 197
	AuraEffectModCombatRatingFromCombatRating          // 198
	AuraEffect199                                      // 199 // old SPELL_AURA_MOD_INCREASES_SPELL_PCT_TO_HIT. unused 4.3.4
	AuraEffectModXpPct                                 // 200
	AuraEffectFly                                      // 201
	AuraEffectIgnoreCombatResult                       // 202
	AuraEffectPreventInterrupt                         // 203 // NYI
	AuraEffectPreventCorpseRelease                     // 204 // NYI
	AuraEffectModChargeCooldown                        // 205 // NYI
	AuraEffectModIncreaseVehicleFlightSpeed            // 206
	AuraEffectModIncreaseMountedFlightSpeed            // 207
	AuraEffectModIncreaseFlightSpeed                   // 208
	AuraEffectModMountedFlightSpeedAlways              // 209
	AuraEffectModVehicleSpeedAlways                    // 210
	AuraEffectModFlightSpeedNotStack                   // 211
	AuraEffectModHonorGainPct                          // 212
	AuraEffectModRageFromDamageDealt                   // 213
	AuraEffect214                                      // 214
	AuraEffectArenaPreparation                         // 215
	AuraEffectHasteSpells                              // 216
	AuraEffectModMeleeHaste_2                          // 217
	AuraEffectAddPctModifierBySpellLabel               // 218
	AuraEffectAddFlatModifier_BY_SPELL_LABEL           // 219
	AuraEffectModAbilitySchoolMask                     // 220 // NYI
	AuraEffectModDetaunt                               // 221
	AuraEffectRemoveTransmogCost                       // 222
	AuraEffectRemoveBarberShopCost                     // 223
	AuraEffectLearnTalent                              // 224 // NYI
	AuraEffectModVisibilityRange                       // 225
	AuraEffectPeriodicDummy                            // 226
	AuraEffectPeriodicTriggerSpell_WITH_VALUE          // 227
	AuraEffectDetectStealth                            // 228
	AuraEffectModAoeDamageAvoidance                    // 229
	AuraEffectModMaxHealth                             // 230
	AuraEffectProcTriggerSpell_WITH_VALUE              // 231
	AuraEffectMechanicDurationMod                      // 232
	AuraEffectChangeModelForAllHumanoids               // 233 // client-side only
	AuraEffectMechanicDurationMod_NOT_STACK            // 234
	AuraEffectModHoverNoHeightOffset                   // 235
	AuraEffectControlVehicle                           // 236
	AuraEffect237                                      // 237
	AuraEffect238                                      // 238
	AuraEffectModScale2                                // 239
	AuraEffectModExpertise                             // 240
	AuraEffectForceMoveForward                         // 241
	AuraEffectModSpellDamageFromHealing                // 242
	AuraEffectModFaction                               // 243
	AuraEffectComprehendLanguage                       // 244
	AuraEffectModAuraDurationByDispel                  // 245
	AuraEffectModAuraDurationByDispel_NOT_STACK        // 246
	AuraEffectCloneCaster                              // 247
	AuraEffectModCombatResultChance                    // 248
	AuraEffectModDamagePercentDoneByTargetAuraMechanic // 249 // NYI
	AuraEffectModIncreaseHealth_2                      // 250
	AuraEffectModEnemyDodge                            // 251
	AuraEffectModSpeedSlowAll                          // 252
	AuraEffectModBlockCritChance                       // 253
	AuraEffectModDisarm_OFFHAND                        // 254
	AuraEffectModMechanicDamageTakenPercent            // 255
	AuraEffectNoReagentUse                             // 256
	AuraEffectModTargetResistBySpellClass              // 257
	AuraEffectOverrideSummonedObject                   // 258
	AuraEffectModHotPct                                // 259
	AuraEffectScreenEffect                             // 260
	AuraEffectPhase                                    // 261
	AuraEffectAbilityIgnoreAurastate                   // 262
	AuraEffectDisableCastingExceptAbilities            // 263
	AuraEffectDisableAttackingExceptAbilities          // 264
	AuraEffect265                                      // 265
	AuraEffectSetVignette                              // 266 // NYI
	AuraEffectModImmuneAuraApplySchool                 // 267
	AuraEffectModArmorPctFromStat                      // 268
	AuraEffectModIgnoreTargetResist                    // 269
	AuraEffectModSchoolMaskDamageFromCaster            // 270
	AuraEffectModSpellDamageFromCaster                 // 271
	AuraEffectModBlockValuePct                         // 272 // NYI
	AuraEffectXRay                                     // 273
	AuraEffectModBlockValueFlat                        // 274 // NYI
	AuraEffectModIgnoreShapeshift                      // 275
	AuraEffectModDamageDoneForMechanic                 // 276
	AuraEffect277                                      // 277 // old SPELL_AURA_MOD_MAX_AFFECTED_TARGETS. unused 4.3.4
	AuraEffectModDisarmRanged                          // 278
	AuraEffectInitializeImages                         // 279
	AuraEffect280                                      // 280 // old SPELL_AURA_MOD_ARMOR_PENETRATION_PCT unused 4.3.4
	AuraEffectProvideSpellFocus                        // 281
	AuraEffectModBaseHealthPct                         // 282
	AuraEffectModHealing_RECEIVED                      // 283 // Possibly only for some spell family class spells
	AuraEffectLinked                                   // 284
	AuraEffectLinked2                                  // 285
	AuraEffectModRecoveryRate                          // 286
	AuraEffectDeflectSpells                            // 287
	AuraEffectIgnoreHitDirection                       // 288
	AuraEffectPreventDurabilityLoss                    // 289
	AuraEffectModCritPct                               // 290
	AuraEffectModXpQuestPct                            // 291
	AuraEffectOpenStable                               // 292
	AuraEffectOverrideSpells                           // 293
	AuraEffectPreventRegeneratePower                   // 294
	AuraEffectModPeriodicDamageTaken                   // 295
	AuraEffectSetVehicleId                             // 296
	AuraEffectModRootDisableGravity                    // 297 // NYI
	AuraEffectModStunDisableGravity                    // 298 // NYI
	AuraEffect299                                      // 299
	AuraEffectShareDamagePct                           // 300
	AuraEffectSchoolHealAbsorb                         // 301
	AuraEffect302                                      // 302
	AuraEffectModDamageDoneVersusAurastate             // 303
	AuraEffectModFakeInebriate                         // 304
	AuraEffectModMinimumSpeed                          // 305
	AuraEffectModCritChanceForCaster                   // 306
	AuraEffectCastWhileWalkingBySpellLabel             // 307
	AuraEffectModCritChanceForCasterWithAbilities      // 308
	AuraEffectModResilience                            // 309 // NYI
	AuraEffectModCreatureAoeDamageAvoidance            // 310
	AuraEffectIgnoreCombat                             // 311 // NYI
	AuraEffectAnimReplacementSet                       // 312
	AuraEffectMountAnimReplacementSet                  // 313
	AuraEffectPreventResurrection                      // 314
	AuraEffectUnderwaterWalking                        // 315
	AuraEffectSchoolAbsorbOverkill                     // 316 // NYI - absorbs overkill damage
	AuraEffectModSpellPowerPct                         // 317
	AuraEffectMastery                                  // 318
	AuraEffectModMeleeHaste_3                          // 319
	AuraEffect320                                      // 320
	AuraEffectModNoActions                             // 321
	AuraEffectInterfereTargetting                      // 322
	AuraEffect323                                      // 323 // Not used in 4.3.4
	AuraEffectOverrideUnlockedAzeriteEssenceRank       // 324 // testing aura
	AuraEffectLearnPvpTalent                           // 325 // NYI
	AuraEffectPhaseGroup                               //= 326             // Puts the player in all the phases that are in the group with id // miscB
	AuraEffectPhaseAlwaysVisible                       // 327 // Sets PhaseShiftFlags::AlwaysVisible
	AuraEffectTriggerSpellOnPowerPct                   //= 328             // Triggers spell when power goes above (MiscB = 0) or falls below (MiscB // 1) specified percent value (once not every time condition has meet)
	AuraEffectModPowerGainPct                          // 329
	AuraEffectCastWhileWalking                         // 330
	AuraEffectForceWeather                             // 331
	AuraEffectOverrideActionbarSpells                  // 332
	AuraEffectOverrideActionbarSpells_TRIGGERED        // 333 // Spells cast with this override have no cast time or power cost
	AuraEffectModAutoattackCritChance                  // 334
	AuraEffect335                                      // 335
	AuraEffectMountRestrictions                        // 336
	AuraEffectModVendorItemsPrices                     // 337
	AuraEffectModDurabilityLoss                        // 338
	AuraEffectModCritChanceForCaster_PET               // 339
	AuraEffectModResurrectedHealthByGuildMember        // 340 // Increases health gained when resurrected by a guild member by X
	AuraEffectModSpellCategoryCooldown                 // 341 // Modifies cooldown of all spells using affected category
	AuraEffectModMeleeRangedHaste_2                    // 342
	AuraEffectModMeleeDamageFromCaster                 // 343
	AuraEffectModAutoattackDamage                      // 344
	AuraEffectBypassArmorForCaster                     // 345
	AuraEffectEnableAltPower                           // 346
	AuraEffectModSpellCooldownByHaste                  // 347
	AuraEffectModMoneyGain                             //  = 348             // Modifies gold gains from source: [Misc = 0 Quests][Misc // 1 Loot]
	AuraEffectModCurrencyGain                          // 349
	AuraEffect350                                      // 350
	AuraEffectModCurrencyCategoryGainPct               // 351 // NYI
	AuraEffect352                                      // 352
	AuraEffectModCamouflage                            // 353 // NYI
	AuraEffectModHealingDone_PCT_VERSUS_TARGET_HEALTH  // = 354             // Restoration Shaman mastery - mod healing based on target's health (less // more healing)
	AuraEffectModCastingSpeed                          // 355 // NYI
	AuraEffectProvideTotemCategory                     // 356
	AuraEffectEnableBoss1UnitFrame                     // 357
	AuraEffectWorgenAlteredForm                        // 358
	AuraEffectModHealingDone_VERSUS_AURASTATE          // 359
	AuraEffectProcTriggerSpell_COPY                    // 360 // Procs the same spell that caused this proc (Dragonwrath Tarecgosa's Rest)
	AuraEffectOverrideAutoattackWithMeleeSpell         // 361
	AuraEffect362                                      // 362 // Not used in 4.3.4
	AuraEffectModNextSpell                             // 363 // Used by 101601 Throw Totem - causes the client to initialize spell cast with specified spell
	AuraEffect364                                      // 364 // Not used in 4.3.4
	AuraEffectMaxFarClipPlane                          // 365 // Overrides client's View Distance setting to max("Fair" current_setting) and turns off terrain display
	AuraEffectOverrideSpellPowerByApPct                // 366 // NYI - Sets spellpower equal to % of attack power discarding all other bonuses (from gear and buffs)
	AuraEffectOverrideAutoattackWithRangedSpell        // 367 // NYI
	AuraEffect368                                      // 368 // Not used in 4.3.4
	AuraEffectEnablePowerBarTimer                      // 369
	AuraEffectSpellOverrideNameGroup                   // 370 // picks a random SpellOverrideName id from a group (group id in miscValue)
	AuraEffect371                                      // 371
	AuraEffectOverrideMountFromSet                     // 372 // NYI
	AuraEffectModSpeedNoControl                        // 373 // NYI
	AuraEffectModifyFallDamagePct                      // 374
	AuraEffectHideModelAndEquipementSlots              // 375
	AuraEffectModCurrencyGainFromSource                // 376 // NYI
	AuraEffectCastWhileWalking_ALL                     // 377 // Enables casting all spells while moving
	AuraEffectModPossess_PET                           // 378
	AuraEffectModManaRegenPct                          // 379
	AuraEffect380                                      // 380
	AuraEffectModDamageTakenFromCasterPet              // 381 // NYI
	AuraEffectModPetStatPct                            // 382 // NYI
	AuraEffectIgnoreSpellCooldown                      // 383 // NYI
	AuraEffect384                                      // 384
	AuraEffect385                                      // 385
	AuraEffect386                                      // 386
	AuraEffect387                                      // 387
	AuraEffectModTaxiFlightSpeed                       // 388 // NYI
	AuraEffect389                                      // 389
	AuraEffect390                                      // 390
	AuraEffect391                                      // 391
	AuraEffect392                                      // 392
	AuraEffectBlockSpellsInFront                       // 393 // NYI
	AuraEffectShowConfirmationPrompt                   // 394
	AuraEffectAreaTrigger                              // 395 // NYI
	AuraEffectTriggerSpellOnPowerAmount                //  = 396             // Triggers spell when power goes above (MiscA = 0) or falls below (MiscA // 1) specified percent value (once not every time condition has meet)
	AuraEffectBattlegroundPlayerPosition_FACTIONAL     // 397
	AuraEffectBattlegroundPlayerPosition               // 398
	AuraEffectModTimeRate                              // 399
	AuraEffectModSkill_2                               // 400
	AuraEffect401                                      // 401
	AuraEffectModOverridePowerDisplay                  // 402
	AuraEffectOverrideSpellVisual                      // 403
	AuraEffectOverrideAttackPowerBySpPct               // 404
	AuraEffectModRatingPct                             // 405
	AuraEffectKeyboundOverride                         // 406 // NYI
	AuraEffectModFear2                                 // 407 // NYI
	AuraEffectSetActionButtonSpellCount                // 408
	AuraEffectCanTurnWhileFalling                      // 409
	AuraEffect410                                      // 410
	AuraEffectModMaxCharges                            // 411
	AuraEffect412                                      // 412
	AuraEffectModRangedAttackDeflectChance             // 413 // NYI
	AuraEffectModRangedAttackBlockChanceInFront        // 414 // NYI
	AuraEffect415                                      // 415
	AuraEffectModCooldownByHasteRegen                  // 416
	AuraEffectModGlobalCooldownByHasteRegen            // 417
	AuraEffectModMaxPower                              // 418 // NYI
	AuraEffectModBaseManaPct                           // 419
	AuraEffectModBattlePetXpPct                        // 420
	AuraEffectModAbsorbEffectsDonePct                  // 421 // NYI
	AuraEffectModAbsorbEffectsTakenPct                 // 422 // NYI
	AuraEffectModManaCostPct                           // 423
	AuraEffectCasterIgnoreLos                          // 424 // NYI
	AuraEffect425                                      // 425
	AuraEffect426                                      // 426
	AuraEffectScalePlayerLevel                         // 427 // NYI
	AuraEffectLinked_SUMMON                            // 428
	AuraEffectModSummonDamage                          // 429 // NYI - increases damage done by all summons not just controlled pets
	AuraEffectPlayScene                                // 430
	AuraEffectModOverrideZonePvpType                   // 431 // NYI
	AuraEffect432                                      // 432
	AuraEffect433                                      // 433
	AuraEffect434                                      // 434
	AuraEffect435                                      // 435
	AuraEffectModEnvironmentalDamageTaken              // 436
	AuraEffectModMinimumSpeed_RATE                     // 437
	AuraEffectPreloadPhase                             // 438 // NYI
	AuraEffect439                                      // 439
	AuraEffectModMultistrikeDamage                     // 440 // NYI
	AuraEffectModMultistrikeChance                     // 441 // NYI
	AuraEffectModReadiness                             // 442 // NYI
	AuraEffectModLeech                                 // 443 // NYI
	AuraEffect444                                      // 444
	AuraEffect445                                      // 445
	AuraEffect446                                      // 446
	AuraEffectModXpFromCreatureType                    // 447
	AuraEffect448                                      // 448
	AuraEffect449                                      // 449
	AuraEffect450                                      // 450
	AuraEffectOverridePetSpecs                         // 451
	AuraEffect452                                      // 452
	AuraEffectChargeRecoveryMod                        // 453
	AuraEffectChargeRecoveryMultiplier                 // 454
	AuraEffectModRoot_2                                // 455
	AuraEffectChargeRecoveryAffectedByHaste            // 456
	AuraEffectChargeRecoveryAffectedByHasteRegen       // 457
	AuraEffectIgnoreDualWieldHitPenalty                // 458
	AuraEffectIgnoreMovementForces                     // 459
	AuraEffectResetCooldownsOnDuelStart                // 460 // NYI
	AuraEffect461                                      // 461
	AuraEffectModHealing_AND_ABSORB_FROM_CASTER        // 462 // NYI
	AuraEffectConvertCritRatingPctToParryRating        // 463 // NYI
	AuraEffectModAttackPowerOfBonusArmor               // 464 // NYI
	AuraEffectModBonusArmor                            // 465
	AuraEffectModBonusArmor_PCT                        // 466 // Affects bonus armor gain from all sources except base stats
	AuraEffectModStat_BONUS_PCT                        // 467 // Affects stat gain from all sources except base stats
	AuraEffectTriggerSpellOnHealthPct                  // = 468 // Triggers spell when health goes above (MiscA = 0) or falls below (MiscA // 1) specified percent value (once not every time condition has meet)
	AuraEffectShowConfirmationPrompt_WITH_DIFFICULTY   // 469
	AuraEffectModAuraTimeRateBySpellLabel              // 470 // NYI
	AuraEffectModVersatility                           // 471
	AuraEffect472                                      // 472
	AuraEffectPreventDurabilityLoss_FROM_COMBAT        // 473 // Prevents durability loss from dealing/taking damage
	AuraEffectReplaceItemBonusTree                     // 474 // NYI
	AuraEffectAllowUsingGameobjectsWhileMounted        // 475
	AuraEffectModCurrencyGainLooted                    // 476
	AuraEffect477                                      // 477
	AuraEffect478                                      // 478
	AuraEffect479                                      // 479
	AuraEffectModArtifactItemLevel                     // 480
	AuraEffectConvertConsumedRune                      // 481
	AuraEffect482                                      // 482
	AuraEffectSuppressTransforms                       // 483 // NYI
	AuraEffectAllowInterruptSpell                      // 484 // NYI
	AuraEffectModMovementForceMagnitude                // 485
	AuraEffect486                                      // 486
	AuraEffectCosmeticMounted                          // 487
	AuraEffect488                                      // 488
	AuraEffectModAlternativeDefaultLanguage            // 489
	AuraEffect490                                      // 490
	AuraEffect491                                      // 491
	AuraEffect492                                      // 492
	AuraEffect493                                      // 493 // 1 spell 267116 - Animal Companion (modifies Call Pet)
	AuraEffectSetPowerPointCharge                      // 494 // NYI
	AuraEffectTriggerSpellOnExpire                     // 495
	AuraEffectAllowChangingEquipmentInTorghast         // 496 // NYI
	AuraEffectModAnimaGain                             // 497 // NYI
	AuraEffectCurrencyLossPctOnDeath                   // 498 // NYI
	AuraEffectModRestedXpConsumption                   // 499
	AuraEffectIgnoreSpellChargeCooldown                // 500 // NYI
	AuraEffectModCriticalDamageTakenFromCaster         // 501
	AuraEffectModVersatility_DAMAGE_DONE_BENEFIT       // 502 // NYI
	AuraEffectModVersatility_HEALING_DONE_BENEFIT      // 503 // NYI
	AuraEffectModHealingTakenFromCaster                // 504
	AuraEffectModPlayerChoiceRerolls                   // 505 // NYI
	AuraEffectDisableInertia                           // 506
	AuraEffect507                                      // 507
	AuraEffect508                                      // 508
	AuraEffect509                                      // 509
	AuraEffectModifiedRaidInstance                     // 510 // Related to "Fated" raid affixes
	NumAuraEffects                                     // 511
)

//go:generate stringer -type Effect -trimprefix Effect
type Effect int

const (
	EffectNone                                 Effect = iota
	EffectInstaKill                                   //  1 SPELL_EFFECT_INSTAKILL
	EffectSchoolDMG                                   //  2 SPELL_EFFECT_SCHOOL_DAMAGE
	EffectDummy                                       //  3 SPELL_EFFECT_DUMMY
	EffectPortalTeleport                              //  4 SPELL_EFFECT_PORTAL_TELEPORT          unused
	Effect5                                           //  5 SPELL_EFFECT_5
	EffectApplyAura                                   //  6 SPELL_EFFECT_APPLY_AURA
	EffectEnvironmentalDMG                            //  7 SPELL_EFFECT_ENVIRONMENTAL_DAMAGE
	EffectPowerDrain                                  //  8 SPELL_EFFECT_POWER_DRAIN
	EffectHealthLeech                                 //  9 SPELL_EFFECT_HEALTH_LEECH
	EffectHeal                                        // 10 SPELL_EFFECT_HEAL
	EffectBind                                        // 11 SPELL_EFFECT_BIND
	EffectPortal                                      // 12 SPELL_EFFECT_PORTAL
	EffectTeleportToReturnPoint                       // 13 SPELL_EFFECT_TELEPORT_TO_RETURN_POINT
	EffectIncreaseCurrencyCap                         // 14 SPELL_EFFECT_INCREASE_CURRENCY_CAP
	EffectTeleportUnitsWithVisualLoadingScreen        // 15 SPELL_EFFECT_TELEPORT_WITH_SPELL_VISUAL_KIT_LOADING_SCREEN
	EffectQuestComplete                               // 16 SPELL_EFFECT_QUEST_COMPLETE
	EffectWeaponDamageNoSchool                        // 17 SPELL_EFFECT_WEAPON_DAMAGE_NOSCHOOL
	EffectResurrect                                   // 18 SPELL_EFFECT_RESURRECT
	EffectAddExtraAttacks                             // 19 SPELL_EFFECT_ADD_EXTRA_ATTACKS
	EffectDodge                                       // 20 SPELL_EFFECT_DODGE                    one spell: Dodge
	EffectEvade                                       // 21 SPELL_EFFECT_EVADE                    one spell: Evade (DND)
	EffectParry                                       // 22 SPELL_EFFECT_PARRY
	EffectBlock                                       // 23 SPELL_EFFECT_BLOCK                    one spell: Block
	EffectCreateItem                                  // 24 SPELL_EFFECT_CREATE_ITEM
	EffectWeapon                                      // 25 SPELL_EFFECT_WEAPON
	EffectDefense                                     // 26 SPELL_EFFECT_DEFENSE                  one spell: Defense
	EffectPersistentAA                                // 27 SPELL_EFFECT_PERSISTENT_AREA_AURA
	EffectSummonType                                  // 28 SPELL_EFFECT_SUMMON
	EffectLeap                                        // 29 SPELL_EFFECT_LEAP
	EffectEnergize                                    // 30 SPELL_EFFECT_ENERGIZE
	EffectWeaponPercentDamage                         // 31 SPELL_EFFECT_WEAPON_PERCENT_DAMAGE
	EffectTriggerMissile                              // 32 SPELL_EFFECT_TRIGGER_MISSILE
	EffectOpenLock                                    // 33 SPELL_EFFECT_OPEN_LOCK
	EffectSummonChangeItem                            // 34 SPELL_EFFECT_SUMMON_CHANGE_ITEM
	EffectApplyAreaAuraParty                          // 35 SPELL_EFFECT_APPLY_AREA_AURA_PARTY
	EffectLearnSpell                                  // 36 SPELL_EFFECT_LEARN_SPELL
	EffectSpellDefense                                // 37 SPELL_EFFECT_SPELL_DEFENSE            one spell: SPELLDEFENSE (DND)
	EffectDispel                                      // 38 SPELL_EFFECT_DISPEL
	EffectLanguage                                    // 39 SPELL_EFFECT_LANGUAGE
	EffectDualWield                                   // 40 SPELL_EFFECT_DUAL_WIELD
	EffectJump                                        // 41 SPELL_EFFECT_JUMP
	EffectJumpDest                                    // 42 SPELL_EFFECT_JUMP_DEST
	EffectTeleUnitsFaceCaster                         // 43 SPELL_EFFECT_TELEPORT_UNITS_FACE_CASTER
	EffectLearnSkill                                  // 44 SPELL_EFFECT_SKILL_STEP
	EffectPlayMovie                                   // 45 SPELL_EFFECT_PLAY_MOVIE
	EffectSpawn                                       // 46 SPELL_EFFECT_SPAWN clientside unit appears as if it was just spawned
	EffectTradeSkill                                  // 47 SPELL_EFFECT_TRADE_SKILL
	EffectStealth                                     // 48 SPELL_EFFECT_STEALTH                  one spell: Base Stealth
	EffectDetect                                      // 49 SPELL_EFFECT_DETECT                   one spell: Detect
	EffectTransmitted                                 // 50 SPELL_EFFECT_TRANS_DOOR
	EffectForceCriticalHit                            // 51 SPELL_EFFECT_FORCE_CRITICAL_HIT       unused
	EffectSetMaxBattlePetCount                        // 52 SPELL_EFFECT_SET_MAX_BATTLE_PET_COUNT
	EffectEnchantItemPerm                             // 53 SPELL_EFFECT_ENCHANT_ITEM
	EffectEnchantItemTmp                              // 54 SPELL_EFFECT_ENCHANT_ITEM_TEMPORARY
	EffectTameCreature                                // 55 SPELL_EFFECT_TAMECREATURE
	EffectSummonPet                                   // 56 SPELL_EFFECT_SUMMON_PET
	EffectLearnPetSpell                               // 57 SPELL_EFFECT_LEARN_PET_SPELL
	EffectWeaponDamage                                // 58 SPELL_EFFECT_WEAPON_DAMAGE
	EffectCreateRandomItem                            // 59 SPELL_EFFECT_CREATE_RANDOM_ITEM       create item base at spell specific loot
	EffectProficiency                                 // 60 SPELL_EFFECT_PROFICIENCY
	EffectSendEvent                                   // 61 SPELL_EFFECT_SEND_EVENT
	EffectPowerBurn                                   // 62 SPELL_EFFECT_POWER_BURN
	EffectThreat                                      // 63 SPELL_EFFECT_THREAT
	EffectTriggerSpell                                // 64 SPELL_EFFECT_TRIGGER_SPELL
	EffectApplyAreaAuraRaid                           // 65 SPELL_EFFECT_APPLY_AREA_AURA_RAID
	EffectRechargeItem                                // 66 SPELL_EFFECT_RECHARGE_ITEM
	EffectHealMaxHealth                               // 67 SPELL_EFFECT_HEAL_MAX_HEALTH
	EffectInterruptCast                               // 68 SPELL_EFFECT_INTERRUPT_CAST
	EffectDistract                                    // 69 SPELL_EFFECT_DISTRACT
	EffectCompleteAndRewardWorldQuest                 // 70 SPELL_EFFECT_COMPLETE_AND_REWARD_WORLD_QUEST
	EffectPickPocket                                  // 71 SPELL_EFFECT_PICKPOCKET
	EffectAddFarsight                                 // 72 SPELL_EFFECT_ADD_FARSIGHT
	EffectUntrainTalents                              // 73 SPELL_EFFECT_UNTRAIN_TALENTS
	EffectApplyGlyph                                  // 74 SPELL_EFFECT_APPLY_GLYPH
	EffectHealMechanical                              // 75 SPELL_EFFECT_HEAL_MECHANICAL          one spell: Mechanical Patch Kit
	EffectSummonObjectWild                            // 76 SPELL_EFFECT_SUMMON_OBJECT_WILD
	EffectScriptEffect                                // 77 SPELL_EFFECT_SCRIPT_EFFECT
	EffectAttack                                      // 78 SPELL_EFFECT_ATTACK
	EffectSanctuary                                   // 79 SPELL_EFFECT_SANCTUARY
	EffectModifyFollowerItemLevel                     // 80 SPELL_EFFECT_MODIFY_FOLLOWER_ITEM_LEVEL
	EffectPushAbilityToActionBar                      // 81 SPELL_EFFECT_PUSH_ABILITY_TO_ACTION_BAR
	EffectBindSight                                   // 82 SPELL_EFFECT_BIND_SIGHT
	EffectDuel                                        // 83 SPELL_EFFECT_DUEL
	EffectStuck                                       // 84 SPELL_EFFECT_STUCK
	EffectSummonPlayer                                // 85 SPELL_EFFECT_SUMMON_PLAYER
	EffectActivateObject                              // 86 SPELL_EFFECT_ACTIVATE_OBJECT
	EffectGameObjectDamage                            // 87 SPELL_EFFECT_GAMEOBJECT_DAMAGE
	EffectGameObjectRepair                            // 88 SPELL_EFFECT_GAMEOBJECT_REPAIR
	EffectGameObjectSetDestructionState               // 89 SPELL_EFFECT_GAMEOBJECT_SET_DESTRUCTION_STATE
	EffectKillCreditPersonal                          // 90 SPELL_EFFECT_KILL_CREDIT              Kill credit but only for single person
	EffectThreatAll                                   // 91 SPELL_EFFECT_THREAT_ALL
	EffectEnchantHeldItem                             // 92 SPELL_EFFECT_ENCHANT_HELD_ITEM
	EffectForceDeselect                               // 93 SPELL_EFFECT_FORCE_DESELECT
	EffectSelfResurrect                               // 94 SPELL_EFFECT_SELF_RESURRECT
	EffectSkinning                                    // 95 SPELL_EFFECT_SKINNING
	EffectCharge                                      // 96 SPELL_EFFECT_CHARGE
	EffectCastButtons                                 // 97 SPELL_EFFECT_CAST_BUTTON (totem bar since 3.2.2a)
	EffectKnockBack                                   // 98 SPELL_EFFECT_KNOCK_BACK
	EffectDisEnchant                                  // 99 SPELL_EFFECT_DISENCHANT
	EffectInebriate                                   //100 SPELL_EFFECT_INEBRIATE
	EffectFeedPet                                     //101 SPELL_EFFECT_FEED_PET
	EffectDismissPet                                  //102 SPELL_EFFECT_DISMISS_PET
	EffectReputation                                  //103 SPELL_EFFECT_REPUTATION
	EffectSummonObject                                //104 SPELL_EFFECT_SUMMON_OBJECT_SLOT1
	EffectSurvey                                      //105 SPELL_EFFECT_SURVEY
	EffectChangeRaidMarker                            //106 SPELL_EFFECT_CHANGE_RAID_MARKER
	EffectShowCorpseLoot                              //107 SPELL_EFFECT_SHOW_CORPSE_LOOT
	EffectDispelMechanic                              //108 SPELL_EFFECT_DISPEL_MECHANIC
	EffectResurrectPet                                //109 SPELL_EFFECT_RESURRECT_PET
	EffectDestroyAllTotems                            //110 SPELL_EFFECT_DESTROY_ALL_TOTEMS
	EffectDurabilityDamage                            //111 SPELL_EFFECT_DURABILITY_DAMAGE
	Effect112                                         //112 SPELL_EFFECT_112
	EffectCancelConversation                          //113 SPELL_EFFECT_CANCEL_CONVERSATION
	EffectTaunt                                       //114 SPELL_EFFECT_ATTACK_ME
	EffectDurabilityDamagePCT                         //115 SPELL_EFFECT_DURABILITY_DAMAGE_PCT
	EffectSkinPlayerCorpse                            //116 SPELL_EFFECT_SKIN_PLAYER_CORPSE       one spell: Remove Insignia bg usage required special corpse flags...
	EffectSpiritHeal                                  //117 SPELL_EFFECT_SPIRIT_HEAL              one spell: Spirit Heal
	EffectSkill                                       //118 SPELL_EFFECT_SKILL                    professions and more
	EffectApplyAreaAuraPet                            //119 SPELL_EFFECT_APPLY_AREA_AURA_PET
	EffectTeleportGraveyard                           //120 SPELL_EFFECT_TELEPORT_GRAVEYARD
	EffectWeaponDmg                                   //121 SPELL_EFFECT_NORMALIZED_WEAPON_DMG
	Effect122                                         //122 SPELL_EFFECT_122                      unused
	EffectSendTaxi                                    //123 SPELL_EFFECT_SEND_TAXI                taxi/flight related (misc value is taxi path id)
	EffectPullTowards                                 //124 SPELL_EFFECT_PULL_TOWARDS
	EffectModifyThreatPercent                         //125 SPELL_EFFECT_MODIFY_THREAT_PERCENT
	EffectStealBeneficialBuff                         //126 SPELL_EFFECT_STEAL_BENEFICIAL_BUFF    spell steal effect?
	EffectProspecting                                 //127 SPELL_EFFECT_PROSPECTING              Prospecting spell
	EffectApplyAreaAuraFriend                         //128 SPELL_EFFECT_APPLY_AREA_AURA_FRIEND
	EffectApplyAreaAuraEnemy                          //129 SPELL_EFFECT_APPLY_AREA_AURA_ENEMY
	EffectRedirectThreat                              //130 SPELL_EFFECT_REDIRECT_THREAT
	EffectPlaySound                                   //131 SPELL_EFFECT_PLAY_SOUND               sound id in misc value (SoundEntries.dbc)
	EffectPlayMusic                                   //132 SPELL_EFFECT_PLAY_MUSIC               sound id in misc value (SoundEntries.dbc)
	EffectUnlearnSpecialization                       //133 SPELL_EFFECT_UNLEARN_SPECIALIZATION   unlearn profession specialization
	EffectKillCredit                                  //134 SPELL_EFFECT_KILL_CREDIT              misc value is creature entry
	EffectCallPet                                     //135 SPELL_EFFECT_CALL_PET
	EffectHealPct                                     //136 SPELL_EFFECT_HEAL_PCT
	EffectEnergizePct                                 //137 SPELL_EFFECT_ENERGIZE_PCT
	EffectLeapBack                                    //138 SPELL_EFFECT_LEAP_BACK                Leap back
	EffectQuestClear                                  //139 SPELL_EFFECT_CLEAR_QUEST              Reset quest status (miscValue - quest ID)
	EffectForceCast                                   //140 SPELL_EFFECT_FORCE_CAST
	EffectForceCastWithValue                          //141 SPELL_EFFECT_FORCE_CAST_WITH_VALUE
	EffectTriggerSpellWithValue                       //142 SPELL_EFFECT_TRIGGER_SPELL_WITH_VALUE
	EffectApplyAreaAuraOwner                          //143 SPELL_EFFECT_APPLY_AREA_AURA_OWNER
	EffectKnockBackDest                               //144 SPELL_EFFECT_KNOCK_BACK_DEST
	EffectPullTowardsDest                             //145 SPELL_EFFECT_PULL_TOWARDS_DEST        Black Hole Effect
	EffectRestoreGarrisonTroopVitality                //146 SPELL_EFFECT_RESTORE_GARRISON_TROOP_VITALITY
	EffectQuestFail                                   //147 SPELL_EFFECT_QUEST_FAIL               quest fail
	EffectTriggerMissileSpell                         //148 SPELL_EFFECT_TRIGGER_MISSILE_SPELL_WITH_VALUE
	EffectChargeDest                                  //149 SPELL_EFFECT_CHARGE_DEST
	EffectQuestStart                                  //150 SPELL_EFFECT_QUEST_START
	EffectTriggerRitualOfSummoning                    //151 SPELL_EFFECT_TRIGGER_SPELL_2
	EffectSummonRaFFriend                             //152 SPELL_EFFECT_SUMMON_RAF_FRIEND        summon Refer-a-Friend
	EffectCreateTamedPet                              //153 SPELL_EFFECT_CREATE_TAMED_PET         misc value is creature entry
	EffectDiscoverTaxi                                //154 SPELL_EFFECT_DISCOVER_TAXI
	EffectTitanGrip                                   //155 SPELL_EFFECT_TITAN_GRIP Allows you to equip two-handed axes maces and swords in one hand but you attack $49152s1% slower than normal.
	EffectEnchantItemPrismatic                        //156 SPELL_EFFECT_ENCHANT_ITEM_PRISMATIC
	EffectCreateItem2                                 //157 SPELL_EFFECT_CREATE_ITEM_2            create item or create item template and replace by some randon spell loot item
	EffectMilling                                     //158 SPELL_EFFECT_MILLING                  milling
	EffectRenamePet                                   //159 SPELL_EFFECT_ALLOW_RENAME_PET         allow rename pet once again
	EffectForceCast2                                  //160 SPELL_EFFECT_FORCE_CAST_2
	EffectTalentSpecCount                             //161 SPELL_EFFECT_TALENT_SPEC_COUNT        second talent spec (learn/revert)
	EffectActivateSpec                                //162 SPELL_EFFECT_TALENT_SPEC_SELECT       activate primary/secondary spec
	EffectObliterateItem                              //163 SPELL_EFFECT_OBLITERATE_ITEM
	EffectRemoveAura                                  //164 SPELL_EFFECT_REMOVE_AURA
	EffectDamageFromMaxHealthPCT                      //165 SPELL_EFFECT_DAMAGE_FROM_MAX_HEALTH_PCT
	EffectGiveCurrency                                //166 SPELL_EFFECT_GIVE_CURRENCY
	EffectUpdatePlayerPhase                           //167 SPELL_EFFECT_UPDATE_PLAYER_PHASE
	EffectAllowControlPet                             //168 SPELL_EFFECT_ALLOW_CONTROL_PET
	EffectDestroyItem                                 //169 SPELL_EFFECT_DESTROY_ITEM
	EffectUpdateZoneAurasAndPhases                    //170 SPELL_EFFECT_UPDATE_ZONE_AURAS_AND_PHASES
	EffectSummonPersonalGameObject                    //171 SPELL_EFFECT_SUMMON_PERSONAL_GAMEOBJECT
	EffectResurrectWithAura                           //172 SPELL_EFFECT_RESURRECT_WITH_AURA
	EffectUnlockGuildVaultTab                         //173 SPELL_EFFECT_UNLOCK_GUILD_VAULT_TAB
	EffectApplyAuraOnPet                              //174 SPELL_EFFECT_APPLY_AURA_ON_PET
	Effect175                                         //175 SPELL_EFFECT_175
	EffectSanctuary2                                  //176 SPELL_EFFECT_SANCTUARY_2
	EffectDespawnPersistentAreaAura                   //177 SPELL_EFFECT_DESPAWN_PERSISTENT_AREA_AURA
	Effect178                                         //178 SPELL_EFFECT_178 unused
	EffectCreateAreaTrigger                           //179 SPELL_EFFECT_CREATE_AREATRIGGER
	EffectUpdateAreaTrigger                           //180 SPELL_EFFECT_UPDATE_AREATRIGGER
	EffectRemoveTalent                                //181 SPELL_EFFECT_REMOVE_TALENT
	EffectDespawnAreaTrigger                          //182 SPELL_EFFECT_DESPAWN_AREATRIGGER
	Effect183                                         //183 SPELL_EFFECT_183
	EffectReputation2                                 //184 SPELL_EFFECT_REPUTATION
	Effect185                                         //185 SPELL_EFFECT_185
	Effect186                                         //186 SPELL_EFFECT_186
	EffectRandomizeArchaeologyDigsites                //187 SPELL_EFFECT_RANDOMIZE_ARCHAEOLOGY_DIGSITES
	EffectSummonStabledPetAsGuardian                  //188 SPELL_EFFECT_SUMMON_STABLED_PET_AS_GUARDIAN
	EffectLoot                                        //189 SPELL_EFFECT_LOOT
	EffectChangePartyMembers                          //190 SPELL_EFFECT_CHANGE_PARTY_MEMBERS
	EffectTeleportToDigsite                           //191 SPELL_EFFECT_TELEPORT_TO_DIGSITE
	EffectUncageBattlePet                             //192 SPELL_EFFECT_UNCAGE_BATTLEPET
	EffectStartPetBattle                              //193 SPELL_EFFECT_START_PET_BATTLE
	Effect194                                         //194 SPELL_EFFECT_194
	EffectPlaySceneScriptPackage                      //195 SPELL_EFFECT_PLAY_SCENE_SCRIPT_PACKAGE
	EffectCreateSceneObject                           //196 SPELL_EFFECT_CREATE_SCENE_OBJECT
	EffectCreatePrivateSceneObject                    //197 SPELL_EFFECT_CREATE_PERSONAL_SCENE_OBJECT
	EffectPlayScene                                   //198 SPELL_EFFECT_PLAY_SCENE
	EffectDespawnSummon                               //199 SPELL_EFFECT_DESPAWN_SUMMON
	EffectHealBattlePetPct                            //200 SPELL_EFFECT_HEAL_BATTLEPET_PCT
	EffectEnableBattlePets                            //201 SPELL_EFFECT_ENABLE_BATTLE_PETS
	EffectApplyAreaAuraSummons                        //202 SPELL_EFFECT_APPLY_AREA_AURA_SUMMONS
	EffectRemoveAura2                                 //203 SPELL_EFFECT_REMOVE_AURA_2
	EffectChangeBattlePetQuality                      //204 SPELL_EFFECT_CHANGE_BATTLEPET_QUALITY
	EffectLaunchQuestChoice                           //205 SPELL_EFFECT_LAUNCH_QUEST_CHOICE
	EffectAlterItem                                   //206 SPELL_EFFECT_ALTER_ITEM
	EffectLaunchQuestTask                             //207 SPELL_EFFECT_LAUNCH_QUEST_TASK
	EffectSetReputation                               //208 SPELL_EFFECT_SET_REPUTATION
	Effect209                                         //209 SPELL_EFFECT_209
	EffectLearnGarrisonBuilding                       //210 SPELL_EFFECT_LEARN_GARRISON_BUILDING
	EffectLearnGarrisonSpecialization                 //211 SPELL_EFFECT_LEARN_GARRISON_SPECIALIZATION
	EffectRemoveAuraBySpellLabel                      //212 SPELL_EFFECT_REMOVE_AURA_BY_SPELL_LABEL
	EffectJumpDest2                                   //213 SPELL_EFFECT_JUMP_DEST_2
	EffectCreateGarrison                              //214 SPELL_EFFECT_CREATE_GARRISON
	EffectUpgradeCharacterSpells                      //215 SPELL_EFFECT_UPGRADE_CHARACTER_SPELLS
	EffectCreateShipment                              //216 SPELL_EFFECT_CREATE_SHIPMENT
	EffectUpgradeGarrison                             //217 SPELL_EFFECT_UPGRADE_GARRISON
	Effect218                                         //218 SPELL_EFFECT_218
	EffectCreateConversation                          //219 SPELL_EFFECT_CREATE_CONVERSATION
	EffectAddGarrisonFollower                         //220 SPELL_EFFECT_ADD_GARRISON_FOLLOWER
	EffectAddGarrisonMission                          //221 SPELL_EFFECT_ADD_GARRISON_MISSION
	EffectCreateHeirloomItem                          //222 SPELL_EFFECT_CREATE_HEIRLOOM_ITEM
	EffectChangeItemBonuses                           //223 SPELL_EFFECT_CHANGE_ITEM_BONUSES
	EffectActivateGarrisonBuilding                    //224 SPELL_EFFECT_ACTIVATE_GARRISON_BUILDING
	EffectGrantBattlePetLevel                         //225 SPELL_EFFECT_GRANT_BATTLEPET_LEVEL
	EffectTriggerActionSet                            //226 SPELL_EFFECT_TRIGGER_ACTION_SET
	EffectTeleportToLFGDungeon                        //227 SPELL_EFFECT_TELEPORT_TO_LFG_DUNGEON
	Effect228                                         //228 SPELL_EFFECT_228
	EffectSetFollowerQuality                          //229 SPELL_EFFECT_SET_FOLLOWER_QUALITY
	Effect230                                         //230 SPELL_EFFECT_230
	EffectIncreaseFollowerExperience                  //231 SPELL_EFFECT_INCREASE_FOLLOWER_EXPERIENCE
	EffectRemovePhase                                 //232 SPELL_EFFECT_REMOVE_PHASE
	EffectRandomizeFollowerAbilities                  //233 SPELL_EFFECT_RANDOMIZE_FOLLOWER_ABILITIES
	Effect234                                         //234 SPELL_EFFECT_234
	Effect235                                         //235 SPELL_EFFECT_235
	EffectGiveExperience                              //236 SPELL_EFFECT_GIVE_EXPERIENCE
	EffectGiveRestedExperienceBonus                   //237 SPELL_EFFECT_GIVE_RESTED_EXPERIENCE_BONUS
	EffectIncreaseSkill                               //238 SPELL_EFFECT_INCREASE_SKILL
	EffectEndGarrisonBuildingConstruction             //239 SPELL_EFFECT_END_GARRISON_BUILDING_CONSTRUCTION
	EffectGiveArtifactPower                           //240 SPELL_EFFECT_GIVE_ARTIFACT_POWER
	Effect241                                         //241 SPELL_EFFECT_241
	EffectGiveArtifactPowerNoBonus                    //242 SPELL_EFFECT_GIVE_ARTIFACT_POWER_NO_BONUS
	EffectApplyEnchantIllusion                        //243 SPELL_EFFECT_APPLY_ENCHANT_ILLUSION
	EffectLearnFollowerAbility                        //244 SPELL_EFFECT_LEARN_FOLLOWER_ABILITY
	EffectUpgradeHeirloom                             //245 SPELL_EFFECT_UPGRADE_HEIRLOOM
	EffectFinishGarrisonMission                       //246 SPELL_EFFECT_FINISH_GARRISON_MISSION
	EffectAddGarrisonMissionSet                       //247 SPELL_EFFECT_ADD_GARRISON_MISSION_SET
	EffectFinishShipment                              //248 SPELL_EFFECT_FINISH_SHIPMENT
	EffectForceEquipItem                              //249 SPELL_EFFECT_FORCE_EQUIP_ITEM
	EffectTakeScreenshot                              //250 SPELL_EFFECT_TAKE_SCREENSHOT
	EffectSetGarrisonCacheSize                        //251 SPELL_EFFECT_SET_GARRISON_CACHE_SIZE
	EffectTeleportUnits                               //252 SPELL_EFFECT_TELEPORT_UNITS
	EffectGiveHonor                                   //253 SPELL_EFFECT_GIVE_HONOR
	EffectJumpCharge                                  //254 SPELL_EFFECT_JUMP_CHARGE
	EffectLearnTransmogSet                            //255 SPELL_EFFECT_LEARN_TRANSMOG_SET
	Effect256                                         //256 SPELL_EFFECT_256
	Effect257                                         //257 SPELL_EFFECT_257
	EffectModifyKeystone                              //258 SPELL_EFFECT_MODIFY_KEYSTONE
	EffectRespecAzeriteEmpoweredItem                  //259 SPELL_EFFECT_RESPEC_AZERITE_EMPOWERED_ITEM
	EffectSummonStabledPet                            //260 SPELL_EFFECT_SUMMON_STABLED_PET
	EffectScrapItem                                   //261 SPELL_EFFECT_SCRAP_ITEM
	Effect262                                         //262 SPELL_EFFECT_262
	EffectRepairItem                                  //263 SPELL_EFFECT_REPAIR_ITEM
	EffectRemoveGem                                   //264 SPELL_EFFECT_REMOVE_GEM
	EffectLearnAzeriteEssencePower                    //265 SPELL_EFFECT_LEARN_AZERITE_ESSENCE_POWER
	EffectSetItemBonusListGroupEntry                  //266 SPELL_EFFECT_SET_ITEM_BONUS_LIST_GROUP_ENTRY
	EffectCreatePrivateConversation                   //267 SPELL_EFFECT_CREATE_PRIVATE_CONVERSATION
	EffectApplyMountEquipment                         //268 SPELL_EFFECT_APPLY_MOUNT_EQUIPMENT
	EffectIncreaseItemBonusListGroupStep              //269 SPELL_EFFECT_INCREASE_ITEM_BONUS_LIST_GROUP_STEP
	Effect270                                         //270 SPELL_EFFECT_270
	EffectApplyAreaAuraPartyNonRandom                 //271 SPELL_EFFECT_APPLY_AREA_AURA_PARTY_NONRANDOM
	EffectSetCovenant                                 //272 SPELL_EFFECT_SET_COVENANT
	EffectCraftRuneforgeLegendary                     //273 SPELL_EFFECT_CRAFT_RUNEFORGE_LEGENDARY
	Effect274                                         //274 SPELL_EFFECT_274
	Effect275                                         //275 SPELL_EFFECT_275
	EffectLearnTransmogIllusion                       //276 SPELL_EFFECT_LEARN_TRANSMOG_ILLUSION
	EffectSetChromieTime                              //277 SPELL_EFFECT_SET_CHROMIE_TIME
	Effect278                                         //278 SPELL_EFFECT_278
	EffectLearnGarrTalent                             //279 SPELL_EFFECT_LEARN_GARR_TALENT
	Effect280                                         //280 SPELL_EFFECT_280
	EffectLearnSoulbindConduit                        //281 SPELL_EFFECT_LEARN_SOULBIND_CONDUIT
	EffectConvertItemsToCurrency                      //282 SPELL_EFFECT_CONVERT_ITEMS_TO_CURRENCY
	EffectCompleteCampaign                            //283 SPELL_EFFECT_COMPLETE_CAMPAIGN
	EffectSendChatMessage                             //284 SPELL_EFFECT_SEND_CHAT_MESSAGE
	EffectModifyKeystone2                             //285 SPELL_EFFECT_MODIFY_KEYSTONE_2
	EffectGrantBattlePetExperience                    //286 SPELL_EFFECT_GRANT_BATTLEPET_EXPERIENCE
	EffectSetGarrisonFollowerLevel                    //287 SPELL_EFFECT_SET_GARRISON_FOLLOWER_LEVEL
	Effect288                                         //288 SPELL_EFFECT_288
	Effect289                                         //289 SPELL_EFFECT_289
	NumEffects
)

//go:generate stringer -type PreventionType -trimprefix PreventionType
type PreventionType int32

const (
	PreventionTypeNone    PreventionType = 0 // Cannot be prevented (trinkets, some racials)
	PreventionTypeSilence PreventionType = 1 // Blocked by silence/interrupt effects
	PreventionTypePacify  PreventionType = 2 // Blocked by pacify effects (disarms, etc.)
)

//go:generate stringer -type InterruptFlags -trimprefix=InterruptFlags
type InterruptFlags bitmask.Bitmask32

func (b InterruptFlags) Has(flag InterruptFlags) bool { return b&flag != 0 }

const (
	InterruptFlagMovement   InterruptFlags = 0x00000001 // Interrupted by moving
	InterruptFlagPushback   InterruptFlags = 0x00000002 // Can be pushed back by damage
	InterruptFlagInterrupt  InterruptFlags = 0x00000004 // Can be interrupted (Kick, Counterspell)
	InterruptFlagAutoAttack InterruptFlags = 0x00000008 // Interrupted by auto-attack
	InterruptFlagDamage     InterruptFlags = 0x00000010 // Interrupted by any damage
	InterruptFlag_END       InterruptFlags = 0x00000020 // Sentinel for iteration
)

//go:generate stringer -type Mechanic -trimprefix Mechanic
type Mechanic int32

const (
	MechanicNone         Mechanic = 0
	MechanicCharm        Mechanic = 1  // Mind Control
	MechanicDisoriented  Mechanic = 2  // Scatter Shot
	MechanicDisarm       Mechanic = 3  // Disarm
	MechanicDistract     Mechanic = 4  // Distract
	MechanicFlee         Mechanic = 5  // Fear (running away)
	MechanicGrip         Mechanic = 6  // Death Grip (later expansions)
	MechanicRoot         Mechanic = 7  // Frost Nova, Entangling Roots
	MechanicSlow         Mechanic = 8  // Frostbolt debuff, Crippling Poison
	MechanicSilence      Mechanic = 9  // Silence
	MechanicSleep        Mechanic = 10 // Wyvern Sting, Hibernate
	MechanicSnare        Mechanic = 11 // Hamstring, Wing Clip
	MechanicStun         Mechanic = 12 // Cheap Shot, Hammer of Justice
	MechanicFreeze       Mechanic = 13 // Frost Nova root effect
	MechanicKnockout     Mechanic = 14 // Gouge, Sap (incapacitate)
	MechanicBleed        Mechanic = 15 // Rend, Rupture, Garrote
	MechanicBandage      Mechanic = 16 // Bandaging
	MechanicPolymorph    Mechanic = 17 // Sheep, Pig, Turtle
	MechanicBanish       Mechanic = 18 // Banish
	MechanicShield       Mechanic = 19 // Shield effects
	MechanicShackle      Mechanic = 20 // Shackle Undead
	MechanicMount        Mechanic = 21 // Mounting
	MechanicInfected     Mechanic = 22 // Disease effects
	MechanicTurn         Mechanic = 23 // Turn Undead
	MechanicHorror       Mechanic = 24 // Death Coil (fear variant)
	MechanicInvulnerable Mechanic = 25 // Divine Shield, Ice Block
	MechanicInterrupt    Mechanic = 26 // Kick, Counterspell
	MechanicDaze         Mechanic = 27 // Dazed (hit from behind)
	MechanicDiscovery    Mechanic = 28 // Discovery (professions)
	MechanicImmuneShield Mechanic = 29 // Immune shield (cannot be dispelled)
	MechanicSapped       Mechanic = 30 // Sap specifically
	MechanicEnraged      Mechanic = 31 // Enrage effects
)

//go:generate stringer -type DefenseType -trimprefix DefenseType
type DefenseType int32

const (
	DefenseTypeNone   DefenseType = 0 //
	DefenseTypeMagic  DefenseType = 1 // Magic — uses spell hit/resist, no dodge/parry/block
	DefenseTypeMelee  DefenseType = 2 // Can be dodged, parried, blocked
	DefenseTypeRanged DefenseType = 3 // Can be dodged, can't be parried/blocked
)

//go:generate stringer -type AuraState -trimprefix AuraState
type AuraState int32

const (
	AuraStateNone               AuraState = 0
	AuraStateDefense            AuraState = 1  // Defensive stance/form
	AuraStateHealthLess20Pct    AuraState = 2  // Target below 20% health (Execute)
	AuraStateBerserking         AuraState = 3  // Berserker rage active
	AuraStateJudgement          AuraState = 5  // Has Judgement debuff (Paladin)
	AuraStateHunterParry        AuraState = 7  // Hunter parry (Mongoose Bite)
	AuraStateRogue              AuraState = 10 // Combo points (finishing moves)
	AuraStateDruidCatForm       AuraState = 11 // In Cat Form
	AuraStateWarriorVictoryRush AuraState = 12 // Victory Rush proc
	AuraStateCritical           AuraState = 13 // Just got a critical hit
	AuraStateRecentlyBandaged   AuraState = 14 // Has "Recently Bandaged" debuff
	AuraStateHealthLess35Pct    AuraState = 16 // Target below 35% health (Kill Shot)
	AuraStateImmolate           AuraState = 17 // Has Immolate debuff (Conflagrate)
	AuraStateDodged             AuraState = 18 // Target dodged (Overpower)
	AuraStateBlocked            AuraState = 19 // Target blocked (Revenge)
	AuraStateFrozen             AuraState = 21 // Target is frozen (Ice Lance)
	AuraStateStealthInvis       AuraState = 23 // In stealth or invisible
)

//go:generate stringer -type TargetCreatureType -trimprefix TargetCreatureType
type TargetCreatureType bitmask.Bitmask32

func (b TargetCreatureType) Has(flag TargetCreatureType) bool { return b&flag != 0 }

const (
	CreatureTypeBeast        TargetCreatureType = 0x00000001 // 0
	CreatureTypeDragonkin    TargetCreatureType = 0x00000002 // 1
	CreatureTypeDemon        TargetCreatureType = 0x00000004 // 2
	CreatureTypeElemental    TargetCreatureType = 0x00000008 // 3
	CreatureTypeGiant        TargetCreatureType = 0x00000010 // 4
	CreatureTypeUndead       TargetCreatureType = 0x00000020 // 5
	CreatureTypeHumanoid     TargetCreatureType = 0x00000040 // 6
	CreatureTypeCritter      TargetCreatureType = 0x00000080 // 7
	CreatureTypeMechanical   TargetCreatureType = 0x00000100 // 8
	CreatureTypeNotSpecified TargetCreatureType = 0x00000200 // 9
	CreatureTypeTotem        TargetCreatureType = 0x00000400 // 10
	CreatureTypeNonCombatPet TargetCreatureType = 0x00000800 // 11
	CreatureTypeGasCloud     TargetCreatureType = 0x00001000 // 12
	CreatureType_END         TargetCreatureType = 0x00002000 // Sentinel for iteration
)

//go:generate stringer -type ImplicitTarget -trimprefix ImplicitTarget
type ImplicitTarget int32

const (
	ImplicitTargetNone                      ImplicitTarget = 0
	ImplicitTargetUnitCaster                ImplicitTarget = 1 // Self
	ImplicitTargetUnitNearbyEnemy           ImplicitTarget = 2 // Closest enemy
	ImplicitTargetUnitNearbyParty           ImplicitTarget = 3 // Closest party member
	ImplicitTargetUnitNearbyAlly            ImplicitTarget = 4 // Closest ally
	ImplicitTargetUnitPet                   ImplicitTarget = 5 // Your pet
	ImplicitTargetUnitTargetEnemy           ImplicitTarget = 6 // Current target (hostile)
	ImplicitTargetUnitSrcAreaEntry          ImplicitTarget = 7 // Creatures in area by entry
	ImplicitTargetUnitDestAreaEntry         ImplicitTarget = 8 // Creatures at dest by entry
	ImplicitTargetDestHome                  ImplicitTarget = 9 // Hearth location
	ImplicitTargetUnitSrcAreaUnk11          ImplicitTarget = 11
	ImplicitTargetUnitSrcAreaEnemy          ImplicitTarget = 15 // AoE enemies at caster
	ImplicitTargetUnitDestAreaEnemy         ImplicitTarget = 16 // AoE enemies at target
	ImplicitTargetDestDB                    ImplicitTarget = 17 // Database location
	ImplicitTargetDestCaster                ImplicitTarget = 18 // Caster's position
	ImplicitTargetUnitCasterAreaParty       ImplicitTarget = 20 // Party members near caster
	ImplicitTargetUnitTargetAlly            ImplicitTarget = 21 // Current target (friendly)
	ImplicitTargetSrcCaster                 ImplicitTarget = 22 // Source = caster pos
	ImplicitTargetGameobjectTarget          ImplicitTarget = 23 // Targeted game object
	ImplicitTargetUnitConeEnemy             ImplicitTarget = 24 // Cone in front (enemies)
	ImplicitTargetUnitTargetAny             ImplicitTarget = 25 // Any target
	ImplicitTargetGameobjectItemTarget      ImplicitTarget = 26 // Item or game object
	ImplicitTargetUnitMaster                ImplicitTarget = 27 // Pet's master
	ImplicitTargetDestDynobjEnemy           ImplicitTarget = 28 // Dynamic object (enemy)
	ImplicitTargetDestDynobjAlly            ImplicitTarget = 29 // Dynamic object (ally)
	ImplicitTargetUnitSrcAreaAlly           ImplicitTarget = 30 // AoE allies at caster
	ImplicitTargetUnitDestAreaAlly          ImplicitTarget = 31 // AoE allies at target
	ImplicitTargetDestCasterSummon          ImplicitTarget = 32 // Summon location
	ImplicitTargetUnitSrcAreaParty          ImplicitTarget = 33 // Party in area at caster
	ImplicitTargetUnitDestAreaParty         ImplicitTarget = 34 // Party in area at target
	ImplicitTargetUnitTargetParty           ImplicitTarget = 35 // Target's party
	ImplicitTargetDestCasterUnk36           ImplicitTarget = 36
	ImplicitTargetUnitLastTargetAreaParty   ImplicitTarget = 37 // Last target's party area
	ImplicitTargetUnitNearbyEntry           ImplicitTarget = 38 // Nearby creature by entry
	ImplicitTargetDestCasterFrontLeft       ImplicitTarget = 39
	ImplicitTargetDestCasterBackLeft        ImplicitTarget = 40
	ImplicitTargetDestCasterBackRight       ImplicitTarget = 41
	ImplicitTargetDestCasterFrontRight      ImplicitTarget = 42
	ImplicitTargetUnitChainhealAlly         ImplicitTarget = 45 // Chain heal bounce
	ImplicitTargetDestNearbyEntry           ImplicitTarget = 46 // Near creature by entry
	ImplicitTargetDestCasterFront           ImplicitTarget = 47 // In front of caster
	ImplicitTargetDestCasterBack            ImplicitTarget = 48 // Behind caster
	ImplicitTargetDestCasterRight           ImplicitTarget = 49 // Right of caster
	ImplicitTargetDestCasterLeft            ImplicitTarget = 50 // Left of caster
	ImplicitTargetGameobjectSrcArea         ImplicitTarget = 51 // Game objects in area
	ImplicitTargetGameobjectDestArea        ImplicitTarget = 52
	ImplicitTargetDestTargetEnemy           ImplicitTarget = 53 // Enemy's position
	ImplicitTargetUnitConeCasterToDestEnemy ImplicitTarget = 54 // Cone toward dest
	ImplicitTargetDestCasterFrontLeap       ImplicitTarget = 55 // Leap forward
	ImplicitTargetUnitCasterAreaRaid        ImplicitTarget = 56 // Raid members near caster
	ImplicitTargetUnitTargetRaid            ImplicitTarget = 57 // Target's raid
	ImplicitTargetUnitNearbyRaid            ImplicitTarget = 58 // Nearby raid member
	ImplicitTargetUnitConeCasterToDestAlly  ImplicitTarget = 59
	ImplicitTargetUnitDestAreaRaidClass     ImplicitTarget = 60 // Same class in raid
	ImplicitTargetDestCasterMovementDir     ImplicitTarget = 61 // Direction of movement
	ImplicitTargetCorpseEnemy               ImplicitTarget = 64 // Enemy corpse
	ImplicitTargetUnitDestAreaEnemySrc      ImplicitTarget = 65
	ImplicitTargetUnitDestAreaEnemyDst      ImplicitTarget = 66
	ImplicitTargetDestCasterRandom          ImplicitTarget = 72 // Random near caster
	ImplicitTargetDestCasterRadius          ImplicitTarget = 73 // Random in radius
	ImplicitTargetDestTargetRandom          ImplicitTarget = 74 // Random near target
	ImplicitTargetDestTargetRadius          ImplicitTarget = 75
	ImplicitTargetDestChannelTarget         ImplicitTarget = 77 // Channeling target
	ImplicitTargetUnitChannelTarget         ImplicitTarget = 78
	ImplicitTargetDestDestFront             ImplicitTarget = 79
	ImplicitTargetDestDestBack              ImplicitTarget = 80
	ImplicitTargetDestDestRight             ImplicitTarget = 81
	ImplicitTargetDestDestLeft              ImplicitTarget = 82
	ImplicitTargetCorpseSrcAreaEnemy        ImplicitTarget = 87 // Enemy corpses in area
	ImplicitTargetUnitVehicle               ImplicitTarget = 94
	ImplicitTargetUnitTargetPassenger       ImplicitTarget = 95
)

//go:generate stringer -type ProcFlagsEx -trimprefix=ProcFlagsEx
type ProcFlagsEx bitmask.Bitmask32

func (b ProcFlagsEx) Has(flag ProcFlagsEx) bool { return b&flag != 0 }

const (
	ProcExNone            ProcFlagsEx = 0x00000000
	ProcExNormalHit       ProcFlagsEx = 0x00000001 // Only on normal (non-crit) hits
	ProcExCriticalHit     ProcFlagsEx = 0x00000002 // Only on critical hits
	ProcExMiss            ProcFlagsEx = 0x00000004 // On miss
	ProcExResist          ProcFlagsEx = 0x00000008 // On resist
	ProcExDodge           ProcFlagsEx = 0x00000010 // On dodge
	ProcExParry           ProcFlagsEx = 0x00000020 // On parry
	ProcExBlock           ProcFlagsEx = 0x00000040 // On block
	ProcExEvade           ProcFlagsEx = 0x00000080 // On evade
	ProcExImmune          ProcFlagsEx = 0x00000100 // On immune
	ProcExDeflect         ProcFlagsEx = 0x00000200 // On deflect
	ProcExAbsorb          ProcFlagsEx = 0x00000400 // On absorb
	ProcExReflect         ProcFlagsEx = 0x00000800 // On reflect
	ProcExInterrupt       ProcFlagsEx = 0x00001000 // On interrupt
	ProcExFullBlock       ProcFlagsEx = 0x00002000 // On full block
	ProcExOnCastEnd       ProcFlagsEx = 0x00004000 // Trigger on cast end (not hit)
	ProcExNotActiveSpell  ProcFlagsEx = 0x00008000 // Don't trigger from active spells
	ProcExTriggerAlways   ProcFlagsEx = 0x00010000 // Always trigger (ignore other conditions)
	ProcExOneTimeTrigger  ProcFlagsEx = 0x00020000 // Remove aura after proc
	ProcExOnlyActiveSpell ProcFlagsEx = 0x00040000 // Only trigger from active spells
	ProcEx_END            ProcFlagsEx = 0x00080000 // Sentinel for iteration
)

//go:generate stringer -type TargetFlags -trimprefix=TargetFlags
type TargetFlags uint32

func (h TargetFlags) Has(flag TargetFlags) bool {
	return h&flag != 0
}

const (
	TargetSelf                TargetFlags = 0x00000000
	TargetSpellDynamic1       TargetFlags = 0x00000001
	TargetUnit                TargetFlags = 0x00000002
	TargetUnitRaid            TargetFlags = 0x00000004
	TargetUnitParty           TargetFlags = 0x00000008
	TargetItem                TargetFlags = 0x00000010
	TargetSourceLocation      TargetFlags = 0x00000020
	TargetDestinationLocation TargetFlags = 0x00000040
	TargetUnitEnemy           TargetFlags = 0x00000080
	TargetUnitAlly            TargetFlags = 0x00000100
	TargetCorpseEnemy         TargetFlags = 0x00000200
	TargetUnitDead            TargetFlags = 0x00000400
	TargetGameObject          TargetFlags = 0x00000800
	TargetTradeItem           TargetFlags = 0x00001000
	TargetNameString          TargetFlags = 0x00002000
	TargetGameObjectItem      TargetFlags = 0x00004000
	TargetCorpseAlly          TargetFlags = 0x00008000
	TargetUnitMinipet         TargetFlags = 0x00010000
	TargetGlyph               TargetFlags = 0x00020000
	TargetDestinationTarget   TargetFlags = 0x00040000
	TargetExtraTargets        TargetFlags = 0x00080000 // 4.x VisualChain
	TargetUnitPassenger       TargetFlags = 0x00100000
	TargetUnk400000           TargetFlags = 0x00400000
	TargetUnk1000000          TargetFlags = 0x01000000
	TargetUnk4000000          TargetFlags = 0x04000000
	TargetUnk10000000         TargetFlags = 0x10000000
	TargetUnk40000000         TargetFlags = 0x40000000
	Target_END                TargetFlags = 0x80000000 // Sentinel for iteration
)
