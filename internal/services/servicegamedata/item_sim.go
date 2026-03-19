package servicegamedata

import (
	"database/sql"
	"errors"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"

	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/api/httpapi"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/internal/services/servicedbstore"
)

func (s *Service) handleItemSim(w http.ResponseWriter, r *http.Request) {
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

	sim := buildSimItem(item)

	w.Header().Set("Cache-Control", "public, max-age=259200")
	httpapi.Write(ctx, w, http.StatusOK, sim)
}

func buildSimItem(item database.WorldItemTemplate) chroniclesdk.SimItem {
	sim := chroniclesdk.SimItem{
		Entry:         item.Entry,
		Name:          item.Name,
		Class:         item.Class,
		SubClass:      item.Subclass,
		ItemLevel:     item.ItemLevel,
		InventoryType: item.InventoryType,
		Delay:         item.Delay,
		Armor:         item.Armor,
		Block:         item.Block,
		SetID:         item.SetID,
		Resistances: [6]int32{
			item.HolyRes, item.FireRes, item.NatureRes,
			item.FrostRes, item.ShadowRes, item.ArcaneRes,
		},
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
			sim.Stats = append(sim.Stats, chroniclesdk.ItemStat{Type: sp[0], Value: sp[1]})
		}
	}

	// Damage ranges (only non-zero)
	type dmgRange struct {
		min, max float64
		dmgType  int32
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
			sim.Damage = append(sim.Damage, chroniclesdk.SimItemDamage{
				Min: dr.min, Max: dr.max, DamageType: dr.dmgType,
			})
		}
	}

	// Spells with full proc data
	type spellSlot struct {
		id, trigger, charges int32
		ppmRate              float64
		cooldown, catCooldown int32
	}
	spellSlots := []spellSlot{
		{item.Spellid1, item.Spelltrigger1, item.Spellcharges1, item.Spellppmrate1, item.Spellcooldown1, item.Spellcategorycooldown1},
		{item.Spellid2, item.Spelltrigger2, item.Spellcharges2, item.Spellppmrate2, item.Spellcooldown2, item.Spellcategorycooldown2},
		{item.Spellid3, item.Spelltrigger3, item.Spellcharges3, item.Spellppmrate3, item.Spellcooldown3, item.Spellcategorycooldown3},
		{item.Spellid4, item.Spelltrigger4, item.Spellcharges4, item.Spellppmrate4, item.Spellcooldown4, item.Spellcategorycooldown4},
		{item.Spellid5, item.Spelltrigger5, item.Spellcharges5, item.Spellppmrate5, item.Spellcooldown5, item.Spellcategorycooldown5},
	}
	for _, sp := range spellSlots {
		if sp.id != 0 {
			sim.Spells = append(sim.Spells, chroniclesdk.SimItemSpell{
				SpellID:            sp.id,
				Trigger:            sp.trigger,
				Charges:            sp.charges,
				PPMRate:            sp.ppmRate,
				CooldownMs:         sp.cooldown,
				CategoryCooldownMs: sp.catCooldown,
			})
		}
	}

	return sim
}
