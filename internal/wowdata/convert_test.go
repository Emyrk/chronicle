package wowdata

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"

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
		map[string]any{"ID": 2, "SpellID": 100, "DifficultyID": 0, "EffectIndex": 3, "Effect": 99})
	writeRows(t, dir, "SpellPower",
		map[string]any{"ID": 2, "SpellID": 100, "OrderIndex": 1, "ManaCost": 20},
		map[string]any{"ID": 1, "SpellID": 100, "OrderIndex": 0, "ManaCost": 10})
	writeRows(t, dir, "Item", map[string]any{"ID": 1, "ClassID": 2, "SubclassID": 3}, map[string]any{"ID": 2})
	writeRows(t, dir, "ItemSparse", map[string]any{"ID": 1, "Display_lang": "Safe Item", "OverallQualityID": 2, "Flags": []int{7}, "AllowableRace": []int{-1, -1}}, map[string]any{"ID": 3, "Display_lang": "orphan"})
	writeRows(t, dir, "Talent", map[string]any{"ID": 9, "TabID": 7, "TierID": 0, "ColumnIndex": 0, "SpellRank": []int{100, 0}})
	writeRows(t, dir, "TalentTab", map[string]any{"ID": 7, "Name_lang": "Tree", "ClassMask": 1, "SpellIconID": 999})
	writeRows(t, dir, "SpellCastTimes", map[string]any{"ID": 1, "Base": 1500, "Minimum": 500})
	writeRows(t, dir, "SpellItemEnchantment", map[string]any{"ID": 5, "Effect": []int{1, 2, 3}, "EffectArg": []int{4, 5, 6}, "Name_lang": "Enchant"})
	writeRows(t, dir, "ItemSet", map[string]any{"ID": 6, "Name_lang": "Set", "ItemID": []int{1, 2, 0}})

	got, err := Convert(dir, "wow_classic_beta", "1.60.1.69913")
	require.NoError(t, err)
	require.Len(t, got.Spells, 1)
	spell := got.Spells[0]
	require.Equal(t, int32(100), spell.SpellID)
	require.Equal(t, "Test Spell", spell.Name)
	require.Equal(t, int32(4), spell.School, "DifficultyID != 0 must not overwrite the base row")
	require.Equal(t, int32(4), spell.EffectBasePoints0, "modern actual base points are stored as legacy value-1")
	require.Equal(t, int32(10), spell.ManaCost, "lowest power OrderIndex wins")
	require.NotNil(t, spell.Reagent)
	require.NotNil(t, spell.ReagentCount)
	require.NotNil(t, spell.Attributes)
	require.NotNil(t, spell.Totem)
	require.NotNil(t, spell.SpellVisualID)
	require.Len(t, spell.Attributes, 9)
	require.Equal(t, 1, got.Losses.DroppedSpellAttributes)
	require.Equal(t, 1, got.Losses.DroppedSpellEffects)
	require.Equal(t, 1, got.Losses.DroppedSpellPowers)
	require.Equal(t, 1, got.Losses.DroppedOrphanSpellRows)
	require.Len(t, got.Items, 1)
	require.Equal(t, int32(0), got.Items[0].DisplayID, "display IDs must not be guessed")
	require.Equal(t, []int32{2}, got.Losses.MissingItemSparseIDs)
	require.Equal(t, []int32{3}, got.Losses.MissingItemBaseIDs)
	require.Len(t, got.SpellCastTimes, 1)
	require.Len(t, got.Enchantments, 1)
	require.Equal(t, []int32{1, 2}, got.ItemSets[0].ItemIDs)
	require.Contains(t, string(got.TalentTrees), `"name":"Test Spell"`)
	require.Contains(t, string(got.TalentTrees), `"iconTexture":""`)
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
