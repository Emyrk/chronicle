package wowdata

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/Emyrk/chronicle/database/gamedb/talents"
	"github.com/stretchr/testify/require"
)

func TestConvertPoliciesAndJoins(t *testing.T) {
	t.Parallel()
	dir := newSnapshotFixture(t)
	writeRows(t, dir, "Spell", map[string]any{"ID": 100, "Description_lang": "desc"})
	writeRows(t, dir, "SpellName", map[string]any{"ID": 100, "Name_lang": "Test Spell"})
	writeRows(t, dir, "SpellMisc",
		map[string]any{"ID": 1, "SpellID": 100, "DifficultyID": 0, "Attributes": []int{1, 2, 3, 4, 5, 6, 7, 8, 9, 10}, "SchoolMask": 4, "SpellIconFileDataID": 12345},
		map[string]any{"ID": 2, "SpellID": 100, "DifficultyID": 1, "SchoolMask": 99},
		map[string]any{"ID": 3, "SpellID": 999, "DifficultyID": 0, "SchoolMask": 8})
	writeRows(t, dir, "SpellEffect",
		map[string]any{"ID": 1, "SpellID": 100, "DifficultyID": 0, "EffectIndex": 0, "Effect": 6, "EffectBasePointsF": 5.0, "EffectAura": 3, "ImplicitTarget": []int{1, 2}},
		map[string]any{"ID": 2, "SpellID": 100, "DifficultyID": 0, "EffectIndex": 3, "Effect": 99, "BonusCoefficientFromAP": 0.5, "Coefficient": 0.25, "EffectAmplitude": 1.5, "EffectAttributes": 64, "EffectAuraPeriod": 3000, "EffectBonusCoefficient": 0.75, "EffectChainAmplitude": 2.5, "EffectChainTargets": 4, "EffectItemType": 7, "EffectMechanic": 8, "EffectMiscValue": []int{9, 10}, "EffectPointsPerResource": 1.25, "EffectPos_facing": 3.14, "EffectRadiusIndex": []int{11, 12}, "EffectRealPointsPerLevel": 0.4, "EffectSpellClassMask": []int{13, 14, 15, 16}, "EffectTriggerSpell": 17, "GroupSizeBasePointsCoefficient": 1.1, "Node__Field_12_0_0_63534_001": 18, "PvpMultiplier": 0.9, "ResourceCoefficient": 0.2, "ScalingClass": 19, "ImplicitTarget": []int{20, 21}, "Variance": 0.3})
	writeRows(t, dir, "SpellClassOptions",
		map[string]any{"ID": 4, "SpellID": 100, "ModalNextSpell": 200, "SpellClassSet": 5, "SpellClassMask": []int{1, 2, 3, 4}})
	writeRows(t, dir, "SpellAuraOptions", map[string]any{"ID": 5, "SpellID": 100, "DifficultyID": 1, "CumulativeAura": 2, "ProcCategoryRecovery": 3, "ProcChance": 4, "ProcCharges": 5, "ProcTypeMask": []int{6, 7}, "SpellProcsPerMinuteID": 8})
	writeRows(t, dir, "SpellAuraRestrictions", map[string]any{"ID": 6, "SpellID": 100, "DifficultyID": 1, "CasterAuraSpell": 9, "CasterAuraState": 10, "CasterAuraType": 11, "ExcludeCasterAuraSpell": 12, "ExcludeCasterAuraState": 13, "ExcludeCasterAuraType": 14, "ExcludeTargetAuraSpell": 15, "ExcludeTargetAuraState": 16, "ExcludeTargetAuraType": 17, "TargetAuraSpell": 18, "TargetAuraState": 19, "TargetAuraType": 20})
	writeRows(t, dir, "SpellInterrupts", map[string]any{"ID": 7, "SpellID": 100, "DifficultyID": 1, "InterruptFlags": 21, "AuraInterruptFlags": []int{22, 23}, "ChannelInterruptFlags": []int{24, 25}})
	writeRows(t, dir, "SpellCategories", map[string]any{"ID": 8, "SpellID": 100, "DifficultyID": 1, "Category": 26, "ChargeCategory": 27, "DefenseType": 28, "DiminishType": 29, "DispelType": 30, "Mechanic": 31, "PreventionType": 32, "StartRecoveryCategory": 33})
	writeRows(t, dir, "SpellCooldowns", map[string]any{"ID": 9, "SpellID": 100, "DifficultyID": 1, "AuraSpellID": 34, "CategoryRecoveryTime": 35, "RecoveryTime": 36, "StartRecoveryTime": 37})
	writeRows(t, dir, "SpellLevels", map[string]any{"ID": 10, "SpellID": 100, "DifficultyID": 1, "BaseLevel": 38, "MaxLevel": 39, "MaxPassiveAuraLevel": 40, "SpellLevel": 41})
	writeRows(t, dir, "SpellTargetRestrictions", map[string]any{"ID": 11, "SpellID": 100, "DifficultyID": 1, "ConeDegrees": 42.5, "MaxTargetLevel": 43, "MaxTargets": 44, "TargetCreatureType": 45, "Targets": 46, "Width": 47.5})
	writeRows(t, dir, "SpellPower",
		map[string]any{"ID": 2, "SpellID": 100, "OrderIndex": 1, "AltPowerBarID": 3, "ManaCost": 20, "ManaCostPerLevel": 4, "ManaPerSecond": 5, "OptionalCost": 6, "OptionalCostPct": 0.7, "PowerCostMaxPct": 0.8, "PowerCostPct": 0.9, "PowerDisplayID": 10, "PowerPctPerSecond": 1.1, "PowerType": 12, "RequiredAuraSpellID": 13},
		map[string]any{"ID": 1, "SpellID": 100, "OrderIndex": 0, "ManaCost": 10})
	writeRows(t, dir, "Item", map[string]any{"ID": 1, "ClassID": 2, "SubclassID": 3}, map[string]any{"ID": 2})
	writeRows(t, dir, "ItemSparse", map[string]any{"ID": 1, "Display_lang": "Safe Item", "OverallQualityID": 2, "Flags": []int{7}, "AllowableRace": []int{-1, -1}}, map[string]any{"ID": 3, "Display_lang": "orphan"})
	writeRows(t, dir, "TraitTree", map[string]any{"ID": 900})
	writeRows(t, dir, "TraitNode", map[string]any{"ID": 9, "TraitTreeID": 900, "PosX": 0, "PosY": 0})
	writeRows(t, dir, "TraitNodeEntry", map[string]any{"ID": 19, "TraitDefinitionID": 29, "MaxRanks": 1})
	writeRows(t, dir, "TraitDefinition", map[string]any{"ID": 29, "SpellID": 100})
	writeRows(t, dir, "TraitEdge")
	writeRows(t, dir, "TraitNodeXTraitNodeEntry", map[string]any{"ID": 39, "TraitNodeID": 9, "TraitNodeEntryID": 19})
	writeRows(t, dir, "TraitNodeGroup", map[string]any{"ID": 49, "TraitTreeID": 900})
	writeRows(t, dir, "TraitNodeGroupXTraitNode", map[string]any{"ID": 59, "TraitNodeGroupID": 49, "TraitNodeID": 9})
	writeRows(t, dir, "TraitNodeGroupDisplayInfo", map[string]any{"ID": 69, "TraitNodeGroupID": 49, "SkillLineID": 1001, "OrderIndex": 0, "TraitTreeID": 900})
	writeRows(t, dir, "SkillLineXTraitTree", map[string]any{"ID": 79, "SkillLineID": 26, "TraitTreeID": 900})
	writeRows(t, dir, "SkillLine", map[string]any{"ID": 1001, "DisplayName_lang": "Tree"})
	writeRows(t, dir, "SpellCastTimes", map[string]any{"ID": 1, "Base": 1500, "Minimum": 500})
	writeRows(t, dir, "SpellItemEnchantment", map[string]any{"ID": 5, "Effect": []int{1, 2, 3}, "EffectArg": []int{4, 5, 6}, "Name_lang": "Enchant"})
	writeRows(t, dir, "ItemSet",
		map[string]any{"ID": 6, "Name_lang": "Set", "ItemID": []int{1, 2, 0}},
		map[string]any{"ID": 7, "Name_lang": "Empty Set", "ItemID": []int{0, 0}})

	writeIconRows(t, dir,
		map[string]any{"fileDataID": 12345, "fileName": `Interface\Icons\Spell_Test.BLP`},
		map[string]any{"fileDataID": 54321, "fileName": "interface/not-icons/ignored.blp"})

	got, err := Convert(dir, "wow_classic_beta", "1.60.1.69913")
	require.NoError(t, err)
	require.Len(t, got.Spells, 1)
	spell := got.Spells[0]
	require.Equal(t, int32(100), spell.SpellID)
	require.Equal(t, "Test Spell", spell.Name)
	require.Equal(t, int32(4), spell.School, "DifficultyID != 0 must not overwrite the base row")
	require.NotNil(t, spell.Reagent)
	require.NotNil(t, spell.ReagentCount)
	require.NotNil(t, spell.Attributes)
	require.NotNil(t, spell.Totem)
	require.NotNil(t, spell.SpellVisualID)
	require.Len(t, spell.Attributes, 9)
	require.Equal(t, 1, got.Losses.DroppedSpellAttributes)
	require.Equal(t, 1, got.Losses.DroppedOrphanSpellRows)
	require.Equal(t, []SpellIcon{{ID: 12345, TextureFilename: "spell_test"}}, got.SpellIcons)
	require.Len(t, got.SpellEffects, 2)
	require.Equal(t, int32(3), got.SpellEffects[1].EffectIndex, "all normalized effects must be preserved")
	require.Len(t, got.SpellPowers, 2)
	require.Equal(t, int32(20), got.SpellPowers[1].ManaCost)
	require.Len(t, got.SpellVariants, 3)
	require.Equal(t, int32(999), got.SpellVariants[2].SpellID, "component-only spell IDs must survive")
	require.Equal(t, []int32{1, 2, 3, 4, 5, 6, 7, 8, 9, 10}, got.SpellVariants[0].Misc.Attributes)
	require.Equal(t, []int32{1, 2, 3, 4}, got.SpellVariants[0].ClassOptions.SpellClassMask)
	require.Equal(t, float32(0.5), got.SpellEffects[1].BonusCoefficientFromAP)
	require.Equal(t, []int32{9, 10}, got.SpellEffects[1].EffectMiscValue)
	require.Equal(t, []int32{13, 14, 15, 16}, got.SpellEffects[1].EffectSpellClassMask)
	require.Equal(t, float32(0.9), got.SpellPowers[1].PowerCostPct)
	variant := got.SpellVariants[1]
	require.Equal(t, int32(1), variant.DifficultyID)
	require.Equal(t, []int32{6, 7}, variant.AuraOptions.ProcTypeMask)
	require.Equal(t, int32(20), variant.AuraRestrictions.TargetAuraType)
	require.Equal(t, []int32{24, 25}, variant.Interrupts.ChannelInterruptFlags)
	require.Equal(t, int32(33), variant.Categories.StartRecoveryCategory)
	require.Equal(t, int32(37), variant.Cooldowns.StartRecoveryTime)
	require.Equal(t, int32(40), variant.Levels.MaxPassiveAuraLevel)
	require.Equal(t, float32(47.5), variant.TargetRestrictions.Width)
	require.Len(t, got.Items, 1)
	require.Equal(t, int32(0), got.Items[0].DisplayID, "display IDs must not be guessed")
	require.Equal(t, []int32{2}, got.Losses.MissingItemSparseIDs)
	require.Equal(t, []int32{3}, got.Losses.MissingItemBaseIDs)
	require.Len(t, got.SpellCastTimes, 1)
	require.Len(t, got.Enchantments, 1)
	require.Len(t, got.ItemSets, 2)
	require.Equal(t, []int32{1, 2}, got.ItemSets[0].ItemIDs)
	require.NotNil(t, got.ItemSets[1].ItemIDs)
	require.Empty(t, got.ItemSets[1].ItemIDs)
	require.Contains(t, string(got.TalentTrees), `"name":"Test Spell"`)
	require.Contains(t, string(got.TalentTrees), `"iconTexture":"spell_test"`)
}

