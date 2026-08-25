package servicegamedata

import (
	"context"
	"database/sql"
	"errors"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/api/httpapi"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/gamedb/chrondbc"
	"github.com/Emyrk/chronicle/database/spelldb"
	"github.com/Emyrk/chronicle/internal/services/servicedbstore"
	"github.com/Emyrk/chronicle/internal/services/servicepgxpool"
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

	dsID := datasetIDFromContext(ctx)

	item, err := db.GetItemTemplateByEntry(ctx, database.GetItemTemplateByEntryParams{DatasetID: dsID, Entry: int32(itemID)})
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			httpapi.Write(ctx, w, http.StatusNotFound, map[string]string{"error": "item not found"})
			return
		}
		httpapi.InternalServerError(w, err)
		return
	}

	sim := buildSimItem(item)
	applyEquipSpellStats(ctx, servicepgxpool.PGXPool(s.broker), dsID, sim.Spells, &sim)

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
		id, trigger, charges  int32
		ppmRate               float64
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

const itemSpellTriggerEquip int32 = 1

const (
	itemModMana              int32 = 0
	itemModHealth            int32 = 1
	itemModAgility           int32 = 3
	itemModStrength          int32 = 4
	itemModIntellect         int32 = 5
	itemModSpirit            int32 = 6
	itemModStamina           int32 = 7
	itemModDodge             int32 = 13
	itemModParry             int32 = 14
	itemModBlock             int32 = 15
	itemModHit               int32 = 31
	itemModCrit              int32 = 32
	itemModAttackPower       int32 = 38
	itemModRangedAttackPower int32 = 39
	itemModHealing           int32 = 41
	itemModSpellDamage       int32 = 42
	itemModManaRegen         int32 = 43
	itemModBlockValue        int32 = 48
)

// applyEquipSpellStats decodes permanent item equip auras into the same
// stat fields used by direct item_template stats. Missing spell rows are
// tolerated because custom world data can reference spells absent from DBC.
func applyEquipSpellStats(
	ctx context.Context,
	pool *pgxpool.Pool,
	datasetID uuid.UUID,
	itemSpells []chroniclesdk.SimItemSpell,
	sim *chroniclesdk.SimItem,
) {
	for _, itemSpell := range itemSpells {
		if itemSpell.Trigger != itemSpellTriggerEquip {
			continue
		}
		spell, err := spelldb.GetSpell(ctx, pool, datasetID, itemSpell.SpellID)
		if err != nil {
			continue
		}
		applyEquipSpellRowStats(spell, sim)
	}
}

func applyEquipSpellRowStats(spell *spelldb.SpellRow, sim *chroniclesdk.SimItem) {
	effects := [3]int32{spell.Effect0, spell.Effect1, spell.Effect2}
	auras := [3]int32{spell.EffectAura0, spell.EffectAura1, spell.EffectAura2}
	basePoints := [3]int32{spell.EffectBasePoints0, spell.EffectBasePoints1, spell.EffectBasePoints2}
	miscValues := [3]int32{spell.EffectMiscValue0, spell.EffectMiscValue1, spell.EffectMiscValue2}

	for i, auraValue := range auras {
		if chrondbc.Effect(effects[i]) != chrondbc.EffectApplyAura {
			continue
		}
		value := basePoints[i] + 1
		if value == 0 {
			continue
		}
		misc := miscValues[i]
		switch chrondbc.AuraEffect(auraValue) {
		case chrondbc.AuraEffectModStat:
			if misc == -1 {
				for _, itemMod := range []int32{
					itemModStrength, itemModAgility, itemModStamina,
					itemModIntellect, itemModSpirit,
				} {
					appendSimItemStat(sim, itemMod, value)
				}
			} else if itemMod, ok := auraStatItemMod(misc); ok {
				appendSimItemStat(sim, itemMod, value)
			}
		case chrondbc.AuraEffectModIncreaseHealth:
			appendSimItemStat(sim, itemModHealth, value)
		case chrondbc.AuraEffectModIncreaseEnergy:
			if misc == 0 { // POWER_MANA
				appendSimItemStat(sim, itemModMana, value)
			}
		case chrondbc.AuraEffectModAttackPower:
			appendSimItemStat(sim, itemModAttackPower, value)
		case chrondbc.AuraEffectModRangedAttackPower:
			appendSimItemStat(sim, itemModRangedAttackPower, value)
		case chrondbc.AuraEffectModHitChance, chrondbc.AuraEffectModSpellHitChance:
			appendSimItemStat(sim, itemModHit, value)
		case chrondbc.AuraEffectModWeaponCritPercent, chrondbc.AuraEffectModSpellCritChance:
			appendSimItemStat(sim, itemModCrit, value)
		case chrondbc.AuraEffectModDodgePercent:
			appendSimItemStat(sim, itemModDodge, value)
		case chrondbc.AuraEffectModParryPercent:
			appendSimItemStat(sim, itemModParry, value)
		case chrondbc.AuraEffectModBlockPercent:
			appendSimItemStat(sim, itemModBlock, value)
		case chrondbc.AuraEffectModHealing, chrondbc.AuraEffectModHealingDone:
			appendSimItemStat(sim, itemModHealing, value)
		case chrondbc.AuraEffectModDamageDone:
			// EffectMiscValue is a school mask. Physical-only bonuses are not
			// spell power; any magical school bit represents spell damage.
			if misc&0x7e != 0 {
				appendSimItemStat(sim, itemModSpellDamage, value)
			}
		case chrondbc.AuraEffectModPowerRegen:
			if misc == 0 { // POWER_MANA
				appendSimItemStat(sim, itemModManaRegen, value)
			}
		case chrondbc.AuraEffectModResistance, chrondbc.AuraEffectModBaseResistance:
			// EffectMiscValue is a school mask: physical, holy, fire,
			// nature, frost, shadow, arcane. SimItem omits physical resist.
			for school := 1; school <= len(sim.Resistances); school++ {
				if misc&(1<<school) != 0 {
					sim.Resistances[school-1] += value
				}
			}
		case chrondbc.AuraEffectModBlockValueFlat:
			appendSimItemStat(sim, itemModBlockValue, value)
		}
	}
}

func auraStatItemMod(auraStat int32) (int32, bool) {
	// SPELL_AURA_MOD_STAT uses the UnitMods stat order, not ItemModType.
	switch auraStat {
	case 0:
		return itemModStrength, true
	case 1:
		return itemModAgility, true
	case 2:
		return itemModStamina, true
	case 3:
		return itemModIntellect, true
	case 4:
		return itemModSpirit, true
	default:
		return 0, false
	}
}

func appendSimItemStat(sim *chroniclesdk.SimItem, itemMod, value int32) {
	if value != 0 {
		sim.Stats = append(sim.Stats, chroniclesdk.ItemStat{Type: itemMod, Value: value})
	}
}
