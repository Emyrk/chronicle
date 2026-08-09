// Package gearprogressionapi serves gear progressions: a player-picked
// item pool that drives a derived leveling scrubber, plus explicit stage
// snapshots for max level.
//
// It is deliberately a sibling of gearbuilderapi rather than a `kind`
// discriminator on gear lists — progressions store a different document
// (a pool) and the shipped gear-list endpoints stay untouched.
package gearprogressionapi

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
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/authz"
	"github.com/Emyrk/chronicle/internal/services/servicetenant"
)

const (
	maxUserProgressions = 50
	maxTitleLen         = 128
	maxDescriptionLen   = 2000
	maxPayloadBytes     = 262144

	// Payload document limits.
	payloadVersion   = 1
	maxPoolItems     = 400
	maxStages        = 16
	maxStageNameLen  = 64
	maxSlotIndex     = 18 // PlayerOutfit has 19 slots, 0-18
	maxNoteLen       = 500
	maxAlternatesLen = 8
)

// Handler owns all gear progression routes.
type Handler struct {
	zed  *authz.Authz
	auth *chronauth.Service
}

func New(zed *authz.Authz, auth *chronauth.Service) *Handler {
	return &Handler{zed: zed, auth: auth}
}

// Routes returns the gear progression router.
func (h *Handler) Routes() http.Handler {
	r := chi.NewRouter()

	// Public: view a shared progression.
	r.Get("/shared/{progressionID}", h.GetSharedProgression)

	r.Group(func(r chi.Router) {
		r.Use(h.auth.Authenticated(false))

		r.Get("/", h.ListMyProgressions)
		r.Post("/", h.CreateProgression)
		r.Put("/{progressionID}", h.UpdateProgression)
		r.Delete("/{progressionID}", h.DeleteProgression)
	})

	return r
}

func (h *Handler) CreateProgression(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	claims := chronauth.MustAuthenticatedClaims(ctx)

	var req chroniclesdk.CreateGearProgressionRequest
	if !httpapi.Read(ctx, w, r, &req) {
		return
	}

	if err := validateMeta(req.Title, req.Description); err != nil {
		httpapi.Write(ctx, w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}
	if err := validatePayload(req.Payload); err != nil {
		httpapi.Write(ctx, w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}

	tenantID := servicetenant.TenantIDFromContext(ctx)

	count, err := h.zed.CountUserGearProgressions(ctx, database.CountUserGearProgressionsParams{
		UserID:   claims.Subject,
		TenantID: tenantID,
	})
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}
	if count >= maxUserProgressions {
		httpapi.Write(ctx, w, http.StatusConflict, map[string]string{"error": "gear progression limit reached"})
		return
	}

	prog, err := h.zed.CreateGearProgression(ctx, database.CreateGearProgressionParams{
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

	httpapi.Write(ctx, w, http.StatusCreated, toSDK(prog))
}

func (h *Handler) ListMyProgressions(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	claims := chronauth.MustAuthenticatedClaims(ctx)

	progs, err := h.zed.ListGearProgressionsByUser(ctx, database.ListGearProgressionsByUserParams{
		UserID:   claims.Subject,
		TenantID: servicetenant.TenantIDFromContext(ctx),
	})
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}

	result := make([]chroniclesdk.GearProgression, 0, len(progs))
	for _, p := range progs {
		result = append(result, toSDK(p))
	}

	httpapi.Write(ctx, w, http.StatusOK, result)
}

func (h *Handler) GetSharedProgression(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	id, err := uuid.Parse(chi.URLParam(r, "progressionID"))
	if err != nil {
		httpapi.Write(ctx, w, http.StatusBadRequest, map[string]string{"error": "invalid progression ID"})
		return
	}

	prog, err := h.zed.GetGearProgressionByID(ctx, id)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			httpapi.Write(ctx, w, http.StatusNotFound, map[string]string{"error": "gear progression not found"})
			return
		}
		httpapi.InternalServerError(w, err)
		return
	}

	httpapi.Write(ctx, w, http.StatusOK, toSDK(prog))
}

