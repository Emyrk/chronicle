package gearbuilderapi

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/Emyrk/chronicle/api/chronauth"
	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/api/httpapi"
	"github.com/Emyrk/chronicle/api/httpmw"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/authz"
	"github.com/Emyrk/chronicle/database/authz/policy"
	"github.com/Emyrk/chronicle/internal/lrucache"
	"github.com/Emyrk/chronicle/internal/services/servicecache"
	"github.com/Emyrk/chronicle/internal/services/servicetenant"
)

const (
	maxUserGearLists      = 50
	maxUserStatWeights    = 50
	maxGearListTitleLen   = 128
	maxStatWeightNameLen  = 128
	maxPayloadBytes       = 262144
	maxWeightsPayloadSize = 8192
	maxDescriptionLen     = 2000

	// Payload document limits.
	gearPayloadVersion   = 2
	maxStagesPerList     = 16
	maxStageNameLen      = 64
	maxSlotIndex         = 18 // PlayerOutfit has 19 slots, 0-18
	maxSlotNoteLen       = 500
	maxAlternatesPerSlot = 8
)

// Handler owns all gear builder routes.
type Handler struct {
	zed  *authz.Authz
	auth *chronauth.Service

	trendsCache *lrucache.Cache[string, chroniclesdk.GearTrendsResponse]
}

// New creates a new gear builder handler. cacheSvc may be nil (tests);
// the trends cache then runs unregistered and unmetered.
func New(zed *authz.Authz, auth *chronauth.Service, cacheSvc *servicecache.Service) *Handler {
	trendsCache, err := servicecache.NewCache(cacheSvc, lrucache.Opts[string, chroniclesdk.GearTrendsResponse]{
		Name:     "gear_trends",
		Capacity: 256,
		TTL:      trendsCacheTTL,
	})
	if err != nil {
		// Opts are static; construction only fails on programmer error.
		panic(err)
	}
	return &Handler{zed: zed, auth: auth, trendsCache: trendsCache}
}

// Routes returns the gear builder router.
func (h *Handler) Routes() http.Handler {
	r := chi.NewRouter()

	// Public: view shared gear lists.
	r.Get("/lists/shared/{listID}", h.GetSharedGearList)

	// Public: observed gear trends for a class/spec cohort.
	r.Get("/trends", h.GearTrends)

	// Public: list pinned stat weights (default presets).
	r.Get("/stat-weight-pins", h.ListStatWeightPins)

	// Authenticated routes.
	r.Group(func(r chi.Router) {
		r.Use(h.auth.Authenticated(false))

		// Gear lists CRUD.
		r.Get("/lists", h.ListMyGearLists)
		r.Post("/lists", h.CreateGearList)
		r.Put("/lists/{listID}", h.UpdateGearList)
		r.Delete("/lists/{listID}", h.DeleteGearList)

		// Forks.
		r.Post("/lists/{listID}/fork", h.ForkGearList)

		// Stat weights CRUD.
		r.Get("/stat-weights", h.ListMyStatWeights)
		r.Post("/stat-weights", h.CreateStatWeight)
		r.Put("/stat-weights/{weightID}", h.UpdateStatWeight)
		r.Delete("/stat-weights/{weightID}", h.DeleteStatWeight)

		// Admin: pin/unpin stat weights.
		r.Route("/admin/stat-weight-pins", func(r chi.Router) {
			r.Use(httpmw.Can(h.zed, policy.New().GlobalChronicle().CanAdmin_tenants_User))
			r.Post("/", h.CreateStatWeightPin)
			r.Delete("/{pinID}", h.DeleteStatWeightPin)
		})
	})

	return r
}

// ─── Gear Lists ──────────────────────────────────────────────

