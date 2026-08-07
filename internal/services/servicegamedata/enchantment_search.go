package servicegamedata

import (
	"net/http"

	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/api/httpapi"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/internal/services/servicedbstore"
)

// Weapon subclasses (ItemSubclassWeapon) that permanent enchants can
// target, split the way enchanting spells split them: melee weapon
// enchants vs ranged attachments (scopes).
const (
	meleeWeaponSubclassMask  int32 = 1<<0 | 1<<1 | 1<<4 | 1<<5 | 1<<6 | 1<<7 | 1<<8 | 1<<10 | 1<<13 | 1<<14 | 1<<15 | 1<<17
	rangedWeaponSubclassMask int32 = 1<<2 | 1<<3 | 1<<16 | 1<<18 | 1<<19
)

// enchantSlotMasks converts an inventory-type filter (as sent by the item
// picker's slot filter) into the masks the slot enchant query matches
// against spell equipped-item restrictions.
func enchantSlotMasks(invTypes []int32) (invMask, weaponSubclassMask int32) {
	for _, t := range invTypes {
		if t < 0 || t > 30 {
			continue
		}
		invMask |= 1 << t
		switch t {
		case 13, 17, 21, 22: // one-hand, two-hand, main hand, off hand
			weaponSubclassMask |= meleeWeaponSubclassMask
		case 15, 25, 26: // ranged, thrown, ranged right
			weaponSubclassMask |= rangedWeaponSubclassMask
		}
	}
	return invMask, weaponSubclassMask
}

// handleSearchEnchantments searches permanent enchantments by display name
// for the gear builder's enchant picker. With a slot filter (inventory
// types, like item search) results are restricted to enchants a spell can
// actually apply to that slot, and an empty query lists them all.
func (s *Service) handleSearchEnchantments(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	db := servicedbstore.DatabaseStore(s.broker)

	q := r.URL.Query().Get("q")
	slots := parseIntList(r.URL.Query().Get("slot"))
	if len(q) < 2 && len(slots) == 0 {
		badRequest(ctx, w, "Query parameter 'q' must be at least 2 characters.")
		return
	}

	type enchantRow struct {
		ID       int32
		NameLang string
	}
	var rows []enchantRow
	if len(slots) > 0 {
		invMask, weaponSubclassMask := enchantSlotMasks(slots)
		slotRows, err := db.SearchSlotEnchantments(ctx, database.SearchSlotEnchantmentsParams{
			DatasetID:          datasetIDFromContext(ctx),
			SearchTerm:         q,
			InvMask:            invMask,
			WeaponSubclassMask: weaponSubclassMask,
		})
		if err != nil {
			httpapi.InternalServerError(w, err)
			return
		}
		for _, row := range slotRows {
			rows = append(rows, enchantRow(row))
		}
	}
	// Name-only fallback: datasets without spell data can't take the
	// slot-validity join, so a typed query should still find enchants.
	if len(rows) == 0 && len(q) >= 2 {
		nameRows, err := db.SearchSpellItemEnchantments(ctx, database.SearchSpellItemEnchantmentsParams{
			DatasetID:  datasetIDFromContext(ctx),
			SearchTerm: q,
		})
		if err != nil {
			httpapi.InternalServerError(w, err)
			return
		}
		for _, row := range nameRows {
			rows = append(rows, enchantRow(row))
		}
	}

	results := make([]chroniclesdk.EnchantmentSearchResult, 0, len(rows))
	for _, row := range rows {
		results = append(results, chroniclesdk.EnchantmentSearchResult{
			ID:   row.ID,
			Name: row.NameLang,
		})
	}

	w.Header().Set("Cache-Control", "public, max-age=3600")
	httpapi.Write(ctx, w, http.StatusOK, results)
}
