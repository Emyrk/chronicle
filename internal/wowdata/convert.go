package wowdata

import (
	"bufio"
	"encoding/json"
	"fmt"
	"math"
	"os"
	"path/filepath"
	"sort"
	"strings"

	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/spelldb"
)

var requiredTables = []string{
	"Talent", "TalentTab", "Spell", "SpellName", "SpellMisc", "SpellEffect",
	"SpellAuraOptions", "SpellAuraRestrictions", "SpellCastingRequirements", "SpellCategories",
	"SpellClassOptions", "SpellCooldowns", "SpellEquippedItems", "SpellInterrupts", "SpellLevels",
	"SpellPower", "SpellReagents", "SpellShapeshift", "SpellTargetRestrictions", "SpellTotems",
	"SpellXDescriptionVariables", "SpellCastTimes", "SpellDuration", "SpellRange", "SpellCategory",
	"SpellRadius", "SpellFocusObject", "SpellDescriptionVariables", "Item", "ItemSparse", "ItemEffect",
	"ItemDisplayInfo", "SpellItemEnchantment", "ItemSet",
}

func Convert(dir, expectedProduct, expectedBuild string) (*Import, error) {
	manifest, err := readManifest(dir)
	if err != nil {
		return nil, err
	}
	if manifest.Format != SnapshotFormat {
		return nil, fmt.Errorf("manifest format %q, want %q", manifest.Format, SnapshotFormat)
	}
	if manifest.RowLimit != 0 {
		return nil, fmt.Errorf("snapshot is limited to %d rows per table; a complete snapshot is required", manifest.RowLimit)
	}
	if manifest.Target.Product == "" || manifest.Target.BuildName == "" {
		return nil, fmt.Errorf("manifest target product and buildName are required")
	}
	if expectedProduct != "" && manifest.Target.Product != expectedProduct {
		return nil, fmt.Errorf("manifest product %q, want %q", manifest.Target.Product, expectedProduct)
	}
	if expectedBuild != "" && manifest.Target.BuildName != expectedBuild {
		return nil, fmt.Errorf("manifest build %q, want %q", manifest.Target.BuildName, expectedBuild)
	}
	present := make(map[string]bool, len(manifest.Tables))
	for _, table := range manifest.Tables {
		present[table.Name] = true
		if table.Rows == "" {
			return nil, fmt.Errorf("manifest table %s has no rows path", table.Name)
		}
		if _, err := os.Stat(filepath.Join(dir, filepath.FromSlash(table.Rows))); err != nil {
			return nil, fmt.Errorf("manifest table %s: %w", table.Name, err)
		}
	}
	for _, name := range requiredTables {
		if !present[name] {
			return nil, fmt.Errorf("manifest missing required table %s", name)
		}
	}

	out := &Import{Format: SnapshotFormat, Product: manifest.Target.Product, Build: manifest.Target.BuildName}
	out.Losses.Policies = []string{
		"All modern spell effects, powers, attributes, and difficulty-aware component rows are preserved in normalized storage.",
		"Legacy dbc_spells rows project DifficultyID=0, EffectIndex 0..2, and the first ordered power only.",
		"Component-only spell IDs are preserved in normalized storage even when the base Spell table has no matching row.",
		"Modern EffectBasePointsF is preserved directly and also converted to the legacy representation as round(value)-1 for consumers that still require it.",
		"Modern icon FileDataIDs are preserved as numeric spell icon IDs; listfile-backed icon paths are imported when present, while item display IDs are not guessed.",
		"Items without ItemSparse are reported and skipped; modern percentage stats, damage curves, armor curves, and unjoinable ItemEffect rows are not imported.",
	}
	if err := convertSpells(dir, out); err != nil {
		return nil, err
	}
	if err := convertIcons(dir, manifest, out); err != nil {
		return nil, err
	}
	if err := convertItems(dir, out); err != nil {
		return nil, err
	}
	if err := convertTalents(dir, out); err != nil {
		return nil, err
	}
	if err := convertMetadata(dir, out); err != nil {
		return nil, err
	}
	if err := convertEnchantments(dir, out); err != nil {
		return nil, err
	}
	if err := convertItemSets(dir, out); err != nil {
		return nil, err
	}
	return out, nil
}

func readManifest(dir string) (Manifest, error) {
	var m Manifest
	data, err := os.ReadFile(filepath.Join(dir, "manifest.json"))
	if err != nil {
		return m, fmt.Errorf("read manifest: %w", err)
	}
	if err := json.Unmarshal(data, &m); err != nil {
		return m, fmt.Errorf("decode manifest: %w", err)
	}
	return m, nil
}

func readRows[T any](dir, table string) ([]T, error) {
	f, err := os.Open(filepath.Join(dir, "tables", table+".jsonl"))
	if err != nil {
		return nil, fmt.Errorf("open %s: %w", table, err)
	}
	defer func() { _ = f.Close() }()
	var rows []T
	s := bufio.NewScanner(f)
	s.Buffer(make([]byte, 64*1024), 4*1024*1024)
	for line := 1; s.Scan(); line++ {
		var row T
		if err := json.Unmarshal(s.Bytes(), &row); err != nil {
			return nil, fmt.Errorf("decode %s line %d: %w", table, line, err)
		}
		rows = append(rows, row)
	}
	if err := s.Err(); err != nil {
		return nil, fmt.Errorf("scan %s: %w", table, err)
	}
	return rows, nil
}