func (h *Handler) CreateGearList(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	claims := chronauth.MustAuthenticatedClaims(ctx)

	var req chroniclesdk.CreateGearListRequest
	if !httpapi.Read(ctx, w, r, &req) {
		return
	}

	if err := validateGearListTitle(req.Title); err != nil {
		httpapi.Write(ctx, w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}
	if len(req.Description) > maxDescriptionLen {
		httpapi.Write(ctx, w, http.StatusBadRequest, map[string]string{"error": "description too long"})
		return
	}
	if err := validatePayload(req.Payload); err != nil {
		httpapi.Write(ctx, w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}

	tenantID := servicetenant.TenantIDFromContext(ctx)

	count, err := h.zed.CountUserGearLists(ctx, database.CountUserGearListsParams{
		UserID:   claims.Subject,
		TenantID: tenantID,
	})
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}
	if count >= maxUserGearLists {
		httpapi.Write(ctx, w, http.StatusConflict, map[string]string{"error": "gear list limit reached"})
		return
	}

	list, err := h.zed.CreateGearList(ctx, database.CreateGearListParams{
		ID:          uuid.New(),
		UserID:      claims.Subject,
		TenantID:    tenantID,
		Title:       req.Title,
		Description: req.Description,
		ClassID:     req.ClassID,
		SpecName:    req.SpecName,
		Payload:     req.Payload,
	})
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}

	httpapi.Write(ctx, w, http.StatusCreated, gearListToSDK(list))
}

func (h *Handler) ListMyGearLists(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	claims := chronauth.MustAuthenticatedClaims(ctx)
	tenantID := servicetenant.TenantIDFromContext(ctx)

	lists, err := h.zed.ListGearListsByUser(ctx, database.ListGearListsByUserParams{
		UserID:   claims.Subject,
		TenantID: tenantID,
	})
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}

	result := make([]chroniclesdk.GearList, 0, len(lists))
	for _, l := range lists {
		result = append(result, gearListToSDK(l))
	}

	httpapi.Write(ctx, w, http.StatusOK, result)
}

func (h *Handler) GetSharedGearList(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	listID, err := uuid.Parse(chi.URLParam(r, "listID"))
	if err != nil {
		httpapi.Write(ctx, w, http.StatusBadRequest, map[string]string{"error": "invalid list ID"})
		return
	}

	list, err := h.zed.GetGearListByID(ctx, listID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			httpapi.Write(ctx, w, http.StatusNotFound, map[string]string{"error": "gear list not found"})
			return
		}
		httpapi.InternalServerError(w, err)
		return
	}

	httpapi.Write(ctx, w, http.StatusOK, gearListToSDK(list))
}

func (h *Handler) UpdateGearList(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	claims := chronauth.MustAuthenticatedClaims(ctx)

	listID, err := uuid.Parse(chi.URLParam(r, "listID"))
	if err != nil {
		httpapi.Write(ctx, w, http.StatusBadRequest, map[string]string{"error": "invalid list ID"})
		return
	}

	var req chroniclesdk.UpdateGearListRequest
	if !httpapi.Read(ctx, w, r, &req) {
		return
	}

	if req.Title != nil {
		if err := validateGearListTitle(*req.Title); err != nil {
			httpapi.Write(ctx, w, http.StatusBadRequest, map[string]string{"error": err.Error()})
			return
		}
	}
	if req.Description != nil && len(*req.Description) > maxDescriptionLen {
		httpapi.Write(ctx, w, http.StatusBadRequest, map[string]string{"error": "description too long"})
		return
	}
	if req.Payload != nil {
		if err := validatePayload(*req.Payload); err != nil {
			httpapi.Write(ctx, w, http.StatusBadRequest, map[string]string{"error": err.Error()})
			return
		}
	}

	params := database.UpdateGearListParams{
		ID:       listID,
		UserID:   claims.Subject,
		TenantID: servicetenant.TenantIDFromContext(ctx),
	}
	if req.Title != nil {
		params.Title = pgtype.Text{String: *req.Title, Valid: true}
	}
	if req.Description != nil {
		params.Description = pgtype.Text{String: *req.Description, Valid: true}
	}
	if req.ClassID != nil {
		params.ClassID = pgtype.Int4{Int32: *req.ClassID, Valid: true}
	}
	if req.SpecName != nil {
		params.SpecName = pgtype.Text{String: *req.SpecName, Valid: true}
	}
	if req.Payload != nil {
		params.Payload = *req.Payload
	}

	list, err := h.zed.UpdateGearList(ctx, params)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			httpapi.Write(ctx, w, http.StatusNotFound, map[string]string{"error": "gear list not found"})
			return
		}
		httpapi.InternalServerError(w, err)
		return
	}

	httpapi.Write(ctx, w, http.StatusOK, gearListToSDK(list))
}