func (h *Handler) UpdateProgression(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	claims := chronauth.MustAuthenticatedClaims(ctx)

	id, err := uuid.Parse(chi.URLParam(r, "progressionID"))
	if err != nil {
		httpapi.Write(ctx, w, http.StatusBadRequest, map[string]string{"error": "invalid progression ID"})
		return
	}

	var req chroniclesdk.UpdateGearProgressionRequest
	if !httpapi.Read(ctx, w, r, &req) {
		return
	}

	if req.Title != nil {
		if err := validateTitle(*req.Title); err != nil {
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

	params := database.UpdateGearProgressionParams{
		ID:       id,
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

	prog, err := h.zed.UpdateGearProgression(ctx, params)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			httpapi.Write(ctx, w, http.StatusNotFound, map[string]string{"error": "gear progression not found"})
			return
		}
		httpapi.InternalServerError(w, err)
		return
	}

	httpapi.Write(ctx, w, http.StatusOK, toSDK(prog))
}

func (h *Handler) DeleteProgression(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	claims := chronauth.MustAuthenticatedClaims(ctx)

	id, err := uuid.Parse(chi.URLParam(r, "progressionID"))
	if err != nil {
		httpapi.Write(ctx, w, http.StatusBadRequest, map[string]string{"error": "invalid progression ID"})
		return
	}

	rows, err := h.zed.DeleteGearProgression(ctx, database.DeleteGearProgressionParams{
		ID:       id,
		UserID:   claims.Subject,
		TenantID: servicetenant.TenantIDFromContext(ctx),
	})
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}
	if rows == 0 {
		httpapi.Write(ctx, w, http.StatusNotFound, map[string]string{"error": "gear progression not found"})
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

// ─── Validation ──────────────────────────────────────────────

func validateMeta(title, description string) error {
	if err := validateTitle(title); err != nil {
		return err
	}
	if len(description) > maxDescriptionLen {
		return errors.New("description too long")
	}
	return nil
}

func validateTitle(title string) error {
	title = strings.TrimSpace(title)
	if title == "" {
		return errors.New("title is required")
	}
	if len(title) > maxTitleLen {
		return errors.New("title too long")
	}
	return nil
}

// validatePayload structurally checks the progression document. It mirrors
// the gear-list payload check for the stage half and adds pool limits.
func validatePayload(payload json.RawMessage) error {
	if len(payload) > maxPayloadBytes {
		return errors.New("payload too large")
	}
	if len(payload) == 0 {
		return nil
	}

	dec := json.NewDecoder(bytes.NewReader(payload))
	dec.DisallowUnknownFields()
	var doc chroniclesdk.GearProgressionPayload
	if err := dec.Decode(&doc); err != nil {
		return fmt.Errorf("payload is not a valid gear progression document: %w", err)
	}

	if doc.Version != payloadVersion {
		return fmt.Errorf("unsupported payload version %d, expected %d", doc.Version, payloadVersion)
	}
	if len(doc.Pool) > maxPoolItems {
		return fmt.Errorf("too many pool items, maximum is %d", maxPoolItems)
	}
	for i, item := range doc.Pool {
		if item.ItemID <= 0 {
			return fmt.Errorf("pool entry %d has an invalid item ID", i+1)
		}
		if len(item.Note) > maxNoteLen {
			return fmt.Errorf("pool entry %d note too long, maximum is %d characters", i+1, maxNoteLen)
		}
	}
	if len(doc.Stages) > maxStages {
		return fmt.Errorf("too many stages, maximum is %d", maxStages)
	}
	for i, stage := range doc.Stages {
		if len(stage.Name) > maxStageNameLen {
			return fmt.Errorf("stage %d name too long, maximum is %d characters", i+1, maxStageNameLen)
		}
		if stage.Level != nil && (*stage.Level < 1 || *stage.Level > 100) {
			return fmt.Errorf("stage %d has an invalid level, expected 1-100", i+1)
		}
		for key, slot := range stage.Slots {
			idx, err := strconv.Atoi(key)
			if err != nil || idx < 0 || idx > maxSlotIndex {
				return fmt.Errorf("stage %d has invalid slot key %q, expected \"0\"..\"%d\"", i+1, key, maxSlotIndex)
			}
			if slot.ItemID <= 0 {
				return fmt.Errorf("stage %d slot %s has an invalid item ID", i+1, key)
			}
			if len(slot.Note) > maxNoteLen {
				return fmt.Errorf("stage %d slot %s note too long, maximum is %d characters", i+1, key, maxNoteLen)
			}
			if len(slot.Alternates) > maxAlternatesLen {
				return fmt.Errorf("stage %d slot %s has too many alternates, maximum is %d", i+1, key, maxAlternatesLen)
			}
			for _, alt := range slot.Alternates {
				if alt.ItemID <= 0 {
					return fmt.Errorf("stage %d slot %s has an alternate with an invalid item ID", i+1, key)
				}
				if len(alt.Note) > maxNoteLen {
					return fmt.Errorf("stage %d slot %s has an alternate note that is too long, maximum is %d characters", i+1, key, maxNoteLen)
				}
			}
		}
	}
	return nil
}

// ─── Conversions ─────────────────────────────────────────────

func toSDK(p database.GearProgression) chroniclesdk.GearProgression {
	return chroniclesdk.GearProgression{
		ID:          p.ID,
		UserID:      p.UserID,
		TenantID:    p.TenantID,
		Title:       p.Title,
		Description: p.Description,
		ClassID:     p.ClassID,
		SpecName:    p.SpecName,
		Payload:     p.Payload,
		CreatedAt:   p.CreatedAt.Time,
		UpdatedAt:   p.UpdatedAt.Time,
	}
}
