package wowdata

import (
	"bufio"
	"encoding/json"
	"fmt"
	"math"
	"os"
	"path/filepath"
	"sort"

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
		"Only DifficultyID=0 spell component rows are imported.",
		"Only EffectIndex 0..2 are retained; later effects are reported and dropped.",
		"Component rows whose SpellID is absent from the base Spell table are reported and dropped.",
		"Modern EffectBasePointsF is converted to the legacy stored representation as round(value)-1; Chronicle adds one when evaluating legacy base points.",
		"Modern icon FileDataIDs are preserved as numeric spell icon IDs, but icon paths and item display IDs are not guessed.",
		"Items without ItemSparse are reported and skipped; modern percentage stats, damage curves, armor curves, and unjoinable ItemEffect rows are not imported.",
	}
	if err := convertSpells(dir, out); err != nil {
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
	ID, SpellID, DifficultyID                               int32
	Attributes                                              []int32
	CastingTimeIndex, DurationIndex, RangeIndex, SchoolMask int32
	Speed                                                   float32
	SpellIconFileDataID, ActiveIconFileDataID               int32
}
type spellEffectRow struct {
	ID, SpellID, DifficultyID, EffectIndex, Effect, EffectMechanic int32
	EffectAura                                                     int32
	EffectAuraPeriod                                               int32
	EffectAmplitude                                                float32
	EffectBasePointsF                                              float32
	EffectChainAmplitude                                           float32
	EffectChainTargets, EffectItemType                             int32
	EffectMiscValue                                                []int32
	EffectPointsPerResource                                        float32
	EffectRadiusIndex                                              []int32
	EffectRealPointsPerLevel                                       float32
	EffectTriggerSpell                                             int32
	ImplicitTarget                                                 []int32
}
type auraOptionsRow struct {
	ID, SpellID, DifficultyID, CumulativeAura, ProcChance, ProcCharges int32
	ProcTypeMask                                                       []int32
}
type auraRestrictionsRow struct{ ID, SpellID, DifficultyID, CasterAuraSpell, CasterAuraState, ExcludeCasterAuraSpell, ExcludeCasterAuraState, ExcludeTargetAuraSpell, ExcludeTargetAuraState, TargetAuraSpell, TargetAuraState int32 }
type castingReqRow struct{ ID, SpellID, MinFactionID, MinReputation, RequiredAuraVision, RequiresSpellFocus int32 }
type categoriesRow struct{ ID, SpellID, DifficultyID, Category, DefenseType, DispelType, Mechanic, PreventionType, StartRecoveryCategory int32 }
type classOptionsRow struct {
	ID, SpellID, ModalNextSpell, SpellClassSet int32
	SpellClassMask                             []int32
}
type cooldownRow struct {
	ID, SpellID, DifficultyID                             int32
	CategoryRecoveryTime, RecoveryTime, StartRecoveryTime int64
}
type equippedRow struct{ ID, SpellID, EquippedItemClass, EquippedItemInvTypes, EquippedItemSubclass int32 }
type interruptsRow struct {
	ID, SpellID, DifficultyID, InterruptFlags int32
	AuraInterruptFlags                        []int32
}
type levelsRow struct{ ID, SpellID, DifficultyID, BaseLevel, MaxLevel, SpellLevel int32 }
type powerRow struct {
	ID, SpellID, OrderIndex, PowerType, ManaCost, ManaCostPerLevel, ManaPerSecond int32
	PowerCostPct                                                                  float32
}
type reagentsRow struct {
	ID, SpellID           int32
	Reagent, ReagentCount []int32
}
type shapeshiftRow struct{ ID, SpellID, StanceBarOrder int32 }
type targetRestrictionsRow struct{ ID, SpellID, DifficultyID, MaxTargetLevel, MaxTargets, TargetCreatureType, Targets int32 }
type totemsRow struct {
	ID, SpellID             int32
	Totem                   []int32
	RequiredTotemCategoryID []int32
}
type descXRow struct{ ID, SpellID, SpellDescriptionVariablesID int32 }

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
	misc, err := readRows[spellMiscRow](dir, "SpellMisc")
	if err != nil {
		return err
	}
	for _, x := range misc {
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
		if x.DifficultyID != 0 {
			continue
		}
		s := ensureSpell(byID, x.SpellID)
		s.CategoryRecoveryTimeMs = x.CategoryRecoveryTime
		s.RecoveryTimeMs = x.RecoveryTime
		s.StartRecoveryTimeMs = x.StartRecoveryTime
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
	for i := range out.Spells {
		names[out.Spells[i].SpellID] = out.Spells[i].Name
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
		td := talentTab{ID: tab.ID, Name: tab.Name, BackgroundFile: tab.BackgroundFile, OrderIndex: tab.OrderIndex, SpellIconID: tab.SpellIconID}
		for i, t := range ts {
			ranks := nonzero(t.SpellRank)
			if len(ranks) == 0 {
				continue
			}
			td.Talents = append(td.Talents, talentEntry{ID: t.ID, Name: names[ranks[0]], TierID: t.TierID, ColumnIndex: t.ColumnIndex, MaxRank: int32(len(ranks)), TabIndex: int32(i), SpellRanks: ranks, PrereqTalent: nonzero(t.PrereqTalent), PrereqRank: t.PrereqRank})
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