func (h *Handler) DeleteGearList(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	claims := chronauth.MustAuthenticatedClaims(ctx)

	listID, err := uuid.Parse(chi.URLParam(r, "listID"))
	if err != nil {
		httpapi.Write(ctx, w, http.StatusBadRequest, map[string]string{"error": "invalid list ID"})
		return
	}

	rows, err := h.zed.DeleteGearList(ctx, database.DeleteGearListParams{
		ID:       listID,
		UserID:   claims.Subject,
		TenantID: servicetenant.TenantIDFromContext(ctx),
	})
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}
	if rows == 0 {
		httpapi.Write(ctx, w, http.StatusNotFound, map[string]string{"error": "gear list not found"})
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

// ─── Stat Weights ────────────────────────────────────────────

func (h *Handler) CreateStatWeight(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	claims := chronauth.MustAuthenticatedClaims(ctx)

	var req chroniclesdk.CreateGearStatWeightRequest
	if !httpapi.Read(ctx, w, r, &req) {
		return
	}

	if err := validateStatWeightName(req.Name); err != nil {
		httpapi.Write(ctx, w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}
	if len(req.Description) > maxDescriptionLen {
		httpapi.Write(ctx, w, http.StatusBadRequest, map[string]string{"error": "description too long"})
		return
	}
	if err := validateWeightsPayload(req.Weights); err != nil {
		httpapi.Write(ctx, w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}

	tenantID := servicetenant.TenantIDFromContext(ctx)

	// Check stat weight count via list (no dedicated count query).
	weights, err := h.zed.ListGearStatWeightsByUser(ctx, database.ListGearStatWeightsByUserParams{
		UserID:   claims.Subject,
		TenantID: tenantID,
	})
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}
	if len(weights) >= maxUserStatWeights {
		httpapi.Write(ctx, w, http.StatusConflict, map[string]string{"error": "stat weight limit reached"})
		return
	}

	sw, err := h.zed.CreateGearStatWeight(ctx, database.CreateGearStatWeightParams{
		ID:          uuid.New(),
		UserID:      claims.Subject,
		TenantID:    tenantID,
		Name:        req.Name,
		Description: req.Description,
		ClassID:     req.ClassID,
		SpecName:    req.SpecName,
		Weights:     req.Weights,
	})
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}

	httpapi.Write(ctx, w, http.StatusCreated, statWeightToSDK(sw))
}

func (h *Handler) ListMyStatWeights(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	claims := chronauth.MustAuthenticatedClaims(ctx)
	tenantID := servicetenant.TenantIDFromContext(ctx)

	weights, err := h.zed.ListGearStatWeightsByUser(ctx, database.ListGearStatWeightsByUserParams{
		UserID:   claims.Subject,
		TenantID: tenantID,
	})
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}

	result := make([]chroniclesdk.GearStatWeight, 0, len(weights))
	for _, sw := range weights {
		result = append(result, statWeightToSDK(sw))
	}

	httpapi.Write(ctx, w, http.StatusOK, result)
}

