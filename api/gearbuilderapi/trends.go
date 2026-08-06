package gearbuilderapi

import (
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/api/httpapi"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/internal/services/servicedataset"
	"github.com/Emyrk/chronicle/internal/services/servicetenant"
)

const (
	// trendsTopPerformances is the cohort target: the N best-parsing
	// unique players (each observed in the gear worn during that parse).
	trendsTopPerformances = 20
	// trendsMinSampleSize hides cohorts too small to be meaningful:
	// below this, no results are shown at all.
	trendsMinSampleSize      = 5
	trendsMaxItemsPerSlot    = 15
	trendsMaxEnchantsPerSlot = 8
	trendsCacheTTL           = 15 * time.Minute

	maxInstanceNameLen = 64
)

var trendsAllowedDays = map[int]bool{30: true, 60: true, 90: true}

// trendsFilters are the validated query parameters of a trends request.
type trendsFilters struct {
	Class        string
	Spec         string
	Days         int
	InstanceName string    // empty = all raids
	RealmID      uuid.UUID // uuid.Nil = all realms
}

// GearTrends serves the observed-gear-trends aggregate: the gear worn by
// the top-parsing players of a class/spec, optionally narrowed to one
// raid and realm. Public; results are cached for 15 minutes.
func (h *Handler) GearTrends(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	class, ok := normalizePlayableClass(r.URL.Query().Get("class"))
	if !ok {
		httpapi.Write(ctx, w, http.StatusBadRequest, map[string]string{"error": "invalid class"})
		return
	}
	spec := strings.TrimSpace(r.URL.Query().Get("spec"))
	if spec == "" || len(spec) > 32 {
		httpapi.Write(ctx, w, http.StatusBadRequest, map[string]string{"error": "spec is required (max 32 chars)"})
		return
	}
	days := 60
	if raw := r.URL.Query().Get("days"); raw != "" {
		parsed, err := strconv.Atoi(raw)
		if err != nil || !trendsAllowedDays[parsed] {
			httpapi.Write(ctx, w, http.StatusBadRequest, map[string]string{"error": "days must be 30, 60, or 90"})
			return
		}
		days = parsed
	}
	instanceName := strings.TrimSpace(r.URL.Query().Get("raid"))
	if len(instanceName) > maxInstanceNameLen {
		httpapi.Write(ctx, w, http.StatusBadRequest, map[string]string{"error": "invalid raid"})
		return
	}
	realmID := uuid.Nil
	if raw := r.URL.Query().Get("realm_id"); raw != "" {
		parsed, err := uuid.Parse(raw)
		if err != nil {
			httpapi.Write(ctx, w, http.StatusBadRequest, map[string]string{"error": "invalid realm_id"})
			return
		}
		realmID = parsed
	}
	filters := trendsFilters{Class: class, Spec: spec, Days: days, InstanceName: instanceName, RealmID: realmID}

	tenantID := servicetenant.TenantIDFromContext(ctx)
	datasetID := servicedataset.DefaultDatasetID
	if t := servicetenant.TenantFromContext(ctx); t != nil && t.DefaultDatasetID.Valid {
		datasetID = t.DefaultDatasetID.UUID
	}

	cacheKey := fmt.Sprintf("%s|%s|%s|%s|%d|%s|%s", tenantID, datasetID, class, spec, days, instanceName, realmID)
	if h.trendsCache != nil {
		if cached, ok := h.trendsCache.Get(cacheKey); ok {
			httpapi.Write(ctx, w, http.StatusOK, cached)
			return
		}
	}

	since := pgtype.Timestamptz{Time: time.Now().Add(-time.Duration(days) * 24 * time.Hour), Valid: true}
	instanceArg := pgtype.Text{String: instanceName, Valid: instanceName != ""}
	realmArg := uuid.NullUUID{UUID: realmID, Valid: realmID != uuid.Nil}
	items, err := h.zed.GearTrendsSlotItems(ctx, database.GearTrendsSlotItemsParams{
		PlayerClass:  class,
		PlayerSpec:   spec,
		Since:        since,
		InstanceName: instanceArg,
		RealmID:      realmArg,
		TopN:         trendsTopPerformances,
	})
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}
	var enchants []database.GearTrendsSlotEnchantsRow
	if len(items) > 0 {
		enchants, err = h.zed.GearTrendsSlotEnchants(ctx, database.GearTrendsSlotEnchantsParams{
			PlayerClass:  class,
			PlayerSpec:   spec,
			Since:        since,
			InstanceName: instanceArg,
			RealmID:      realmArg,
			TopN:         trendsTopPerformances,
			DatasetID:    datasetID,
		})
		if err != nil {
			httpapi.InternalServerError(w, err)
			return
		}
	}

	resp := assembleTrends(items, enchants, filters, time.Now())
	if h.trendsCache != nil {
		h.trendsCache.Add(cacheKey, resp)
	}
	httpapi.Write(ctx, w, http.StatusOK, resp)
}

