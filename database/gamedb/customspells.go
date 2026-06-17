package gamedb

import (
	"github.com/Emyrk/chronicle/database/gamedb/chrondbc"
	"github.com/Emyrk/chronicle/database/gamedb/chrondbc/dbcmem"
	"github.com/Gophercraft/core/i18n"
)

const (
	EnvironmentFalling  chrondbc.SpellID = 900001
	EnvironmentDrowning chrondbc.SpellID = 900002
	EnvironmentFatigue  chrondbc.SpellID = 900003
	EnvironmentFire     chrondbc.SpellID = 900004

	ReflectPhysical chrondbc.SpellID = 900101
	ReflectHoly     chrondbc.SpellID = 900102
	ReflectFire     chrondbc.SpellID = 900103
	ReflectNature   chrondbc.SpellID = 900104
	ReflectFrost    chrondbc.SpellID = 900105
	ReflectShadow   chrondbc.SpellID = 900106
	ReflectArcane   chrondbc.SpellID = 900107
)

var customSpells = map[chrondbc.SpellID]chrondbc.Spell{
	chrondbc.SpellIDAutoAttack: {
		ID: chrondbc.SpellIDAutoAttack, Name_lang: i18n.GetEnglish("Auto Attack"),
		SpellIcon: dbcmem.SpellIcon{ID: 368},
		School:    chrondbc.SchoolPhysical, BaseLevel: 1, SpellLevel: 1,
		StanceBarOrder: -1,
		Range:          dbcmem.SpellRange{ID: 1},
		Attrs:          *(&chrondbc.SpellAttributes{}).Set(chrondbc.Attr_IsAbility),
		Effect: [3]chrondbc.Effect{
			chrondbc.EffectAttack,
			0,
			0,
		},
	},
	EnvironmentFalling: {
		ID: EnvironmentFalling, Name_lang: i18n.GetEnglish("Falling"),
		SpellIcon: dbcmem.SpellIcon{ID: 246}, // Ability_Kick
		School:      chrondbc.SchoolPhysical, BaseLevel: 1, SpellLevel: 1,
		Effect: [3]chrondbc.Effect{chrondbc.EffectEnvironmentalDMG},
	},
	EnvironmentDrowning: {
		ID: EnvironmentDrowning, Name_lang: i18n.GetEnglish("Drowning"),
		SpellIcon: dbcmem.SpellIcon{ID: 545}, // Spell_Shadow_DemonBreath
		School:      chrondbc.SchoolPhysical, BaseLevel: 1, SpellLevel: 1,
		Effect: [3]chrondbc.Effect{chrondbc.EffectEnvironmentalDMG},
	},
	EnvironmentFatigue: {
		ID: EnvironmentFatigue, Name_lang: i18n.GetEnglish("Fatigue"),
		School: chrondbc.SchoolPhysical, BaseLevel: 1, SpellLevel: 1,
		SpellIcon: dbcmem.SpellIcon{ID: 1611},
		Effect:    [3]chrondbc.Effect{chrondbc.EffectEnvironmentalDMG},
	},
	EnvironmentFire: {
		ID: EnvironmentFire, Name_lang: i18n.GetEnglish("Fire"),
		School: chrondbc.SchoolFire, BaseLevel: 1, SpellLevel: 1,
		SpellIcon: dbcmem.SpellIcon{ID: 11}, // Spell_Fire_Fire
		Effect:    [3]chrondbc.Effect{chrondbc.EffectEnvironmentalDMG},
	},

	// Reflect damage by school
	ReflectNature: {
		ID: ReflectNature, Name_lang: i18n.GetEnglish("Reflect Physical"),
		SpellIcon: dbcmem.SpellIcon{ID: 1749},
		School:    chrondbc.SchoolNature, BaseLevel: 1, SpellLevel: 1,
		Effect:     [3]chrondbc.Effect{chrondbc.EffectApplyAura},
		EffectAura: [3]chrondbc.AuraEffect{chrondbc.AuraEffectDamageShield},
	},
	ReflectHoly: {
		ID: ReflectHoly, Name_lang: i18n.GetEnglish("Reflect Holy"),
		SpellIcon: dbcmem.SpellIcon{ID: 70},
		School:    chrondbc.SchoolHoly, BaseLevel: 1, SpellLevel: 1,
		Effect:     [3]chrondbc.Effect{chrondbc.EffectApplyAura},
		EffectAura: [3]chrondbc.AuraEffect{chrondbc.AuraEffectDamageShield},
	},
	ReflectFire: {
		ID: ReflectFire, Name_lang: i18n.GetEnglish("Reflect Fire"),
		SpellIcon: dbcmem.SpellIcon{ID: 11},
		School:    chrondbc.SchoolFire, BaseLevel: 1, SpellLevel: 1,
		Effect:     [3]chrondbc.Effect{chrondbc.EffectApplyAura},
		EffectAura: [3]chrondbc.AuraEffect{chrondbc.AuraEffectDamageShield},
	},
	ReflectFrost: {
		ID: ReflectFrost, Name_lang: i18n.GetEnglish("Reflect Frost"),
		SpellIcon: dbcmem.SpellIcon{ID: 188},
		School:    chrondbc.SchoolFrost,
		BaseLevel:   1, SpellLevel: 1,
		Effect:     [3]chrondbc.Effect{chrondbc.EffectApplyAura},
		EffectAura: [3]chrondbc.AuraEffect{chrondbc.AuraEffectDamageShield},
	},
	ReflectShadow: {
		ID: ReflectShadow, Name_lang: i18n.GetEnglish("Reflect Shadow"),
		SpellIcon: dbcmem.SpellIcon{ID: 234},
		School:    chrondbc.SchoolShadow, BaseLevel: 1, SpellLevel: 1,
		Effect:     [3]chrondbc.Effect{chrondbc.EffectApplyAura},
		EffectAura: [3]chrondbc.AuraEffect{chrondbc.AuraEffectDamageShield},
	},
	ReflectArcane: {
		ID: ReflectArcane, Name_lang: i18n.GetEnglish("Reflect Arcane"),
		SpellIcon: dbcmem.SpellIcon{ID: 1485},
		School:    chrondbc.SchoolArcane, BaseLevel: 1, SpellLevel: 1,
		Effect:     [3]chrondbc.Effect{chrondbc.EffectApplyAura},
		EffectAura: [3]chrondbc.AuraEffect{chrondbc.AuraEffectDamageShield},
	},
}