func (h *Handler) UpdateStatWeight(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	claims := chronauth.MustAuthenticatedClaims(ctx)

	weightID, err := uuid.Parse(chi.URLParam(r, "weightID"))
	if err != nil {
		httpapi.Write(ctx, w, http.StatusBadRequest, map[string]string{"error": "invalid weight ID"})
		return
	}

	var req chroniclesdk.UpdateGearStatWeightRequest
	if !httpapi.Read(ctx, w, r, &req) {
		return
	}

	if req.Name != nil {
		if err := validateStatWeightName(*req.Name); err != nil {
			httpapi.Write(ctx, w, http.StatusBadRequest, map[string]string{"error": err.Error()})
			return
		}
	}
	if req.Description != nil && len(*req.Description) > maxDescriptionLen {
		httpapi.Write(ctx, w, http.StatusBadRequest, map[string]string{"error": "description too long"})
		return
	}
	if req.Weights != nil {
		if err := validateWeightsPayload(*req.Weights); err != nil {
			httpapi.Write(ctx, w, http.StatusBadRequest, map[string]string{"error": err.Error()})
			return
		}
	}

	params := database.UpdateGearStatWeightParams{
		ID:       weightID,
		UserID:   claims.Subject,
		TenantID: servicetenant.TenantIDFromContext(ctx),
	}
	if req.Name != nil {
		params.Name = pgtype.Text{String: *req.Name, Valid: true}
	}
	if req.Description != nil {
		params.Description = pgtype.Text{String: *req.Description, Valid: true}
	}
	if req.ClassID != nil {
		params.ClassID = pgtype.Int4{Int32: *req.ClassID, Valid: true}
	}
	if req.SpecName != nil {
		params.SpecName = pgtype.Text{String: *req.SpecName, Valid: true}
	}
	if req.Weights != nil {
		params.Weights = *req.Weights
	}

	sw, err := h.zed.UpdateGearStatWeight(ctx, params)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			httpapi.Write(ctx, w, http.StatusNotFound, map[string]string{"error": "stat weight not found"})
			return
		}
		httpapi.InternalServerError(w, err)
		return
	}

	httpapi.Write(ctx, w, http.StatusOK, statWeightToSDK(sw))
}

func (h *Handler) DeleteStatWeight(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	claims := chronauth.MustAuthenticatedClaims(ctx)

	weightID, err := uuid.Parse(chi.URLParam(r, "weightID"))
	if err != nil {
		httpapi.Write(ctx, w, http.StatusBadRequest, map[string]string{"error": "invalid weight ID"})
		return
	}

	rows, err := h.zed.DeleteGearStatWeight(ctx, database.DeleteGearStatWeightParams{
		ID:       weightID,
		UserID:   claims.Subject,
		TenantID: servicetenant.TenantIDFromContext(ctx),
	})
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}
	if rows == 0 {
		httpapi.Write(ctx, w, http.StatusNotFound, map[string]string{"error": "stat weight not found"})
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

// ─── Stat Weight Pins (Admin) ────────────────────────────────

func (h *Handler) ListStatWeightPins(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	tenantID := servicetenant.TenantIDFromContext(ctx)

	datasetIDStr := r.URL.Query().Get("dataset_id")
	if datasetIDStr == "" {
		httpapi.Write(ctx, w, http.StatusBadRequest, map[string]string{"error": "dataset_id query parameter required"})
		return
	}
	datasetID, err := uuid.Parse(datasetIDStr)
	if err != nil {
		httpapi.Write(ctx, w, http.StatusBadRequest, map[string]string{"error": "invalid dataset_id"})
		return
	}

	pins, err := h.zed.ListGearStatWeightPins(ctx, database.ListGearStatWeightPinsParams{
		TenantID:  tenantID,
		DatasetID: datasetID,
	})
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}

	result := make([]chroniclesdk.GearStatWeightPin, 0, len(pins))
	for _, p := range pins {
		result = append(result, pinRowToSDK(p))
	}

	httpapi.Write(ctx, w, http.StatusOK, result)
}

