package dbcdb

import (
	"bytes"
	"encoding/binary"
	"sync"

	"github.com/Gophercraft/core/format/content"
	"github.com/Gophercraft/core/format/dbc"
	"github.com/Gophercraft/core/format/dbc/dbd"
	"github.com/Gophercraft/core/format/dbc/dbdefs"
	"github.com/Gophercraft/core/vsn"
)

// SpellBuildOverride, when non-zero, overrides the build version used to
// select the Spell.dbc layout. This allows private servers with non-standard
// Spell layouts (e.g. AzerothCore) to register a custom layout under a
// pseudo-build number without affecting other servers sharing the same
// detected build version.
var SpellBuildOverride vsn.Build

type WoWClient struct {
	content.Volume
}

// New opens a WoW client directory for reading DBC files.
// path should be the root of the WoW installation (containing Data folder).
func New(path string) (*WoWClient, error) {
	vol, err := content.Open(path)
	if err != nil {
		return nil, err
	}
	return &WoWClient{Volume: vol}, nil
}

func (w *WoWClient) SpellDBCBytes() ([]byte, error) {
	data, err := w.ReadFile("DBFilesClient\\Spell.dbc")
	if err != nil {
		return nil, err
	}

	return data, nil
}

func (w *WoWClient) SpellItemEnchantment() (Table[dbdefs.Ent_SpellItemEnchantment], error) {
	data, err := w.ReadFile("DBFilesClient\\SpellItemEnchantment.dbc")
	if err != nil {
		return nil, err
	}

	db := dbc.NewDB(w.Build())
	table, err := db.Open("SpellItemEnchantment", bytes.NewReader(data))
	if err != nil {
		return nil, err
	}

	return WrapTable[dbdefs.Ent_SpellItemEnchantment](table), nil
}

func (w *WoWClient) ItemRandomProperties() (Table[dbdefs.Ent_ItemRandomProperties], error) {
	data, err := w.ReadFile("DBFilesClient\\ItemRandomProperties.dbc")
	if err != nil {
		return nil, err
	}

	db := dbc.NewDB(w.Build())
	table, err := db.Open("ItemRandomProperties", bytes.NewReader(data))
	if err != nil {
		return nil, err
	}

	return WrapTable[dbdefs.Ent_ItemRandomProperties](table), nil
}

func (w *WoWClient) LoadingScreens() (Table[dbdefs.Ent_LoadingScreens], error) {
	data, err := w.ReadFile("DBFilesClient\\LoadingScreens.dbc")
	if err != nil {
		return nil, err
	}

	// Some WotLK private servers (AzerothCore, Ascension) ship LoadingScreens.dbc
	// without the HasWideScreen column. Detect this by checking the record size
	// in the file header and register a 3-column layout if needed.
	if len(data) >= 20 {
		recordSize := binary.LittleEndian.Uint32(data[12:16])
		if recordSize == 12 {
			fixLoadingScreensLayout()
		}
	}

	db := dbc.NewDB(w.Build())
	table, err := db.Open("LoadingScreens", bytes.NewReader(data))
	if err != nil {
		return nil, err
	}

	return WrapTable[dbdefs.Ent_LoadingScreens](table), nil
}

var fixedLoadingScreens sync.Once

func fixLoadingScreensLayout() {
	fixedLoadingScreens.Do(func() {
		def, err := dbdefs.Lookup("LoadingScreens")
		if err != nil {
			return
		}
		// Replace all layouts with a single 3-column layout covering all builds.
		// This handles private servers whose LoadingScreens.dbc omits HasWideScreen.
		def.Layouts = []dbd.Layout{{
			BuildRanges: []vsn.BuildRange{vsn.Range(0, vsn.Max)},
			Columns: []dbd.LayoutColumn{
				{Name: "ID", Bits: 32},
				{Name: "Name"},
				{Name: "FileName"},
			},
		}}
		dbdefs.Register(def)
	})
}

func (w *WoWClient) Spells() (Table[dbdefs.Ent_Spell], error) {
	data, err := w.ReadFile("DBFilesClient\\Spell.dbc")
	if err != nil {
		return nil, err
	}

	build := w.Build()
	if SpellBuildOverride != 0 {
		build = SpellBuildOverride
	}
	db := dbc.NewDB(build)
	table, err := db.Open("Spell", bytes.NewReader(data))
	if err != nil {
		return nil, err
	}

	return WrapTable[dbdefs.Ent_Spell](table), nil
}

