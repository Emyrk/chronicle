package servicegamedata

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"

	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/api/httpapi"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/internal/services/servicedbstore"
)

func (s *Service) handleItemTooltip(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	db := servicedbstore.DatabaseStore(s.broker)

	itemIDStr := chi.URLParam(r, "item_id")
	itemID, err := strconv.ParseInt(itemIDStr, 10, 32)
	if err != nil {
		httpapi.Write(ctx, w, http.StatusBadRequest, map[string]string{"error": "invalid item_id"})
		return
	}

	item, err := db.GetItemTemplateByEntry(ctx, int32(itemID))
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			httpapi.Write(ctx, w, http.StatusNotFound, map[string]string{"error": "item not found"})
			return
		}
		httpapi.InternalServerError(w, err)
		return
	}

	tooltip := buildBaseTooltip(ctx, db, item)

	// Resolve item set info
	if item.SetID != 0 {
		applyItemSet(ctx, db, &tooltip, item.SetID)
	}

	// Handle ?random_property=ID
	if rpStr := r.URL.Query().Get("random_property"); rpStr != "" {
		rpID, err := strconv.ParseInt(rpStr, 10, 32)
		if err == nil {
			applyRandomProperty(ctx, db, &tooltip, int32(rpID))
		}
	} else if item.RandomProperty != 0 {
		tooltip.HasRandomProperty = true
	}

	// Handle ?enchant=ID
	if enchStr := r.URL.Query().Get("enchant"); enchStr != "" {
		enchID, err := strconv.ParseInt(enchStr, 10, 32)
		if err == nil {
			applyEnchantment(ctx, db, &tooltip, int32(enchID))
		}
	}

	httpapi.Write(ctx, w, http.StatusOK, tooltip)
}

func buildBaseTooltip(ctx context.Context, db database.Store, item database.WorldItemTemplate) chroniclesdk.ItemTooltip {
	tooltip := chroniclesdk.ItemTooltip{
		Entry:         item.Entry,
		Name:          item.Name,
		Quality:       item.Quality,
		ItemLevel:     item.ItemLevel,
		Bonding:       item.Bonding,
		InventoryType: item.InventoryType,
		ItemClass:     item.Class,
		ItemSubclass:  item.Subclass,
		Armor:         item.Armor,
		Block:         item.Block,
		Delay:         item.Delay,
		RequiredLevel: item.RequiredLevel,
		Description:   item.Description,
	}

	// Resolve icon from display_info
	if item.DisplayID != 0 {
		di, err := db.GetDisplayInfoByID(ctx, item.DisplayID)
		if err == nil {
			tooltip.Icon = di.Icon
		}
		// Fall back to DBC data if the world JSON export is incomplete.
		if tooltip.Icon == "" {
			ddi, err := db.GetDBCItemDisplayInfoByID(ctx, item.DisplayID)
			if err == nil {
				var icons []string
				if jsonErr := json.Unmarshal(ddi.InventoryIcon, &icons); jsonErr == nil && len(icons) > 0 {
					tooltip.Icon = icons[0]
				}
			}
		}
	}

	// Stats (only non-zero)
	statPairs := [][2]int32{
		{item.StatType1, item.StatValue1}, {item.StatType2, item.StatValue2},
		{item.StatType3, item.StatValue3}, {item.StatType4, item.StatValue4},
		{item.StatType5, item.StatValue5}, {item.StatType6, item.StatValue6},
		{item.StatType7, item.StatValue7}, {item.StatType8, item.StatValue8},
		{item.StatType9, item.StatValue9}, {item.StatType10, item.StatValue10},
	}
	for _, sp := range statPairs {
		if sp[0] != 0 || sp[1] != 0 {
			tooltip.Stats = append(tooltip.Stats, chroniclesdk.ItemStat{Type: sp[0], Value: sp[1]})
		}
	}

	// Damage ranges (only non-zero)
	type dmgRange struct {
		min, max float64
		school   int32
	}
	dmgRanges := []dmgRange{
		{item.DmgMin1, item.DmgMax1, item.DmgType1},
		{item.DmgMin2, item.DmgMax2, item.DmgType2},
		{item.DmgMin3, item.DmgMax3, item.DmgType3},
		{item.DmgMin4, item.DmgMax4, item.DmgType4},
		{item.DmgMin5, item.DmgMax5, item.DmgType5},
	}
	for _, dr := range dmgRanges {
		if dr.min != 0 || dr.max != 0 {
			tooltip.DamageRanges = append(tooltip.DamageRanges, chroniclesdk.ItemDamage{
				Min: dr.min, Max: dr.max, School: dr.school,
			})
		}
	}

	// Resistances (only non-zero)
	resPairs := [][2]int32{
		{1, item.HolyRes}, {2, item.FireRes}, {3, item.NatureRes},
		{4, item.FrostRes}, {5, item.ShadowRes}, {6, item.ArcaneRes},
	}
	for _, rp := range resPairs {
		if rp[1] != 0 {
			tooltip.Resistances = append(tooltip.Resistances, chroniclesdk.ItemResistance{School: rp[0], Value: rp[1]})
		}
	}

	// Spells (only non-zero spell IDs)
	spellSlots := [][3]int32{
		{item.Spellid1, item.Spelltrigger1, item.Spellcharges1},
		{item.Spellid2, item.Spelltrigger2, item.Spellcharges2},
		{item.Spellid3, item.Spelltrigger3, item.Spellcharges3},
		{item.Spellid4, item.Spelltrigger4, item.Spellcharges4},
		{item.Spellid5, item.Spelltrigger5, item.Spellcharges5},
	}
	for _, sp := range spellSlots {
		if sp[0] != 0 {
			tooltip.Spells = append(tooltip.Spells, chroniclesdk.ItemSpell{
				SpellID: sp[0],
				Trigger: sp[1],
				Charges: sp[2],
			})
		}
	}

	return tooltip
}