// normalizePlayableClass maps a class query param to the canonical
// player_class value stored in rankings ("DEATH_KNIGHT" style). The
// frontend hero-class enum spells it "DEATHKNIGHT", so that alias is
// accepted too.
func normalizePlayableClass(raw string) (string, bool) {
	class := strings.ToUpper(strings.TrimSpace(raw))
	if class == "DEATHKNIGHT" {
		class = string(database.WowPlayableClassDEATHKNIGHT)
	}
	switch database.WowPlayableClass(class) {
	case database.WowPlayableClassWARRIOR, database.WowPlayableClassPALADIN,
		database.WowPlayableClassHUNTER, database.WowPlayableClassROGUE,
		database.WowPlayableClassPRIEST, database.WowPlayableClassDEATHKNIGHT,
		database.WowPlayableClassSHAMAN, database.WowPlayableClassMAGE,
		database.WowPlayableClassWARLOCK, database.WowPlayableClassDRUID:
		return class, true
	default:
		return "", false
	}
}

// assembleTrends turns the raw per-slot rows into the response envelope,
// applying the minimum sample size and per-slot caps. Pure; unit-tested.
func assembleTrends(
	items []database.GearTrendsSlotItemsRow,
	enchants []database.GearTrendsSlotEnchantsRow,
	filters trendsFilters,
	now time.Time,
) chroniclesdk.GearTrendsResponse {
	realmID := ""
	if filters.RealmID != uuid.Nil {
		realmID = filters.RealmID.String()
	}
	resp := chroniclesdk.GearTrendsResponse{
		Class:           filters.Class,
		Spec:            filters.Spec,
		LookbackDays:    int32(filters.Days),
		InstanceName:    filters.InstanceName,
		RealmID:         realmID,
		TopPerformances: trendsTopPerformances,
		MinSampleSize:   trendsMinSampleSize,
		GeneratedAt:     now.UTC(),
		Slots:           []chroniclesdk.GearTrendsSlot{},
	}
	if len(items) > 0 {
		resp.CohortSize = items[0].CohortSize
	}
	if resp.CohortSize < trendsMinSampleSize {
		resp.InsufficientSample = true
		return resp
	}

	slotIndex := map[int32]int{}
	slotAt := func(slot int32) *chroniclesdk.GearTrendsSlot {
		if i, ok := slotIndex[slot]; ok {
			return &resp.Slots[i]
		}
		resp.Slots = append(resp.Slots, chroniclesdk.GearTrendsSlot{Slot: slot})
		slotIndex[slot] = len(resp.Slots) - 1
		return &resp.Slots[len(resp.Slots)-1]
	}

	pct := func(count int32) float64 {
		return float64(count) / float64(resp.CohortSize) * 100
	}

	for _, row := range items {
		slot := slotAt(row.Slot)
		if len(slot.Items) >= trendsMaxItemsPerSlot {
			continue
		}
		item := chroniclesdk.GearTrendsItem{
			ItemID:      row.ItemID,
			ItemName:    row.ItemName,
			ItemQuality: row.ItemQuality,
			ItemIcon:    row.ItemIcon,
			WearerCount: row.WearerCount,
			Percent:     pct(row.WearerCount),
		}
		if row.ItemLevel > 0 {
			lvl := row.ItemLevel
			item.ItemLevel = &lvl
		}
		slot.Items = append(slot.Items, item)
	}

	for _, row := range enchants {
		// Only annotate slots that have visible items.
		i, ok := slotIndex[row.Slot]
		if !ok {
			continue
		}
		slot := &resp.Slots[i]
		if len(slot.Enchants) >= trendsMaxEnchantsPerSlot {
			continue
		}
		name := row.EnchantName
		if name == "" {
			name = fmt.Sprintf("Enchant #%d", row.EnchantID)
		}
		slot.Enchants = append(slot.Enchants, chroniclesdk.GearTrendsEnchant{
			EnchantID:   row.EnchantID,
			Name:        name,
			WearerCount: row.WearerCount,
			Percent:     pct(row.WearerCount),
		})
	}

	return resp
}