func (w *WoWClient) SpellDescriptionVariables() (Table[dbdefs.Ent_SpellDescriptionVariables], error) {
	data, err := w.ReadFile("DBFilesClient\\SpellDescriptionVariables.dbc")
	if err != nil {
		return nil, err
	}

	build := w.Build()
	if SpellBuildOverride != 0 {
		build = SpellBuildOverride
	}
	db := dbc.NewDB(build)
	table, err := db.Open("SpellDescriptionVariables", bytes.NewReader(data))
	if err != nil {
		return nil, err
	}

	return WrapTable[dbdefs.Ent_SpellDescriptionVariables](table), nil
}

func (w *WoWClient) SpellCategory() (Table[dbdefs.Ent_SpellCategory], error) {
	data, err := w.ReadFile("DBFilesClient\\SpellCategory.dbc")
	if err != nil {
		return nil, err
	}

	db := dbc.NewDB(w.Build())
	table, err := db.Open("SpellCategory", bytes.NewReader(data))
	if err != nil {
		return nil, err
	}

	return WrapTable[dbdefs.Ent_SpellCategory](table), nil
}

func (w *WoWClient) SpellFocusObject() (Table[dbdefs.Ent_SpellFocusObject], error) {
	data, err := w.ReadFile("DBFilesClient\\SpellFocusObject.dbc")
	if err != nil {
		return nil, err
	}

	db := dbc.NewDB(w.Build())
	table, err := db.Open("SpellFocusObject", bytes.NewReader(data))
	if err != nil {
		return nil, err
	}

	return WrapTable[dbdefs.Ent_SpellFocusObject](table), nil
}

func (w *WoWClient) SpellRange() (Table[dbdefs.Ent_SpellRange], error) {
	data, err := w.ReadFile("DBFilesClient\\SpellRange.dbc")
	if err != nil {
		return nil, err
	}

	db := dbc.NewDB(w.Build())
	table, err := db.Open("SpellRange", bytes.NewReader(data))
	if err != nil {
		return nil, err
	}

	return WrapTable[dbdefs.Ent_SpellRange](table), nil
}

func (w *WoWClient) SpellRadius() (Table[dbdefs.Ent_SpellRadius], error) {
	data, err := w.ReadFile("DBFilesClient\\SpellRadius.dbc")
	if err != nil {
		return nil, err
	}

	db := dbc.NewDB(w.Build())
	table, err := db.Open("SpellRadius", bytes.NewReader(data))
	if err != nil {
		return nil, err
	}

	return WrapTable[dbdefs.Ent_SpellRadius](table), nil
}

// SpellEffectNames is not there
func (w *WoWClient) SpellEffectNames() (Table[dbdefs.Ent_SpellEffectNames], error) {
	data, err := w.ReadFile("DBFilesClient\\SpellEffectNames.dbc")
	if err != nil {
		return nil, err
	}

	db := dbc.NewDB(w.Build())
	table, err := db.Open("SpellEffectNames", bytes.NewReader(data))
	if err != nil {
		return nil, err
	}

	return WrapTable[dbdefs.Ent_SpellEffectNames](table), nil
}

func (w *WoWClient) SpellVisualEffectName() (Table[dbdefs.Ent_SpellVisualEffectName], error) {
	data, err := w.ReadFile("DBFilesClient\\SpellVisualEffectName.dbc")
	if err != nil {
		return nil, err
	}

	db := dbc.NewDB(w.Build())
	table, err := db.Open("SpellVisualEffectName", bytes.NewReader(data))
	if err != nil {
		return nil, err
	}

	return WrapTable[dbdefs.Ent_SpellVisualEffectName](table), nil
}

func (w *WoWClient) SpellCooldowns() (Table[dbdefs.Ent_SpellCooldowns], error) {
	data, err := w.ReadFile("DBFilesClient\\SpellCooldowns.dbc")
	if err != nil {
		return nil, err
	}

	db := dbc.NewDB(w.Build())
	table, err := db.Open("SpellCooldowns", bytes.NewReader(data))
	if err != nil {
		return nil, err
	}

	return WrapTable[dbdefs.Ent_SpellCooldowns](table), nil
}