func TestConvertTraitsBuildsForeverTalentTrees(t *testing.T) {
	t.Parallel()
	dir := newSnapshotFixture(t)
	writeRows(t, dir, "Spell",
		map[string]any{"ID": 100},
		map[string]any{"ID": 101},
		map[string]any{"ID": 102},
		map[string]any{"ID": 103},
		map[string]any{"ID": 104},
		map[string]any{"ID": 105})
	writeRows(t, dir, "SpellName",
		map[string]any{"ID": 100, "Name_lang": "First Talent"},
		map[string]any{"ID": 101, "Name_lang": "Second Talent"},
		map[string]any{"ID": 102, "Name_lang": "Third Talent"},
		map[string]any{"ID": 103, "Name_lang": "Working Overtime"},
		map[string]any{"ID": 104, "Name_lang": "Performance Bonus"},
		map[string]any{"ID": 105, "Name_lang": "Unknown"})
	writeRows(t, dir, "SpellMisc",
		map[string]any{"ID": 1, "SpellID": 100, "SpellIconFileDataID": 5001},
		map[string]any{"ID": 2, "SpellID": 101, "SpellIconFileDataID": 5002},
		map[string]any{"ID": 3, "SpellID": 102, "SpellIconFileDataID": 5003},
		map[string]any{"ID": 4, "SpellID": 103, "SpellIconFileDataID": 5001},
		map[string]any{"ID": 5, "SpellID": 104, "SpellIconFileDataID": 5002},
		map[string]any{"ID": 6, "SpellID": 105, "SpellIconFileDataID": 5003})
	writeIconRows(t, dir,
		map[string]any{"fileDataID": 5001, "fileName": `Interface\Icons\Talent_First.BLP`},
		map[string]any{"fileDataID": 5002, "fileName": `Interface\Icons\Talent_Second.BLP`},
		map[string]any{"fileDataID": 5003, "fileName": `Interface\Icons\Talent_Third.BLP`},
		map[string]any{"fileDataID": 6001, "fileName": `Interface\Icons\Tab_Arms.BLP`})

	writeRows(t, dir, "TraitTree",
		map[string]any{"ID": 900},
		map[string]any{"ID": 1187, "TraitSystemID": 45})
	writeRows(t, dir, "SkillLineXTraitTree", map[string]any{"ID": 1, "SkillLineID": 26, "TraitTreeID": 900})
	writeRows(t, dir, "SkillLine",
		map[string]any{"ID": 1001, "DisplayName_lang": "Arms", "SpellIconFileID": 6001},
		map[string]any{"ID": 1002, "DisplayName_lang": "Fury"},
		map[string]any{"ID": 1003, "DisplayName_lang": "Protection"})
	writeRows(t, dir, "TraitNodeGroup",
		map[string]any{"ID": 2001, "TraitTreeID": 900},
		map[string]any{"ID": 2002, "TraitTreeID": 900},
		map[string]any{"ID": 2003, "TraitTreeID": 900})
	writeRows(t, dir, "TraitNodeGroupDisplayInfo",
		map[string]any{"ID": 3003, "TraitNodeGroupID": 2003, "SkillLineID": 1003, "OrderIndex": 2, "TraitTreeID": 900},
		map[string]any{"ID": 3001, "TraitNodeGroupID": 2001, "SkillLineID": 1001, "OrderIndex": 0, "TraitTreeID": 900},
		map[string]any{"ID": 3002, "TraitNodeGroupID": 2002, "SkillLineID": 1002, "OrderIndex": 1, "TraitTreeID": 900})
	writeRows(t, dir, "TraitNode",
		map[string]any{"ID": 105888, "TraitTreeID": 900, "PosX": 610, "PosY": -5},
		map[string]any{"ID": 105889, "TraitTreeID": 900, "PosX": -10, "PosY": 5},
		map[string]any{"ID": 105890, "TraitTreeID": 900, "PosX": 0, "PosY": 605},
		map[string]any{"ID": 105891, "TraitTreeID": 900, "PosX": 0, "PosY": 0},
		map[string]any{"ID": 105892, "TraitTreeID": 900, "PosX": 0, "PosY": 0},
		map[string]any{"ID": 110290, "TraitTreeID": 1187, "PosX": 2400, "PosY": 1800},
		map[string]any{"ID": 110292, "TraitTreeID": 1187, "PosX": 3150, "PosY": 2550},
		map[string]any{"ID": 113506, "TraitTreeID": 1187, "PosX": 4650, "PosY": 2550})
	writeRows(t, dir, "TraitNodeGroupXTraitNode",
		map[string]any{"ID": 3, "TraitNodeGroupID": 2001, "TraitNodeID": 105890, "Index": 2},
		map[string]any{"ID": 1, "TraitNodeGroupID": 2001, "TraitNodeID": 105888, "Index": 0},
		map[string]any{"ID": 2, "TraitNodeGroupID": 2001, "TraitNodeID": 105889, "Index": 1},
		map[string]any{"ID": 4, "TraitNodeGroupID": 2002, "TraitNodeID": 105891},
		map[string]any{"ID": 5, "TraitNodeGroupID": 2003, "TraitNodeID": 105892})
	writeRows(t, dir, "TraitNodeEntry",
		map[string]any{"ID": 130618, "TraitDefinitionID": 4001, "MaxRanks": 5},
		map[string]any{"ID": 130619, "TraitDefinitionID": 4002, "MaxRanks": 1},
		map[string]any{"ID": 130620, "TraitDefinitionID": 4003, "MaxRanks": 2},
		map[string]any{"ID": 130621, "TraitDefinitionID": 4002, "MaxRanks": 1},
		map[string]any{"ID": 130622, "TraitDefinitionID": 4003, "MaxRanks": 1},
		map[string]any{"ID": 136841, "TraitDefinitionID": 4004, "MaxRanks": 5},
		map[string]any{"ID": 136842, "TraitDefinitionID": 4005, "MaxRanks": 3},
		map[string]any{"ID": 140812, "TraitDefinitionID": 4006, "MaxRanks": 1})
	writeRows(t, dir, "TraitDefinition",
		map[string]any{"ID": 4001, "SpellID": 100},
		map[string]any{"ID": 4002, "SpellID": 101},
		map[string]any{"ID": 4003, "SpellID": 102},
		map[string]any{"ID": 4004, "SpellID": 103},
		map[string]any{"ID": 4005, "SpellID": 104},
		map[string]any{"ID": 4006, "SpellID": 105})
	writeRows(t, dir, "TraitNodeXTraitNodeEntry",
		map[string]any{"ID": 11, "TraitNodeID": 105888, "TraitNodeEntryID": 130618},
		map[string]any{"ID": 12, "TraitNodeID": 105889, "TraitNodeEntryID": 130619},
		map[string]any{"ID": 13, "TraitNodeID": 105890, "TraitNodeEntryID": 130620},
		map[string]any{"ID": 14, "TraitNodeID": 105891, "TraitNodeEntryID": 130621},
		map[string]any{"ID": 15, "TraitNodeID": 105892, "TraitNodeEntryID": 130622},
		map[string]any{"ID": 16, "TraitNodeID": 110290, "TraitNodeEntryID": 136841},
		map[string]any{"ID": 17, "TraitNodeID": 110292, "TraitNodeEntryID": 136842},
		map[string]any{"ID": 18, "TraitNodeID": 113506, "TraitNodeEntryID": 140812})
	writeRows(t, dir, "TraitEdge",
		map[string]any{"ID": 1, "LeftTraitNodeID": 105889, "RightTraitNodeID": 105890, "Type": 2},
		map[string]any{"ID": 2, "LeftTraitNodeID": 105888, "RightTraitNodeID": 105890, "Type": 3},
		map[string]any{"ID": 3, "LeftTraitNodeID": 105890, "RightTraitNodeID": 105888, "Type": 0},
		map[string]any{"ID": 4, "LeftTraitNodeID": 110290, "RightTraitNodeID": 110292, "Type": 2})

	got, err := Convert(dir, "wow_classic_beta", "1.60.1.69913")
	require.NoError(t, err)
	gotAgain, err := Convert(dir, "wow_classic_beta", "1.60.1.69913")
	require.NoError(t, err)
	require.Equal(t, got.TalentTrees, gotAgain.TalentTrees)

	var trees talents.TalentTreeData
	require.NoError(t, json.Unmarshal(got.TalentTrees, &trees))
	require.Len(t, trees.Classes, 1)
	warrior := trees.Classes[1]
	require.Equal(t, []string{"Arms", "Fury", "Protection"}, []string{
		warrior.Tabs[0].Name, warrior.Tabs[1].Name, warrior.Tabs[2].Name,
	})
	require.Equal(t, []int32{0, 1, 2}, []int32{
		warrior.Tabs[0].OrderIndex, warrior.Tabs[1].OrderIndex, warrior.Tabs[2].OrderIndex,
	})
	require.Equal(t, "tab_arms", warrior.Tabs[0].IconTexture)
	require.Len(t, warrior.Tabs[0].Talents, 3)
	require.Equal(t, []int32{105889, 105888, 105890}, []int32{
		warrior.Tabs[0].Talents[0].ID, warrior.Tabs[0].Talents[1].ID, warrior.Tabs[0].Talents[2].ID,
	})
	require.Equal(t, []int32{0, 1, 2}, []int32{
		warrior.Tabs[0].Talents[0].TabIndex, warrior.Tabs[0].Talents[1].TabIndex, warrior.Tabs[0].Talents[2].TabIndex,
	})
	logged := warrior.Tabs[0].Talents[1]
	require.Equal(t, int32(105888), logged.ID)
	require.Equal(t, []int32{130618}, logged.TraitNodeEntryIDs)
	require.Equal(t, int32(0), logged.TierID)
	require.Equal(t, int32(1), logged.ColumnIndex)
	require.Equal(t, int32(5), logged.MaxRank)
	require.Equal(t, []int32{100, 100, 100, 100, 100}, logged.SpellRanks)
	require.Equal(t, "First Talent", logged.Name)
	require.Equal(t, "talent_first", logged.IconTexture)
	require.Equal(t, []int32{105890}, logged.VisualPrereqTalent)

	dependent := warrior.Tabs[0].Talents[2]
	require.Equal(t, int32(105890), dependent.ID)
	require.Equal(t, []int32{105888}, dependent.PrereqTalent)
	require.Equal(t, []int32{105889}, dependent.PrereqAnyTalent)

	require.Equal(t, int32(16), trees.LegacyMaxPoints)
	require.Equal(t, int32(5), trees.LegacyPointsPerColumn)
	require.Len(t, trees.LegacyTrees, 1)
	legacy := trees.LegacyTrees[0]
	require.Equal(t, int32(1187), legacy.ID)
	require.Equal(t, "Professions", legacy.Name)
	require.Len(t, legacy.Talents, 2, "placeholder Unknown nodes are omitted")
	require.Equal(t, []int32{110290, 110292}, []int32{legacy.Talents[0].ID, legacy.Talents[1].ID})
	require.Equal(t, []int32{110290}, legacy.Talents[1].PrereqAnyTalent)
}

