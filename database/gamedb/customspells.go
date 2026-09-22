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

func customEffects(effect chrondbc.Effect, aura chrondbc.AuraEffect) []chrondbc.SpellEffect {
	return []chrondbc.SpellEffect{
		{EffectIndex: 0, Effect: effect, EffectAura: aura},
		{EffectIndex: 1},
		{EffectIndex: 2},
	}
}

// customSpells are synthetic spells that don't exist in any DBC file.
// They're injected by the spell fetcher and bypass DB/DBC lookups entirely.
var customSpells = map[chrondbc.SpellID]chrondbc.Spell{
	chrondbc.SpellIDAutoAttack: {
		ID: chrondbc.SpellIDAutoAttack, Name_lang: i18n.GetEnglish("Auto Attack"),
		SpellIcon: dbcmem.SpellIcon{ID: 368, TextureFilename: "INV_Sword_04"},
		School:    chrondbc.SchoolPhysical, BaseLevel: 1, SpellLevel: 1,
		StanceBarOrder: -1,
		Range:          dbcmem.SpellRange{ID: 1},
		Attrs:          *(&chrondbc.SpellAttributes{}).Set(chrondbc.Attr_IsAbility),
		Effects:        customEffects(chrondbc.EffectAttack, chrondbc.AuraEffectNone),
	},
	EnvironmentFalling: {
		ID: EnvironmentFalling, Name_lang: i18n.GetEnglish("Falling"),
		SpellIcon: dbcmem.SpellIcon{ID: 246, TextureFilename: "Ability_Kick"},
		School:    chrondbc.SchoolPhysical, BaseLevel: 1, SpellLevel: 1,
		Effects: customEffects(chrondbc.EffectEnvironmentalDMG, chrondbc.AuraEffectNone),
	},
	EnvironmentDrowning: {
		ID: EnvironmentDrowning, Name_lang: i18n.GetEnglish("Drowning"),
		SpellIcon: dbcmem.SpellIcon{ID: 545, TextureFilename: "Spell_Shadow_DemonBreath"},
		School:    chrondbc.SchoolPhysical, BaseLevel: 1, SpellLevel: 1,
		Effects: customEffects(chrondbc.EffectEnvironmentalDMG, chrondbc.AuraEffectNone),
	},
	EnvironmentFatigue: {
		ID: EnvironmentFatigue, Name_lang: i18n.GetEnglish("Fatigue"),
		School: chrondbc.SchoolPhysical, BaseLevel: 1, SpellLevel: 1,
		SpellIcon: dbcmem.SpellIcon{ID: 1611, TextureFilename: "Ability_Suffocate"},
		Effects:   customEffects(chrondbc.EffectEnvironmentalDMG, chrondbc.AuraEffectNone),
	},
	EnvironmentFire: {
		ID: EnvironmentFire, Name_lang: i18n.GetEnglish("Fire"),
		School: chrondbc.SchoolFire, BaseLevel: 1, SpellLevel: 1,
		SpellIcon: dbcmem.SpellIcon{ID: 11, TextureFilename: "Spell_Fire_Fire"},
		Effects:   customEffects(chrondbc.EffectEnvironmentalDMG, chrondbc.AuraEffectNone),
	},

	// Reflect damage by school
	ReflectNature: {
		ID: ReflectNature, Name_lang: i18n.GetEnglish("Reflect Physical"),
		SpellIcon: dbcmem.SpellIcon{ID: 1749, TextureFilename: "Spell_Nature_StoneClawTotem"},
		School:    chrondbc.SchoolNature, BaseLevel: 1, SpellLevel: 1,
		Effects: customEffects(chrondbc.EffectApplyAura, chrondbc.AuraEffectDamageShield),
	},
	ReflectHoly: {
		ID: ReflectHoly, Name_lang: i18n.GetEnglish("Reflect Holy"),
		SpellIcon: dbcmem.SpellIcon{ID: 70, TextureFilename: "Spell_Holy_HolyBolt"},
		School:    chrondbc.SchoolHoly, BaseLevel: 1, SpellLevel: 1,
		Effects: customEffects(chrondbc.EffectApplyAura, chrondbc.AuraEffectDamageShield),
	},
	ReflectFire: {
		ID: ReflectFire, Name_lang: i18n.GetEnglish("Reflect Fire"),
		SpellIcon: dbcmem.SpellIcon{ID: 11, TextureFilename: "Spell_Fire_Fire"},
		School:    chrondbc.SchoolFire, BaseLevel: 1, SpellLevel: 1,
		Effects: customEffects(chrondbc.EffectApplyAura, chrondbc.AuraEffectDamageShield),
	},
	ReflectFrost: {
		ID: ReflectFrost, Name_lang: i18n.GetEnglish("Reflect Frost"),
		SpellIcon: dbcmem.SpellIcon{ID: 188, TextureFilename: "Spell_Frost_FrostShock"},
		School:    chrondbc.SchoolFrost,
		BaseLevel: 1, SpellLevel: 1,
		Effects: customEffects(chrondbc.EffectApplyAura, chrondbc.AuraEffectDamageShield),
	},
	ReflectShadow: {
		ID: ReflectShadow, Name_lang: i18n.GetEnglish("Reflect Shadow"),
		SpellIcon: dbcmem.SpellIcon{ID: 234, TextureFilename: "Spell_Shadow_AntiShadow"},
		School:    chrondbc.SchoolShadow, BaseLevel: 1, SpellLevel: 1,
		Effects: customEffects(chrondbc.EffectApplyAura, chrondbc.AuraEffectDamageShield),
	},
	ReflectArcane: {
		ID: ReflectArcane, Name_lang: i18n.GetEnglish("Reflect Arcane"),
		SpellIcon: dbcmem.SpellIcon{ID: 1485, TextureFilename: "Spell_Shadow_ManaFeed"},
		School:    chrondbc.SchoolArcane, BaseLevel: 1, SpellLevel: 1,
		Effects: customEffects(chrondbc.EffectApplyAura, chrondbc.AuraEffectDamageShield),
	},
}