func (w *WoWClient) SpellDuration() (Table[dbdefs.Ent_SpellDuration], error) {
	data, err := w.ReadFile("DBFilesClient\\SpellDuration.dbc")
	if err != nil {
		return nil, err
	}

	db := dbc.NewDB(w.Build())
	table, err := db.Open("SpellDuration", bytes.NewReader(data))
	if err != nil {
		return nil, err
	}

	return WrapTable[dbdefs.Ent_SpellDuration](table), nil
}

func (w *WoWClient) SpellAuraNames() (Table[dbdefs.Ent_SpellAuraNames], error) {
	data, err := w.ReadFile("DBFilesClient\\SpellAuraNames.dbc")
	if err != nil {
		return nil, err
	}

	db := dbc.NewDB(w.Build())
	table, err := db.Open("SpellAuraNames", bytes.NewReader(data))
	if err != nil {
		return nil, err
	}

	return WrapTable[dbdefs.Ent_SpellAuraNames](table), nil
}

func (w *WoWClient) SpellCastTimes() (Table[dbdefs.Ent_SpellCastTimes], error) {
	data, err := w.ReadFile("DBFilesClient\\SpellCastTimes.dbc")
	if err != nil {
		return nil, err
	}

	db := dbc.NewDB(w.Build())
	table, err := db.Open("SpellCastTimes", bytes.NewReader(data))
	if err != nil {
		return nil, err
	}

	return WrapTable[dbdefs.Ent_SpellCastTimes](table), nil
}

func (w *WoWClient) SpellIcons() (Table[dbdefs.Ent_SpellIcon], error) {
	data, err := w.ReadFile("DBFilesClient\\SpellIcon.dbc")
	if err != nil {
		return nil, err
	}

	db := dbc.NewDB(w.Build())
	table, err := db.Open("SpellIcon", bytes.NewReader(data))
	if err != nil {
		return nil, err
	}

	return WrapTable[dbdefs.Ent_SpellIcon](table), nil
}

func (w *WoWClient) DungeonMap() (Table[dbdefs.Ent_DungeonMap], error) {
	data, err := w.ReadFile("DBFilesClient\\DungeonMap.dbc")
	if err != nil {
		return nil, err
	}

	db := dbc.NewDB(w.Build())
	table, err := db.Open("Map", bytes.NewReader(data))
	if err != nil {
		return nil, err
	}

	return WrapTable[dbdefs.Ent_DungeonMap](table), nil
}

func (w *WoWClient) Map() (Table[dbdefs.Ent_Map], error) {
	data, err := w.ReadFile("DBFilesClient\\Map.dbc")
	if err != nil {
		return nil, err
	}

	db := dbc.NewDB(w.Build())
	table, err := db.Open("Map", bytes.NewReader(data))
	if err != nil {
		return nil, err
	}

	return WrapTable[dbdefs.Ent_Map](table), nil
}

func (w *WoWClient) DungeonEncounter() (Table[dbdefs.Ent_DungeonEncounter], error) {
	data, err := w.ReadFile("DBFilesClient\\DungeonEncounter.dbc")
	if err != nil {
		return nil, err
	}

	db := dbc.NewDB(w.Build())
	table, err := db.Open("DungeonEncounter", bytes.NewReader(data))
	if err != nil {
		return nil, err
	}

	return WrapTable[dbdefs.Ent_DungeonEncounter](table), nil
}

func (w *WoWClient) ItemDisplayInfo() (Table[dbdefs.Ent_ItemDisplayInfo], error) {
	data, err := w.ReadFile("DBFilesClient\\ItemDisplayInfo.dbc")
	if err != nil {
		return nil, err
	}

	db := dbc.NewDB(w.Build())
	table, err := db.Open("ItemDisplayInfo", bytes.NewReader(data))
	if err != nil {
		return nil, err
	}

	return WrapTable[dbdefs.Ent_ItemDisplayInfo](table), nil
}

func (w *WoWClient) CharSections() (Table[dbdefs.Ent_CharSections], error) {
	data, err := w.ReadFile("DBFilesClient\\CharSections.dbc")
	if err != nil {
		return nil, err
	}

	db := dbc.NewDB(w.Build())
	table, err := db.Open("CharSections", bytes.NewReader(data))
	if err != nil {
		return nil, err
	}

	return WrapTable[dbdefs.Ent_CharSections](table), nil
}