type spellTextRow struct {
	ID              int32
	Name            string `json:"Name_lang"`
	NameSubtext     string `json:"NameSubtext_lang"`
	Description     string `json:"Description_lang"`
	AuraDescription string `json:"AuraDescription_lang"`
}
type spellNameRow struct {
	ID   int32
	Name string `json:"Name_lang"`
}
type spellMiscRow struct {
	ID, SpellID, DifficultyID                        int32
	ActiveIconFileDataID, ActiveSpellVisualScript    int32
	Attributes                                       []int32
	CastingTimeIndex, ContentTuningID, DurationIndex int32
	LaunchDelay, MinDuration                         float32
	PvPDurationIndex, RangeIndex, SchoolMask         int32
	ShowFutureSpellPlayerConditionID                 int32
	Speed                                            float32
	SpellIconFileDataID, SpellVisualScript           int32
}
type spellEffectRow struct {
	ID, SpellID, DifficultyID, EffectIndex                     int32
	BonusCoefficientFromAP, Coefficient                        float32
	Effect, EffectAttributes, EffectAura, EffectAuraPeriod     int32
	EffectAmplitude, EffectBasePointsF, EffectBonusCoefficient float32
	EffectChainAmplitude                                       float32
	EffectChainTargets, EffectItemType, EffectMechanic         int32
	EffectMiscValue                                            []int32
	EffectPointsPerResource, EffectPosFacing                   float32
	EffectRadiusIndex, EffectSpellClassMask                    []int32
	EffectRealPointsPerLevel                                   float32
	EffectTriggerSpell                                         int32
	GroupSizeBasePointsCoefficient                             float32
	NodeField120063534001                                      int32 `json:"Node__Field_12_0_0_63534_001"`
	PvpMultiplier, ResourceCoefficient                         float32
	ScalingClass                                               int32
	ImplicitTarget                                             []int32
	Variance                                                   float32
}
type auraOptionsRow struct {
	ID, SpellID, DifficultyID, CumulativeAura, ProcCategoryRecovery int32
	ProcChance, ProcCharges                                         int32
	ProcTypeMask                                                    []int32
	SpellProcsPerMinuteID                                           int32
}
type auraRestrictionsRow struct {
	ID, SpellID, DifficultyID, CasterAuraSpell, CasterAuraState, CasterAuraType int32
	ExcludeCasterAuraSpell, ExcludeCasterAuraState, ExcludeCasterAuraType       int32
	ExcludeTargetAuraSpell, ExcludeTargetAuraState, ExcludeTargetAuraType       int32
	TargetAuraSpell, TargetAuraState, TargetAuraType                            int32
}
type castingReqRow struct{ ID, SpellID, MinFactionID, MinReputation, RequiredAuraVision, RequiresSpellFocus int32 }
type categoriesRow struct {
	ID, SpellID, DifficultyID, Category, ChargeCategory, DefenseType int32
	DiminishType, DispelType, Mechanic, PreventionType               int32
	StartRecoveryCategory                                            int32
}
type classOptionsRow struct {
	ID, SpellID, ModalNextSpell, SpellClassSet int32
	SpellClassMask                             []int32
}
type cooldownRow struct {
	ID, SpellID, DifficultyID, AuraSpellID                int32
	CategoryRecoveryTime, RecoveryTime, StartRecoveryTime int32
}
type equippedRow struct{ ID, SpellID, EquippedItemClass, EquippedItemInvTypes, EquippedItemSubclass int32 }
type interruptsRow struct {
	ID, SpellID, DifficultyID, InterruptFlags int32
	AuraInterruptFlags, ChannelInterruptFlags []int32
}
type levelsRow struct {
	ID, SpellID, DifficultyID, BaseLevel, MaxLevel int32
	MaxPassiveAuraLevel, SpellLevel                int32
}
type powerRow struct {
	ID, SpellID, OrderIndex, AltPowerBarID, ManaCost, ManaCostPerLevel int32
	ManaPerSecond, OptionalCost                                        int32
	OptionalCostPct, PowerCostMaxPct, PowerCostPct                     float32
	PowerDisplayID                                                     int32
	PowerPctPerSecond                                                  float32
	PowerType, RequiredAuraSpellID                                     int32
}
type reagentsRow struct {
	ID, SpellID           int32
	Reagent, ReagentCount []int32
}
type shapeshiftRow struct{ ID, SpellID, StanceBarOrder int32 }
type targetRestrictionsRow struct {
	ID, SpellID, DifficultyID, MaxTargetLevel, MaxTargets int32
	TargetCreatureType, Targets                           int32
	ConeDegrees, Width                                    float32
}
type totemsRow struct {
	ID, SpellID             int32
	Totem                   []int32
	RequiredTotemCategoryID []int32
}
type descXRow struct{ ID, SpellID, SpellDescriptionVariablesID int32 }

type iconFileRow struct {
	FileDataID int32  `json:"fileDataID"`
	FileName   string `json:"fileName"`
}

func convertIcons(dir string, manifest Manifest, out *Import) error {
	if manifest.Icons == nil || manifest.Icons.Rows == "" {
		return nil
	}
	out.SpellIcons = make([]SpellIcon, 0, manifest.Icons.Count)
	path := filepath.Join(dir, filepath.FromSlash(manifest.Icons.Rows))
	f, err := os.Open(path)
	if err != nil {
		return fmt.Errorf("open icons: %w", err)
	}
	defer func() { _ = f.Close() }()

	s := bufio.NewScanner(f)
	s.Buffer(make([]byte, 64*1024), 4*1024*1024)
	for line := 1; s.Scan(); line++ {
		var row iconFileRow
		if err := json.Unmarshal(s.Bytes(), &row); err != nil {
			return fmt.Errorf("decode icons line %d: %w", line, err)
		}
		texture, ok := iconTextureName(row.FileName)
		if !ok || row.FileDataID == 0 {
			continue
		}
		out.SpellIcons = append(out.SpellIcons, SpellIcon{ID: row.FileDataID, TextureFilename: texture})
	}
	if err := s.Err(); err != nil {
		return fmt.Errorf("scan icons: %w", err)
	}
	sort.Slice(out.SpellIcons, func(i, j int) bool { return out.SpellIcons[i].ID < out.SpellIcons[j].ID })
	return nil
}