func TestModernRequiredTablesUseTraits(t *testing.T) {
	t.Parallel()
	require.NotContains(t, requiredTables, "Talent")
	require.NotContains(t, requiredTables, "TalentTab")
	for _, table := range []string{
		"TraitTree", "TraitNode", "TraitNodeEntry", "TraitDefinition", "TraitEdge",
		"TraitNodeXTraitNodeEntry", "TraitNodeGroup", "TraitNodeGroupXTraitNode",
		"TraitNodeGroupDisplayInfo", "SkillLineXTraitTree", "SkillLine",
	} {
		require.Contains(t, requiredTables, table)
		require.NotZero(t, wowdataTableHashes[table], "required table %s must support deterministic hotfix overlays", table)
	}
}

func TestConvertRejectsIncompleteManifest(t *testing.T) {
	t.Parallel()
	dir := newSnapshotFixture(t)
	data, err := os.ReadFile(filepath.Join(dir, "manifest.json"))
	require.NoError(t, err)
	var m Manifest
	require.NoError(t, json.Unmarshal(data, &m))
	m.Tables = m.Tables[:len(m.Tables)-1]
	data, err = json.Marshal(m)
	require.NoError(t, err)
	require.NoError(t, os.WriteFile(filepath.Join(dir, "manifest.json"), data, 0o600))
	_, err = Convert(dir, "wow_classic_beta", "")
	require.Error(t, err)
	require.True(t, strings.Contains(err.Error(), "missing required table"), err.Error())
}