func (w *WoWClient) ChrRaces() (Table[dbdefs.Ent_ChrRaces], error) {
	data, err := w.ReadFile("DBFilesClient\\ChrRaces.dbc")
	if err != nil {
		return nil, err
	}

	db := dbc.NewDB(w.Build())
	table, err := db.Open("ChrRaces", bytes.NewReader(data))
	if err != nil {
		return nil, err
	}

	return WrapTable[dbdefs.Ent_ChrRaces](table), nil
}

func (w *WoWClient) AnimationData() (Table[dbdefs.Ent_AnimationData], error) {
	data, err := w.ReadFile("DBFilesClient\\AnimationData.dbc")
	if err != nil {
		return nil, err
	}

	db := dbc.NewDB(w.Build())
	table, err := db.Open("AnimationData", bytes.NewReader(data))
	if err != nil {
		return nil, err
	}

	return WrapTable[dbdefs.Ent_AnimationData](table), nil
}

func (w *WoWClient) HelmetGeosetVisData() (Table[dbdefs.Ent_HelmetGeosetVisData], error) {
	data, err := w.ReadFile("DBFilesClient\\HelmetGeosetVisData.dbc")
	if err != nil {
		return nil, err
	}

	db := dbc.NewDB(w.Build())
	table, err := db.Open("HelmetGeosetVisData", bytes.NewReader(data))
	if err != nil {
		return nil, err
	}

	return WrapTable[dbdefs.Ent_HelmetGeosetVisData](table), nil
}

func (w *WoWClient) CreatureModelData() (Table[dbdefs.Ent_CreatureModelData], error) {
	data, err := w.ReadFile("DBFilesClient\\CreatureModelData.dbc")
	if err != nil {
		return nil, err
	}

	db := dbc.NewDB(w.Build())
	table, err := db.Open("CreatureModelData", bytes.NewReader(data))
	if err != nil {
		return nil, err
	}

	return WrapTable[dbdefs.Ent_CreatureModelData](table), nil
}

func (w *WoWClient) CreatureDisplayInfo() (Table[dbdefs.Ent_CreatureDisplayInfo], error) {
	data, err := w.ReadFile("DBFilesClient\\CreatureDisplayInfo.dbc")
	if err != nil {
		return nil, err
	}

	db := dbc.NewDB(w.Build())
	table, err := db.Open("CreatureDisplayInfo", bytes.NewReader(data))
	if err != nil {
		return nil, err
	}

	return WrapTable[dbdefs.Ent_CreatureDisplayInfo](table), nil
}

func (w *WoWClient) ItemVisuals() (Table[dbdefs.Ent_ItemVisuals], error) {
	data, err := w.ReadFile("DBFilesClient\\ItemVisuals.dbc")
	if err != nil {
		return nil, err
	}

	db := dbc.NewDB(w.Build())
	table, err := db.Open("ItemVisuals", bytes.NewReader(data))
	if err != nil {
		return nil, err
	}

	return WrapTable[dbdefs.Ent_ItemVisuals](table), nil
}

func (w *WoWClient) ItemVisualEffects() (Table[dbdefs.Ent_ItemVisualEffects], error) {
	data, err := w.ReadFile("DBFilesClient\\ItemVisualEffects.dbc")
	if err != nil {
		return nil, err
	}

	db := dbc.NewDB(w.Build())
	table, err := db.Open("ItemVisualEffects", bytes.NewReader(data))
	if err != nil {
		return nil, err
	}

	return WrapTable[dbdefs.Ent_ItemVisualEffects](table), nil
}

func (w *WoWClient) ItemClass() (Table[dbdefs.Ent_ItemClass], error) {
	data, err := w.ReadFile("DBFilesClient\\ItemClass.dbc")
	if err != nil {
		return nil, err
	}

	db := dbc.NewDB(w.Build())
	table, err := db.Open("ItemClass", bytes.NewReader(data))
	if err != nil {
		return nil, err
	}

	return WrapTable[dbdefs.Ent_ItemClass](table), nil
}

func (w *WoWClient) ItemSubClass() (Table[dbdefs.Ent_ItemSubClass], error) {
	data, err := w.ReadFile("DBFilesClient\\ItemSubClass.dbc")
	if err != nil {
		return nil, err
	}

	db := dbc.NewDB(w.Build())
	table, err := db.Open("ItemSubClass", bytes.NewReader(data))
	if err != nil {
		return nil, err
	}

	return WrapTable[dbdefs.Ent_ItemSubClass](table), nil
}