func (h *Handler) CreateStatWeightPin(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	claims := chronauth.MustAuthenticatedClaims(ctx)
	tenantID := servicetenant.TenantIDFromContext(ctx)

	var req chroniclesdk.CreateGearStatWeightPinRequest
	if !httpapi.Read(ctx, w, r, &req) {
		return
	}

	if req.DatasetID == uuid.Nil {
		httpapi.Write(ctx, w, http.StatusBadRequest, map[string]string{"error": "dataset_id required"})
		return
	}
	if req.StatWeightID == uuid.Nil {
		httpapi.Write(ctx, w, http.StatusBadRequest, map[string]string{"error": "stat_weight_id required"})
		return
	}

	// Verify the stat weight exists in the current tenant.
	statWeight, err := h.zed.GetGearStatWeightByID(ctx, req.StatWeightID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			httpapi.Write(ctx, w, http.StatusBadRequest, map[string]string{"error": "stat weight not found"})
			return
		}
		httpapi.InternalServerError(w, err)
		return
	}
	if statWeight.TenantID != tenantID {
		httpapi.Write(ctx, w, http.StatusBadRequest, map[string]string{"error": "stat weight belongs to another tenant"})
		return
	}

	pin, err := h.zed.CreateGearStatWeightPin(ctx, database.CreateGearStatWeightPinParams{
		ID:           uuid.New(),
		TenantID:     tenantID,
		DatasetID:    req.DatasetID,
		StatWeightID: req.StatWeightID,
		PinnedBy:     claims.Subject,
	})
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}

	httpapi.Write(ctx, w, http.StatusCreated, pinToSDK(pin))
}