// applyRandomProperty resolves a random property suffix (e.g. "of the Owl") and merges
// its enchantment stats into the tooltip.
func applyRandomProperty(ctx context.Context, db database.Store, tooltip *chroniclesdk.ItemTooltip, rpID int32) {
	rp, err := db.GetItemRandomPropertiesByID(ctx, rpID)
	if err != nil {
		return
	}

	suffix := rp.NameLang
	tooltip.SuffixName = &suffix

	// Each random property can reference up to 5 enchantments
	enchIDs := []int32{rp.Enchantment1, rp.Enchantment2, rp.Enchantment3, rp.Enchantment4, rp.Enchantment5}
	for _, enchID := range enchIDs {
		if enchID == 0 {
			continue
		}
		ench, err := db.GetSpellItemEnchantmentByID(ctx, enchID)
		if err != nil {
			continue
		}
		// Use the enchantment's display name (e.g. "+3 Intellect") as a green text line.
		// In vanilla WoW, random enchantments use effect type 3 (BUFF_EQUIPPED) not type 5 (STAT),
		// so we rely on the pre-formatted name_lang from the DBC rather than decomposing effects.
		if ench.NameLang != "" {
			tooltip.RandomEnchantments = append(tooltip.RandomEnchantments, ench.NameLang)
		}
	}
}

// applyItemSet resolves item set info: name, member items, and set bonuses.
func applyItemSet(ctx context.Context, db database.Store, tooltip *chroniclesdk.ItemTooltip, setID int32) {
	set, err := db.GetItemSetByID(ctx, setID)
	if err != nil {
		return
	}

	info := &chroniclesdk.ItemSetInfo{
		ID:   set.ID,
		Name: set.NameLang,
	}

	// Get all items in the set
	items, err := db.GetItemTemplatesBySetID(ctx, setID)
	if err == nil {
		for _, item := range items {
			info.Items = append(info.Items, chroniclesdk.ItemSetPiece{
				Entry:         item.Entry,
				Name:          item.Name,
				InventoryType: item.InventoryType,
			})
		}
	}

	// Get set bonuses
	bonuses, err := db.GetItemSetBonuses(ctx, setID)
	if err == nil {
		for _, b := range bonuses {
			info.Bonuses = append(info.Bonuses, chroniclesdk.ItemSetBonus{
				Threshold: b.Threshold,
				SpellID:   b.SpellID,
			})
		}
	}

	tooltip.Set = info
}

// applyEnchantment resolves a player-applied enchantment and adds its display name to the tooltip.
func applyEnchantment(ctx context.Context, db database.Store, tooltip *chroniclesdk.ItemTooltip, enchID int32) {
	ench, err := db.GetSpellItemEnchantmentByID(ctx, enchID)
	if err != nil {
		return
	}
	name := ench.NameLang
	if name != "" {
		tooltip.Enchantment = &name
	}
}