func iconTextureName(name string) (string, bool) {
	name = strings.ToLower(strings.ReplaceAll(name, `\`, "/"))
	const prefix = "interface/icons/"
	if !strings.HasPrefix(name, prefix) || !strings.HasSuffix(name, ".blp") {
		return "", false
	}
	name = strings.TrimSuffix(strings.TrimPrefix(name, prefix), ".blp")
	if name == "" || strings.ContainsRune(name, '/') {
		return "", false
	}
	return name, true
}

func convertSpells(dir string, out *Import) error {
	texts, err := readRows[spellTextRow](dir, "Spell")
	if err != nil {
		return err
	}
	names, err := readRows[spellNameRow](dir, "SpellName")
	if err != nil {
		return err
	}
	byID := make(map[int32]*spelldb.SpellRow, len(texts))
	baseIDs := make(map[int32]struct{}, len(texts))
	for _, x := range texts {
		baseIDs[x.ID] = struct{}{}
		byID[x.ID] = &spelldb.SpellRow{SpellID: x.ID, NameSubtext: x.NameSubtext, Description: x.Description, AuraDescription: x.AuraDescription}
	}
	for _, x := range names {
		s := ensureSpell(byID, x.ID)
		s.Name = x.Name
	}
	type variantKey struct{ spellID, difficultyID int32 }
	variants := make(map[variantKey]*SpellVariant)
	ensureVariant := func(spellID, difficultyID int32) *SpellVariant {
		key := variantKey{spellID: spellID, difficultyID: difficultyID}
		if variants[key] == nil {
			variants[key] = &SpellVariant{SpellID: spellID, DifficultyID: difficultyID}
		}
		return variants[key]
	}
	misc, err := readRows[spellMiscRow](dir, "SpellMisc")
	if err != nil {
		return err
	}
	for _, x := range misc {
		ensureVariant(x.SpellID, x.DifficultyID).Misc = &SpellMisc{
			SourceID: x.ID, ActiveIconFileDataID: x.ActiveIconFileDataID, ActiveSpellVisualScript: x.ActiveSpellVisualScript,
			Attributes: append([]int32(nil), x.Attributes...), CastingTimeIndex: x.CastingTimeIndex, ContentTuningID: x.ContentTuningID,
			DurationIndex: x.DurationIndex, LaunchDelay: x.LaunchDelay, MinDuration: x.MinDuration, PvPDurationIndex: x.PvPDurationIndex,
			RangeIndex: x.RangeIndex, SchoolMask: x.SchoolMask, ShowFutureSpellPlayerConditionID: x.ShowFutureSpellPlayerConditionID,
			Speed: x.Speed, SpellIconFileDataID: x.SpellIconFileDataID, SpellVisualScript: x.SpellVisualScript,
		}
		if x.DifficultyID != 0 {
			continue
		}
		s := ensureSpell(byID, x.SpellID)
		if len(x.Attributes) > 9 {
			out.Losses.DroppedSpellAttributes += len(x.Attributes) - 9
		}
		s.Attributes = take(x.Attributes, 9)
		s.CastingTimeIndex = x.CastingTimeIndex
		s.DurationIndex = x.DurationIndex
		s.RangeIndex = x.RangeIndex
		s.School = x.SchoolMask
		s.Speed = x.Speed
		s.SpellIconID = x.SpellIconFileDataID
		s.ActiveIconID = x.ActiveIconFileDataID
	}
	effects, err := readRows[spellEffectRow](dir, "SpellEffect")
	if err != nil {
		return err
	}
	for _, x := range effects {
		out.SpellEffects = append(out.SpellEffects, SpellEffect{
			SourceID: x.ID, SpellID: x.SpellID, DifficultyID: x.DifficultyID, EffectIndex: x.EffectIndex,
			BonusCoefficientFromAP: x.BonusCoefficientFromAP, Coefficient: x.Coefficient, Effect: x.Effect,
			EffectAttributes: x.EffectAttributes, EffectAura: x.EffectAura, EffectAuraPeriod: x.EffectAuraPeriod,
			EffectAmplitude: x.EffectAmplitude, EffectBasePointsF: x.EffectBasePointsF, EffectBonusCoefficient: x.EffectBonusCoefficient,
			EffectChainAmplitude: x.EffectChainAmplitude, EffectChainTargets: x.EffectChainTargets, EffectItemType: x.EffectItemType,
			EffectMechanic: x.EffectMechanic, EffectMiscValue: append([]int32(nil), x.EffectMiscValue...),
			EffectPointsPerResource: x.EffectPointsPerResource, EffectPosFacing: x.EffectPosFacing,
			EffectRadiusIndex: append([]int32(nil), x.EffectRadiusIndex...), EffectSpellClassMask: append([]int32(nil), x.EffectSpellClassMask...),
			EffectRealPointsPerLevel: x.EffectRealPointsPerLevel, EffectTriggerSpell: x.EffectTriggerSpell,
			GroupSizeBasePointsCoefficient: x.GroupSizeBasePointsCoefficient, NodeField120063534001: x.NodeField120063534001,
			PvpMultiplier: x.PvpMultiplier, ResourceCoefficient: x.ResourceCoefficient, ScalingClass: x.ScalingClass,
			ImplicitTarget: append([]int32(nil), x.ImplicitTarget...), Variance: x.Variance,
		})
		if x.DifficultyID != 0 {
			continue
		}
		if x.EffectIndex < 0 || x.EffectIndex > 2 {
			out.Losses.DroppedSpellEffects++
			continue
		}
		s := ensureSpell(byID, x.SpellID)
		base := int32(math.Round(float64(x.EffectBasePointsF))) - 1
		if math.Abs(float64(x.EffectBasePointsF)-math.Round(float64(x.EffectBasePointsF))) > 0.0001 {
			out.Losses.RoundedBasePoints++
		}
		setEffect(s, int(x.EffectIndex), x, base)
	}
	aura, err := readRows[auraOptionsRow](dir, "SpellAuraOptions")
	if err != nil {
		return err
	}
	for _, x := range aura {
		ensureVariant(x.SpellID, x.DifficultyID).AuraOptions = &SpellAuraOptions{
			SourceID: x.ID, CumulativeAura: x.CumulativeAura, ProcCategoryRecovery: x.ProcCategoryRecovery,
			ProcChance: x.ProcChance, ProcCharges: x.ProcCharges, ProcTypeMask: append([]int32(nil), x.ProcTypeMask...),
			SpellProcsPerMinuteID: x.SpellProcsPerMinuteID,
		}
		if x.DifficultyID != 0 {
			continue
		}
		s := ensureSpell(byID, x.SpellID)
		s.CumulativeAura = x.CumulativeAura
		s.ProcChance = x.ProcChance
		s.ProcCharges = x.ProcCharges
		s.ProcTypeMask = at(x.ProcTypeMask, 0)
	}
	restrictions, err := readRows[auraRestrictionsRow](dir, "SpellAuraRestrictions")
	if err != nil {
		return err
	}
	for _, x := range restrictions {
		ensureVariant(x.SpellID, x.DifficultyID).AuraRestrictions = &SpellAuraRestrictions{
			SourceID: x.ID, CasterAuraSpell: x.CasterAuraSpell, CasterAuraState: x.CasterAuraState, CasterAuraType: x.CasterAuraType,
			ExcludeCasterAuraSpell: x.ExcludeCasterAuraSpell, ExcludeCasterAuraState: x.ExcludeCasterAuraState, ExcludeCasterAuraType: x.ExcludeCasterAuraType,
			ExcludeTargetAuraSpell: x.ExcludeTargetAuraSpell, ExcludeTargetAuraState: x.ExcludeTargetAuraState, ExcludeTargetAuraType: x.ExcludeTargetAuraType,
			TargetAuraSpell: x.TargetAuraSpell, TargetAuraState: x.TargetAuraState, TargetAuraType: x.TargetAuraType,
		}
		if x.DifficultyID != 0 {
			continue
		}
		s := ensureSpell(byID, x.SpellID)
		s.CasterAuraSpell = x.CasterAuraSpell
		s.CasterAuraState = x.CasterAuraState
		s.ExcludeCasterAuraSpell = x.ExcludeCasterAuraSpell
		s.ExcludeCasterAuraState = x.ExcludeCasterAuraState
		s.ExcludeTargetAuraSpell = x.ExcludeTargetAuraSpell
		s.ExcludeTargetAuraState = x.ExcludeTargetAuraState
		s.TargetAuraSpell = x.TargetAuraSpell
		s.TargetAuraState = x.TargetAuraState
	}
	reqs, err := readRows[castingReqRow](dir, "SpellCastingRequirements")
	if err != nil {
		return err
	}
	for _, x := range reqs {
		s := ensureSpell(byID, x.SpellID)
		s.MinFactionID = x.MinFactionID
		s.MinReputation = x.MinReputation
		s.RequiredAuraVision = x.RequiredAuraVision
		s.RequiresSpellFocus = x.RequiresSpellFocus
	}
	cats, err := readRows[categoriesRow](dir, "SpellCategories")
	if err != nil {
		return err
	}
	for _, x := range cats {
		ensureVariant(x.SpellID, x.DifficultyID).Categories = &SpellCategories{SourceID: x.ID, Category: x.Category, ChargeCategory: x.ChargeCategory, DefenseType: x.DefenseType, DiminishType: x.DiminishType, DispelType: x.DispelType, Mechanic: x.Mechanic, PreventionType: x.PreventionType, StartRecoveryCategory: x.StartRecoveryCategory}
		if x.DifficultyID != 0 {
			continue
		}
		s := ensureSpell(byID, x.SpellID)
		s.Category = x.Category
		s.DefenseType = x.DefenseType
		s.DispelType = x.DispelType
		s.Mechanic = x.Mechanic
		s.PreventionType = x.PreventionType
		s.StartRecoveryCategory = x.StartRecoveryCategory
	}
	classes, err := readRows[classOptionsRow](dir, "SpellClassOptions")
	if err != nil {
		return err
	}
	for _, x := range classes {
		ensureVariant(x.SpellID, 0).ClassOptions = &SpellClassOptions{
			SourceID: x.ID, ModalNextSpell: x.ModalNextSpell, SpellClassSet: x.SpellClassSet,
			SpellClassMask: append([]int32(nil), x.SpellClassMask...),
		}
		s := ensureSpell(byID, x.SpellID)
		s.ModalNextSpell = x.ModalNextSpell
		s.SpellClassSet = x.SpellClassSet
		s.SpellClassMask = mask64(x.SpellClassMask)
	}
	cds, err := readRows[cooldownRow](dir, "SpellCooldowns")
	if err != nil {
		return err
	}
	for _, x := range cds {
		ensureVariant(x.SpellID, x.DifficultyID).Cooldowns = &SpellCooldowns{SourceID: x.ID, AuraSpellID: x.AuraSpellID, CategoryRecoveryTime: x.CategoryRecoveryTime, RecoveryTime: x.RecoveryTime, StartRecoveryTime: x.StartRecoveryTime}
		if x.DifficultyID != 0 {
			continue
		}
		s := ensureSpell(byID, x.SpellID)
		s.CategoryRecoveryTimeMs = int64(x.CategoryRecoveryTime)
		s.RecoveryTimeMs = int64(x.RecoveryTime)
		s.StartRecoveryTimeMs = int64(x.StartRecoveryTime)
	}
	equipped, err := readRows[equippedRow](dir, "SpellEquippedItems")
	if err != nil {
		return err
	}
	for _, x := range equipped {
		s := ensureSpell(byID, x.SpellID)
		s.EquippedItemClass = x.EquippedItemClass
		s.EquippedItemInvTypes = x.EquippedItemInvTypes
		s.EquippedItemSubclass = x.EquippedItemSubclass
	}
	ints, err := readRows[interruptsRow](dir, "SpellInterrupts")
	if err != nil {
		return err
	}
	for _, x := range ints {
		ensureVariant(x.SpellID, x.DifficultyID).Interrupts = &SpellInterrupts{SourceID: x.ID, InterruptFlags: x.InterruptFlags, AuraInterruptFlags: append([]int32(nil), x.AuraInterruptFlags...), ChannelInterruptFlags: append([]int32(nil), x.ChannelInterruptFlags...)}
		if x.DifficultyID != 0 {
			continue
		}
		s := ensureSpell(byID, x.SpellID)
		s.InterruptFlags = x.InterruptFlags
		s.AuraInterruptFlags = at(x.AuraInterruptFlags, 0)
	}
	levels, err := readRows[levelsRow](dir, "SpellLevels")
	if err != nil {
		return err
	}
	for _, x := range levels {
		ensureVariant(x.SpellID, x.DifficultyID).Levels = &SpellLevels{SourceID: x.ID, BaseLevel: x.BaseLevel, MaxLevel: x.MaxLevel, MaxPassiveAuraLevel: x.MaxPassiveAuraLevel, SpellLevel: x.SpellLevel}
		if x.DifficultyID != 0 {
			continue
		}
		s := ensureSpell(byID, x.SpellID)
		s.BaseLevel = x.BaseLevel
		s.MaxLevel = x.MaxLevel
		s.SpellLevel = x.SpellLevel
	}
	powers, err := readRows[powerRow](dir, "SpellPower")
	if err != nil {
		return err
	}
	sort.Slice(powers, func(i, j int) bool {
		if powers[i].SpellID != powers[j].SpellID {
			return powers[i].SpellID < powers[j].SpellID
		}
		if powers[i].OrderIndex != powers[j].OrderIndex {
			return powers[i].OrderIndex < powers[j].OrderIndex
		}
		return powers[i].ID < powers[j].ID
	})
	seenPower := map[int32]bool{}
	for _, x := range powers {
		out.SpellPowers = append(out.SpellPowers, SpellPower{
			SourceID: x.ID, SpellID: x.SpellID, OrderIndex: x.OrderIndex, AltPowerBarID: x.AltPowerBarID,
			ManaCost: x.ManaCost, ManaCostPerLevel: x.ManaCostPerLevel, ManaPerSecond: x.ManaPerSecond,
			OptionalCost: x.OptionalCost, OptionalCostPct: x.OptionalCostPct, PowerCostMaxPct: x.PowerCostMaxPct,
			PowerCostPct: x.PowerCostPct, PowerDisplayID: x.PowerDisplayID, PowerPctPerSecond: x.PowerPctPerSecond,
			PowerType: x.PowerType, RequiredAuraSpellID: x.RequiredAuraSpellID,
		})
		if seenPower[x.SpellID] {
			out.Losses.DroppedSpellPowers++
			continue
		}
		seenPower[x.SpellID] = true
		s := ensureSpell(byID, x.SpellID)
		s.PowerType = x.PowerType
		s.ManaCost = x.ManaCost
		s.ManaCostPerLevel = x.ManaCostPerLevel
		s.ManaPerSecond = x.ManaPerSecond
		s.ManaCostPct = int32(math.Round(float64(x.PowerCostPct)))
	}
	reagents, err := readRows[reagentsRow](dir, "SpellReagents")
	if err != nil {
		return err
	}
	for _, x := range reagents {
		s := ensureSpell(byID, x.SpellID)
		s.Reagent = x.Reagent
		s.ReagentCount = x.ReagentCount
	}
	shapes, err := readRows[shapeshiftRow](dir, "SpellShapeshift")
	if err != nil {
		return err
	}
	for _, x := range shapes {
		ensureSpell(byID, x.SpellID).StanceBarOrder = x.StanceBarOrder
	}
	targets, err := readRows[targetRestrictionsRow](dir, "SpellTargetRestrictions")
	if err != nil {
		return err
	}
	for _, x := range targets {
		ensureVariant(x.SpellID, x.DifficultyID).TargetRestrictions = &SpellTargetRestrictions{SourceID: x.ID, MaxTargetLevel: x.MaxTargetLevel, MaxTargets: x.MaxTargets, TargetCreatureType: x.TargetCreatureType, Targets: x.Targets, ConeDegrees: x.ConeDegrees, Width: x.Width}
		if x.DifficultyID != 0 {
			continue
		}
		s := ensureSpell(byID, x.SpellID)
		s.MaxTargetLevel = x.MaxTargetLevel
		s.MaxTargets = x.MaxTargets
		s.TargetCreatureType = x.TargetCreatureType
		s.Targets = x.Targets
	}
	totems, err := readRows[totemsRow](dir, "SpellTotems")
	if err != nil {
		return err
	}
	for _, x := range totems {
		s := ensureSpell(byID, x.SpellID)
		s.Totem = x.Totem
		s.TotemsID = at(x.RequiredTotemCategoryID, 0)
	}
	dx, err := readRows[descXRow](dir, "SpellXDescriptionVariables")
	if err != nil {
		return err
	}
	for _, x := range dx {
		ensureSpell(byID, x.SpellID).DescriptionVariablesID = x.SpellDescriptionVariablesID
	}
	ids := make([]int, 0, len(baseIDs))
	for id := range byID {
		if _, ok := baseIDs[id]; !ok {
			out.Losses.DroppedOrphanSpellRows++
			continue
		}
		ids = append(ids, int(id))
	}
	sort.Ints(ids)
	out.Spells = make([]spelldb.SpellRow, 0, len(ids))
	for _, id := range ids {
		spell := *byID[int32(id)]
		normalizeSpellArrays(&spell)
		out.Spells = append(out.Spells, spell)
	}
	variantKeys := make([]variantKey, 0, len(variants))
	for key := range variants {
		variantKeys = append(variantKeys, key)
	}
	sort.Slice(variantKeys, func(i, j int) bool {
		if variantKeys[i].spellID != variantKeys[j].spellID {
			return variantKeys[i].spellID < variantKeys[j].spellID
		}
		return variantKeys[i].difficultyID < variantKeys[j].difficultyID
	})
	out.SpellVariants = make([]SpellVariant, 0, len(variantKeys))
	for _, key := range variantKeys {
		out.SpellVariants = append(out.SpellVariants, *variants[key])
	}
	return nil
}

func normalizeSpellArrays(spell *spelldb.SpellRow) {
	if spell.Reagent == nil {
		spell.Reagent = []int32{}
	}
	if spell.ReagentCount == nil {
		spell.ReagentCount = []int32{}
	}
	if spell.Attributes == nil {
		spell.Attributes = []int32{}
	}
	if spell.Totem == nil {
		spell.Totem = []int32{}
	}
	if spell.SpellVisualID == nil {
		spell.SpellVisualID = []int32{}
	}
}

func ensureSpell(m map[int32]*spelldb.SpellRow, id int32) *spelldb.SpellRow {
	if m[id] == nil {
		m[id] = &spelldb.SpellRow{SpellID: id}
	}
	return m[id]
}
func at(s []int32, i int) int32 {
	if i >= 0 && i < len(s) {
		return s[i]
	}
	return 0
}
func take(s []int32, n int) []int32 {
	if len(s) > n {
		s = s[:n]
	}
	return append([]int32(nil), s...)
}
func mask64(s []int32) int64 { return int64(uint64(uint32(at(s, 0))) | uint64(uint32(at(s, 1)))<<32) }
func setEffect(s *spelldb.SpellRow, i int, x spellEffectRow, base int32) {
	if len(s.EffectBasePointsF) < 3 {
		s.EffectBasePointsF = make([]float32, 3)
	}
	s.EffectBasePointsF[i] = x.EffectBasePointsF
	switch i {
	case 0:
		s.Effect0 = x.Effect
		s.EffectRealPtsPerLevel0 = x.EffectRealPointsPerLevel
		s.EffectBasePoints0 = base
		s.EffectMechanic0 = x.EffectMechanic
		s.EffectRadiusIndex0 = at(x.EffectRadiusIndex, 0)
		s.EffectAura0 = x.EffectAura
		s.EffectAuraPeriod0 = x.EffectAuraPeriod
		s.EffectAmplitude0 = x.EffectAmplitude
		s.EffectChainTargets0 = x.EffectChainTargets
		s.EffectItemType0 = x.EffectItemType
		s.EffectMiscValue0 = at(x.EffectMiscValue, 0)
		s.EffectTriggerSpell0 = x.EffectTriggerSpell
		s.EffectPtsPerCombo0 = x.EffectPointsPerResource
		s.EffectChainAmplitude0 = x.EffectChainAmplitude
		s.ImplicitTargetA0 = at(x.ImplicitTarget, 0)
		s.ImplicitTargetB0 = at(x.ImplicitTarget, 1)
	case 1:
		s.Effect1 = x.Effect
		s.EffectRealPtsPerLevel1 = x.EffectRealPointsPerLevel
		s.EffectBasePoints1 = base
		s.EffectMechanic1 = x.EffectMechanic
		s.EffectRadiusIndex1 = at(x.EffectRadiusIndex, 0)
		s.EffectAura1 = x.EffectAura
		s.EffectAuraPeriod1 = x.EffectAuraPeriod
		s.EffectAmplitude1 = x.EffectAmplitude
		s.EffectChainTargets1 = x.EffectChainTargets
		s.EffectItemType1 = x.EffectItemType
		s.EffectMiscValue1 = at(x.EffectMiscValue, 0)
		s.EffectTriggerSpell1 = x.EffectTriggerSpell
		s.EffectPtsPerCombo1 = x.EffectPointsPerResource
		s.EffectChainAmplitude1 = x.EffectChainAmplitude
		s.ImplicitTargetA1 = at(x.ImplicitTarget, 0)
		s.ImplicitTargetB1 = at(x.ImplicitTarget, 1)
	case 2:
		s.Effect2 = x.Effect
		s.EffectRealPtsPerLevel2 = x.EffectRealPointsPerLevel
		s.EffectBasePoints2 = base
		s.EffectMechanic2 = x.EffectMechanic
		s.EffectRadiusIndex2 = at(x.EffectRadiusIndex, 0)
		s.EffectAura2 = x.EffectAura
		s.EffectAuraPeriod2 = x.EffectAuraPeriod
		s.EffectAmplitude2 = x.EffectAmplitude
		s.EffectChainTargets2 = x.EffectChainTargets
		s.EffectItemType2 = x.EffectItemType
		s.EffectMiscValue2 = at(x.EffectMiscValue, 0)
		s.EffectTriggerSpell2 = x.EffectTriggerSpell
		s.EffectPtsPerCombo2 = x.EffectPointsPerResource
		s.EffectChainAmplitude2 = x.EffectChainAmplitude
		s.ImplicitTargetA2 = at(x.ImplicitTarget, 0)
		s.ImplicitTargetB2 = at(x.ImplicitTarget, 1)
	}
}

type itemBaseRow struct{ ID, ClassID, SubclassID, InventoryType, Material, SheatheType, AmmunitionType int32 }
type itemSparseRow struct {
	ID                                                                                                                                                                        int32
	Display                                                                                                                                                                   string `json:"Display_lang"`
	Description                                                                                                                                                               string `json:"Description_lang"`
	OverallQualityID                                                                                                                                                          int32
	Flags                                                                                                                                                                     []int32
	BuyPrice, SellPrice, InventoryType, AllowableClass                                                                                                                        int32
	AllowableRace                                                                                                                                                             []int32
	ItemLevel, RequiredLevel, RequiredSkill, RequiredSkillRank, RequiredAbility, RequiredPVPRank, MinFactionID, MinReputation, MaxCount, Stackable, ContainerSlots, ItemDelay int32
	Bonding, PageID, LanguageID, PageMaterialID, StartQuestID, LockID, Material, SheatheType, ItemSet, DurationInInventory, BagFamily, TotemCategoryID                        int32
	SocketType                                                                                                                                                                []int32
	Socket_match_enchantment_ID, Gem_properties, LimitCategory, RequiredHoliday, AmmunitionType                                                                               int32
	ZoneBound                                                                                                                                                                 []int32
}

func convertItems(dir string, out *Import) error {
	bases, err := readRows[itemBaseRow](dir, "Item")
	if err != nil {
		return err
	}
	sparse, err := readRows[itemSparseRow](dir, "ItemSparse")
	if err != nil {
		return err
	}
	bm := map[int32]itemBaseRow{}
	for _, x := range bases {
		bm[x.ID] = x
	}
	sm := map[int32]itemSparseRow{}
	for _, x := range sparse {
		sm[x.ID] = x
		if _, ok := bm[x.ID]; !ok {
			out.Losses.MissingItemBaseIDs = append(out.Losses.MissingItemBaseIDs, x.ID)
		}
	}
	for _, b := range bases {
		x, ok := sm[b.ID]
		if !ok {
			out.Losses.MissingItemSparseIDs = append(out.Losses.MissingItemSparseIDs, b.ID)
			continue
		}
		r := database.WorldItemTemplate{Entry: b.ID, Class: b.ClassID, Subclass: b.SubclassID, Name: x.Display, Description: x.Description, Quality: x.OverallQualityID, Flags: at(x.Flags, 0), BuyPrice: x.BuyPrice, SellPrice: x.SellPrice, InventoryType: x.InventoryType, AllowableClass: x.AllowableClass, AllowableRace: at(x.AllowableRace, 0), ItemLevel: x.ItemLevel, RequiredLevel: x.RequiredLevel, RequiredSkill: x.RequiredSkill, RequiredSkillRank: x.RequiredSkillRank, RequiredSpell: x.RequiredAbility, RequiredHonorRank: x.RequiredPVPRank, RequiredReputationFaction: x.MinFactionID, RequiredReputationRank: x.MinReputation, MaxCount: x.MaxCount, Stackable: x.Stackable, ContainerSlots: x.ContainerSlots, Delay: x.ItemDelay, AmmoType: x.AmmunitionType, Bonding: x.Bonding, PageText: x.PageID, PageLanguage: x.LanguageID, PageMaterial: x.PageMaterialID, StartQuest: x.StartQuestID, LockID: x.LockID, Material: x.Material, Sheath: x.SheatheType, SetID: x.ItemSet, Duration: x.DurationInInventory, BagFamily: x.BagFamily, TotemCategory: x.TotemCategoryID, SocketColor1: at(x.SocketType, 0), SocketColor2: at(x.SocketType, 1), SocketColor3: at(x.SocketType, 2), SocketBonus: x.Socket_match_enchantment_ID, GemProperties: x.Gem_properties, ItemLimitCategory: x.LimitCategory, HolidayID: x.RequiredHoliday, AreaBound: at(x.ZoneBound, 0), MapBound: at(x.ZoneBound, 1)}
		out.Items = append(out.Items, r)
	}
	sort.Slice(out.Items, func(i, j int) bool { return out.Items[i].Entry < out.Items[j].Entry })
	sort.Slice(out.Losses.MissingItemSparseIDs, func(i, j int) bool { return out.Losses.MissingItemSparseIDs[i] < out.Losses.MissingItemSparseIDs[j] })
	sort.Slice(out.Losses.MissingItemBaseIDs, func(i, j int) bool { return out.Losses.MissingItemBaseIDs[i] < out.Losses.MissingItemBaseIDs[j] })
	out.Losses.MissingItemSparseCount = len(out.Losses.MissingItemSparseIDs)
	out.Losses.MissingItemBaseCount = len(out.Losses.MissingItemBaseIDs)
	return nil
}

type talentRow struct {
	ID, TabID, TierID, ColumnIndex      int32
	SpellRank, PrereqTalent, PrereqRank []int32
}
type talentTabRow struct {
	ID                                 int32
	Name                               string `json:"Name_lang"`
	BackgroundFile                     string
	OrderIndex, ClassMask, SpellIconID int32
}
type talentTrees struct {
	Classes map[int32]talentClass `json:"classes"`
	Pets    map[int32]talentClass `json:"pets,omitempty"`
}
type talentClass struct {
	Tabs []talentTab `json:"tabs"`
}
type talentTab struct {
	ID             int32         `json:"id"`
	Name           string        `json:"name"`
	BackgroundFile string        `json:"backgroundFile"`
	OrderIndex     int32         `json:"orderIndex"`
	SpellIconID    int32         `json:"spellIconID"`
	IconTexture    string        `json:"iconTexture"`
	Talents        []talentEntry `json:"talents"`
}
type talentEntry struct {
	ID           int32   `json:"id"`
	Name         string  `json:"name"`
	TierID       int32   `json:"tierID"`
	ColumnIndex  int32   `json:"columnIndex"`
	MaxRank      int32   `json:"maxRank"`
	TabIndex     int32   `json:"tabIndex"`
	SpellRanks   []int32 `json:"spellRanks"`
	PrereqTalent []int32 `json:"prereqTalent,omitempty"`
	PrereqRank   []int32 `json:"prereqRank,omitempty"`
	IconTexture  string  `json:"iconTexture"`
}

func convertTalents(dir string, out *Import) error {
	rows, err := readRows[talentRow](dir, "Talent")
	if err != nil {
		return err
	}
	tabs, err := readRows[talentTabRow](dir, "TalentTab")
	if err != nil {
		return err
	}
	names := map[int32]string{}
	spellIconIDs := map[int32]int32{}
	iconTextures := map[int32]string{}
	for i := range out.Spells {
		names[out.Spells[i].SpellID] = out.Spells[i].Name
		spellIconIDs[out.Spells[i].SpellID] = out.Spells[i].SpellIconID
	}
	for _, icon := range out.SpellIcons {
		iconTextures[icon.ID] = icon.TextureFilename
	}
	byTab := map[int32][]talentRow{}
	for _, x := range rows {
		byTab[x.TabID] = append(byTab[x.TabID], x)
	}
	tree := talentTrees{Classes: map[int32]talentClass{}, Pets: map[int32]talentClass{}}
	sort.Slice(tabs, func(i, j int) bool {
		if tabs[i].OrderIndex != tabs[j].OrderIndex {
			return tabs[i].OrderIndex < tabs[j].OrderIndex
		}
		return tabs[i].ID < tabs[j].ID
	})
	for _, tab := range tabs {
		ts := byTab[tab.ID]
		sort.Slice(ts, func(i, j int) bool {
			if ts[i].TierID != ts[j].TierID {
				return ts[i].TierID < ts[j].TierID
			}
			if ts[i].ColumnIndex != ts[j].ColumnIndex {
				return ts[i].ColumnIndex < ts[j].ColumnIndex
			}
			return ts[i].ID < ts[j].ID
		})
		td := talentTab{ID: tab.ID, Name: tab.Name, BackgroundFile: tab.BackgroundFile, OrderIndex: tab.OrderIndex, SpellIconID: tab.SpellIconID, IconTexture: iconTextures[tab.SpellIconID]}
		for i, t := range ts {
			ranks := nonzero(t.SpellRank)
			if len(ranks) == 0 {
				continue
			}
			td.Talents = append(td.Talents, talentEntry{ID: t.ID, Name: names[ranks[0]], TierID: t.TierID, ColumnIndex: t.ColumnIndex, MaxRank: int32(len(ranks)), TabIndex: int32(i), SpellRanks: ranks, PrereqTalent: nonzero(t.PrereqTalent), PrereqRank: t.PrereqRank, IconTexture: iconTextures[spellIconIDs[ranks[0]]]})
		}
		for bit := int32(0); bit < 12; bit++ {
			if tab.ClassMask&(1<<bit) == 0 {
				continue
			}
			id := bit + 1
			c := tree.Classes[id]
			c.Tabs = append(c.Tabs, td)
			tree.Classes[id] = c
		}
	}
	out.TalentTrees, err = json.Marshal(tree)
	return err
}
func nonzero(s []int32) []int32 {
	out := make([]int32, 0, len(s))
	for _, v := range s {
		if v == 0 {
			break
		}
		out = append(out, v)
	}
	return out
}

type castTimeRow struct{ ID, Base, Minimum int32 }
type durationRow struct{ ID, Duration, MaxDuration int32 }
type rangeRow struct {
	ID, Flags          int32
	RangeMin, RangeMax []float32
	Name               string `json:"DisplayName_lang"`
}
type categoryRow struct {
	ID, Flags, UsesPerWeek                   int32
	Name                                     string `json:"Name_lang"`
	MaxCharges, ChargeRecoveryTime, TypeMask int32
}
type radiusRow struct {
	ID                                           int32
	Radius, RadiusPerLevel, RadiusMin, RadiusMax float32
}
type focusRow struct {
	ID   int32
	Name string `json:"Name_lang"`
}
type descRow struct {
	ID        int32
	Variables string
}

func convertMetadata(dir string, out *Import) error {
	a, e := readRows[castTimeRow](dir, "SpellCastTimes")
	if e != nil {
		return e
	}
	for _, x := range a {
		out.SpellCastTimes = append(out.SpellCastTimes, SpellCastTime(x))
	}
	b, e := readRows[durationRow](dir, "SpellDuration")
	if e != nil {
		return e
	}
	for _, x := range b {
		out.SpellDurations = append(out.SpellDurations, SpellDuration(x))
	}
	c, e := readRows[rangeRow](dir, "SpellRange")
	if e != nil {
		return e
	}
	for _, x := range c {
		out.SpellRanges = append(out.SpellRanges, SpellRange{x.ID, floatAt(x.RangeMin, 0), floatAt(x.RangeMax, 0), x.Flags, x.Name})
	}
	d, e := readRows[categoryRow](dir, "SpellCategory")
	if e != nil {
		return e
	}
	for _, x := range d {
		out.SpellCategories = append(out.SpellCategories, SpellCategory(x))
	}
	f, e := readRows[radiusRow](dir, "SpellRadius")
	if e != nil {
		return e
	}
	for _, x := range f {
		out.SpellRadii = append(out.SpellRadii, SpellRadius(x))
	}
	g, e := readRows[focusRow](dir, "SpellFocusObject")
	if e != nil {
		return e
	}
	for _, x := range g {
		out.SpellFocusObjects = append(out.SpellFocusObjects, SpellFocusObject(x))
	}
	h, e := readRows[descRow](dir, "SpellDescriptionVariables")
	if e != nil {
		return e
	}
	for _, x := range h {
		out.SpellDescriptionVariables = append(out.SpellDescriptionVariables, SpellDescriptionVariables(x))
	}
	return nil
}
func floatAt(s []float32, i int) float32 {
	if i < len(s) {
		return s[i]
	}
	return 0
}

type enchantRow struct {
	ID, Charges                                                               int32
	Effect, EffectPointsMin, EffectArg                                        []int32
	Name                                                                      string `json:"Name_lang"`
	ItemVisual, Flags, RequiredSkillID, RequiredSkillRank, MinLevel, MaxLevel int32
}

func convertEnchantments(dir string, out *Import) error {
	rows, e := readRows[enchantRow](dir, "SpellItemEnchantment")
	if e != nil {
		return e
	}
	for _, x := range rows {
		var r Enchantment
		r.ID = x.ID
		r.Charges = x.Charges
		r.Name = x.Name
		r.ItemVisual = x.ItemVisual
		r.Flags = x.Flags
		r.RequiredSkillID = x.RequiredSkillID
		r.RequiredSkillRank = x.RequiredSkillRank
		r.MinLevel = x.MinLevel
		r.MaxLevel = x.MaxLevel
		for i := 0; i < 3; i++ {
			r.Effect[i] = at(x.Effect, i)
			r.EffectPointsMin[i] = at(x.EffectPointsMin, i)
			r.EffectArg[i] = at(x.EffectArg, i)
		}
		out.Enchantments = append(out.Enchantments, r)
	}
	return nil
}

type itemSetRow struct {
	ID                               int32
	Name                             string `json:"Name_lang"`
	RequiredSkill, RequiredSkillRank int32
	ItemID                           []int32
}

func convertItemSets(dir string, out *Import) error {
	rows, e := readRows[itemSetRow](dir, "ItemSet")
	if e != nil {
		return e
	}
	for _, x := range rows {
		out.ItemSets = append(out.ItemSets, ItemSet{ID: x.ID, Name: x.Name, RequiredSkill: x.RequiredSkill, RequiredSkillRank: x.RequiredSkillRank, ItemIDs: nonzero(x.ItemID)})
	}
	return nil
}