func (h *Handler) DeleteStatWeightPin(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	tenantID := servicetenant.TenantIDFromContext(ctx)

	pinID, err := uuid.Parse(chi.URLParam(r, "pinID"))
	if err != nil {
		httpapi.Write(ctx, w, http.StatusBadRequest, map[string]string{"error": "invalid pin ID"})
		return
	}

	rows, err := h.zed.DeleteGearStatWeightPin(ctx, database.DeleteGearStatWeightPinParams{
		ID:       pinID,
		TenantID: tenantID,
	})
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}
	if rows == 0 {
		httpapi.Write(ctx, w, http.StatusNotFound, map[string]string{"error": "pin not found"})
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

// ─── Validation ──────────────────────────────────────────────

func validateGearListTitle(title string) error {
	title = strings.TrimSpace(title)
	if title == "" {
		return errors.New("title is required")
	}
	if len(title) > maxGearListTitleLen {
		return errors.New("title too long")
	}
	return nil
}

func validatePayload(payload json.RawMessage) error {
	if len(payload) > maxPayloadBytes {
		return errors.New("payload too large")
	}
	if len(payload) == 0 {
		return nil
	}

	dec := json.NewDecoder(bytes.NewReader(payload))
	dec.DisallowUnknownFields()
	var doc chroniclesdk.GearListPayload
	if err := dec.Decode(&doc); err != nil {
		return fmt.Errorf("payload is not a valid gear list document: %w", err)
	}

	if doc.Version != gearPayloadVersion {
		return fmt.Errorf("unsupported payload version %d, expected %d", doc.Version, gearPayloadVersion)
	}
	if len(doc.Stages) > maxStagesPerList {
		return fmt.Errorf("too many stages, maximum is %d", maxStagesPerList)
	}
	for i, stage := range doc.Stages {
		if len(stage.Name) > maxStageNameLen {
			return fmt.Errorf("stage %d name too long, maximum is %d characters", i+1, maxStageNameLen)
		}
		for key, slot := range stage.Slots {
			idx, err := strconv.Atoi(key)
			if err != nil || idx < 0 || idx > maxSlotIndex {
				return fmt.Errorf("stage %d has invalid slot key %q, expected \"0\"..\"%d\"", i+1, key, maxSlotIndex)
			}
			if slot.ItemID <= 0 {
				return fmt.Errorf("stage %d slot %s has an invalid item ID", i+1, key)
			}
			if len(slot.Note) > maxSlotNoteLen {
				return fmt.Errorf("stage %d slot %s note too long, maximum is %d characters", i+1, key, maxSlotNoteLen)
			}
			if len(slot.Alternates) > maxAlternatesPerSlot {
				return fmt.Errorf("stage %d slot %s has too many alternates, maximum is %d", i+1, key, maxAlternatesPerSlot)
			}
			for _, alt := range slot.Alternates {
				if alt.ItemID <= 0 {
					return fmt.Errorf("stage %d slot %s has an alternate with an invalid item ID", i+1, key)
				}
				if len(alt.Note) > maxSlotNoteLen {
					return fmt.Errorf("stage %d slot %s has an alternate note that is too long, maximum is %d characters", i+1, key, maxSlotNoteLen)
				}
			}
		}
	}
	return nil
}

func validateStatWeightName(name string) error {
	name = strings.TrimSpace(name)
	if name == "" {
		return errors.New("name is required")
	}
	if len(name) > maxStatWeightNameLen {
		return errors.New("name too long")
	}
	return nil
}

func validateWeightsPayload(weights json.RawMessage) error {
	if len(weights) > maxWeightsPayloadSize {
		return errors.New("weights payload too large")
	}
	if len(weights) == 0 {
		return nil
	}
	if !json.Valid(weights) {
		return errors.New("weights is not valid JSON")
	}
	return nil
}

// ─── Conversions ─────────────────────────────────────────────

func gearListToSDK(l database.GearList) chroniclesdk.GearList {
	return chroniclesdk.GearList{
		ID:          l.ID,
		UserID:      l.UserID,
		TenantID:    l.TenantID,
		Title:       l.Title,
		Description: l.Description,
		ClassID:     l.ClassID,
		SpecName:    l.SpecName,
		Payload:     l.Payload,
		CreatedAt:   l.CreatedAt.Time,
		UpdatedAt:   l.UpdatedAt.Time,
		ForkedFromListID: func() *uuid.UUID {
			if l.ForkedFromListID.Valid {
				id := l.ForkedFromListID.UUID
				return &id
			}
			return nil
		}(),
	}
}

func statWeightToSDK(sw database.GearStatWeight) chroniclesdk.GearStatWeight {
	return chroniclesdk.GearStatWeight{
		ID:          sw.ID,
		UserID:      sw.UserID,
		TenantID:    sw.TenantID,
		Name:        sw.Name,
		Description: sw.Description,
		ClassID:     sw.ClassID,
		SpecName:    sw.SpecName,
		Weights:     sw.Weights,
		CreatedAt:   sw.CreatedAt.Time,
		UpdatedAt:   sw.UpdatedAt.Time,
	}
}

func pinToSDK(p database.GearStatWeightPin) chroniclesdk.GearStatWeightPin {
	return chroniclesdk.GearStatWeightPin{
		ID:           p.ID,
		TenantID:     p.TenantID,
		DatasetID:    p.DatasetID,
		StatWeightID: p.StatWeightID,
		PinnedBy:     p.PinnedBy,
		CreatedAt:    p.CreatedAt.Time,
	}
}

func pinRowToSDK(p database.ListGearStatWeightPinsRow) chroniclesdk.GearStatWeightPin {
	return chroniclesdk.GearStatWeightPin{
		ID:                    p.ID,
		TenantID:              p.TenantID,
		DatasetID:             p.DatasetID,
		StatWeightID:          p.StatWeightID,
		PinnedBy:              p.PinnedBy,
		CreatedAt:             p.CreatedAt.Time,
		StatWeightName:        p.StatWeightName,
		StatWeightDescription: p.StatWeightDescription,
		StatWeightClassID:     p.StatWeightClassID,
		StatWeightSpecName:    p.StatWeightSpecName,
		StatWeightWeights:     p.StatWeightWeights,
		StatWeightUserID:      p.StatWeightUserID,
	}
}