func (w *WoWClient) ItemSparse() (Table[dbdefs.Ent_ItemSparse], error) {
	data, err := w.ReadFile("DBFilesClient\\ItemSparse.dbc")
	if err != nil {
		return nil, err
	}

	db := dbc.NewDB(w.Build())
	table, err := db.Open("ItemSparse", bytes.NewReader(data))
	if err != nil {
		return nil, err
	}

	return WrapTable[dbdefs.Ent_ItemSparse](table), nil
}

func (w *WoWClient) ItemNameDescription() (Table[dbdefs.Ent_ItemNameDescription], error) {
	data, err := w.ReadFile("DBFilesClient\\ItemNameDescription.dbc")
	if err != nil {
		return nil, err
	}

	db := dbc.NewDB(w.Build())
	table, err := db.Open("ItemNameDescription", bytes.NewReader(data))
	if err != nil {
		return nil, err
	}

	return WrapTable[dbdefs.Ent_ItemNameDescription](table), nil
}

func (w *WoWClient) Item() (Table[dbdefs.Ent_Item], error) {
	data, err := w.ReadFile("DBFilesClient\\Item.dbc")
	if err != nil {
		return nil, err
	}

	db := dbc.NewDB(w.Build())
	table, err := db.Open("Item", bytes.NewReader(data))
	if err != nil {
		return nil, err
	}

	return WrapTable[dbdefs.Ent_Item](table), nil
}

func (w *WoWClient) ItemSet() (Table[dbdefs.Ent_ItemSet], error) {
	data, err := w.ReadFile("DBFilesClient\\ItemSet.dbc")
	if err != nil {
		return nil, err
	}

	db := dbc.NewDB(w.Build())
	table, err := db.Open("ItemSet", bytes.NewReader(data))
	if err != nil {
		return nil, err
	}

	return WrapTable[dbdefs.Ent_ItemSet](table), nil
}

func (w *WoWClient) Talent() (Table[dbdefs.Ent_Talent], error) {
	data, err := w.ReadFile("DBFilesClient\\Talent.dbc")
	if err != nil {
		return nil, err
	}

	db := dbc.NewDB(w.Build())
	table, err := db.Open("Talent", bytes.NewReader(data))
	if err != nil {
		return nil, err
	}

	return WrapTable[dbdefs.Ent_Talent](table), nil
}

var talentTabLayoutMu sync.Mutex

// WoWDBDefs names TalentTab column 21 CategoryEnumID for Wrath builds, while
// the Wrath client and server code use that column as the pet talent mask.
// Rename the selected DBD column so Ent_TalentTab.PetTalentMask is populated.
func fixWotLKTalentTabLayout(build vsn.Build) {
	if build <= vsn.V2_4_3 || build > vsn.V3_3_5a {
		return
	}

	talentTabLayoutMu.Lock()
	defer talentTabLayoutMu.Unlock()

	def, err := dbdefs.Lookup("TalentTab")
	if err != nil {
		return
	}
	if renameTalentTabPetMaskColumn(def, build) {
		dbdefs.Register(def)
	}
}

func renameTalentTabPetMaskColumn(def *dbd.Definition, build vsn.Build) bool {
	for i := range def.Layouts {
		layout := &def.Layouts[i]
		matches := false
		for _, exact := range layout.VerifiedBuilds {
			if exact == build {
				matches = true
				break
			}
		}
		if !matches {
			for _, buildRange := range layout.BuildRanges {
				if buildRange.Contains(build) {
					matches = true
					break
				}
			}
		}
		if !matches || layout.Column("PetTalentMask") != nil {
			continue
		}
		if category := layout.Column("CategoryEnumID"); category != nil {
			category.Name = "PetTalentMask"
			return true
		}
		return false
	}
	return false
}

func (w *WoWClient) TalentTab() (Table[dbdefs.Ent_TalentTab], error) {
	data, err := w.ReadFile("DBFilesClient\\TalentTab.dbc")
	if err != nil {
		return nil, err
	}

	build := w.Build()
	fixWotLKTalentTabLayout(build)
	db := dbc.NewDB(build)
	table, err := db.Open("TalentTab", bytes.NewReader(data))
	if err != nil {
		return nil, err
	}

	return WrapTable[dbdefs.Ent_TalentTab](table), nil
}