func newSnapshotFixture(t *testing.T) string {
	t.Helper()
	dir := t.TempDir()
	require.NoError(t, os.Mkdir(filepath.Join(dir, "tables"), 0o755))
	m := Manifest{Format: SnapshotFormat, Target: Target{Product: "wow_classic_beta", BuildName: "1.60.1.69913", Locale: "enUS"}}
	for _, name := range requiredTables {
		rel := "tables/" + name + ".jsonl"
		m.Tables = append(m.Tables, ManifestTable{Name: name, Rows: rel})
		require.NoError(t, os.WriteFile(filepath.Join(dir, filepath.FromSlash(rel)), nil, 0o600))
	}
	data, err := json.Marshal(m)
	require.NoError(t, err)
	require.NoError(t, os.WriteFile(filepath.Join(dir, "manifest.json"), data, 0o600))
	return dir
}
func writeIconRows(t *testing.T, dir string, rows ...map[string]any) {
	t.Helper()
	path := filepath.Join(dir, "icons.jsonl")
	f, err := os.Create(path)
	require.NoError(t, err)
	enc := json.NewEncoder(f)
	for _, row := range rows {
		require.NoError(t, enc.Encode(row))
	}
	require.NoError(t, f.Close())

	data, err := os.ReadFile(filepath.Join(dir, "manifest.json"))
	require.NoError(t, err)
	var manifest Manifest
	require.NoError(t, json.Unmarshal(data, &manifest))
	manifest.Icons = &ManifestIcons{Rows: "icons.jsonl", Count: len(rows)}
	data, err = json.Marshal(manifest)
	require.NoError(t, err)
	require.NoError(t, os.WriteFile(filepath.Join(dir, "manifest.json"), data, 0o600))
}

func writeRows(t *testing.T, dir, table string, rows ...map[string]any) {
	t.Helper()
	f, err := os.Create(filepath.Join(dir, "tables", table+".jsonl"))
	require.NoError(t, err)
	enc := json.NewEncoder(f)
	for _, row := range rows {
		require.NoError(t, enc.Encode(row))
	}
	require.NoError(t, f.Close())
}
