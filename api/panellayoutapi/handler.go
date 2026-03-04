package panellayoutapi

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"regexp"

	"github.com/Emyrk/chronicle/api/chronauth"
	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/api/httpapi"
	"github.com/Emyrk/chronicle/api/httpmw"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/authz"
	"github.com/Emyrk/chronicle/database/authz/policy"
	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
)

var panelLayoutTitleRegex = regexp.MustCompile(`^[A-Za-z0-9_\-\s]+$`)

const (
	maxPanelLayoutPayloadBytes = 10 * 1024
	maxPanelCount              = 8
	maxUserPanelLayouts        = 30
)

type Handler struct {
	zed *authz.Authz
}

func New(zed *authz.Authz) *Handler {
	return &Handler{zed: zed}
}

func (h *Handler) Routes() http.Handler {
	r := chi.NewRouter()
	r.Route("/{userID}", func(r chi.Router) {
		r.Use(httpmw.UserIDMiddleware(h.zed))
		r.Get("/", h.ListUserPanelLayouts)
	})
	r.Get("/shared/{layoutID}", h.GetSharedLayout)
	r.Post("/track", h.TrackLayout)
	r.Delete("/track/{layoutID}", h.UntrackLayout)
	r.Post("/", h.CreateUserPanelLayout)
	r.Put("/{layoutID}", h.UpdateUserPanelLayoutByID)
	r.Delete("/{layoutID}", h.DeleteUserPanelLayoutByID)
	return r
}

func countPanelsInPayload(payload json.RawMessage) (int, error) {
	var partial struct {
		Items []json.RawMessage `json:"items"`
	}

	if err := json.Unmarshal(payload, &partial); err != nil {
		return 0, err
	}

	return len(partial.Items), nil
}

func validatePanelLayoutRequest(title string, payload json.RawMessage) (string, bool) {
	if title == "" {
		return "title is required", false
	}
	if !panelLayoutTitleRegex.MatchString(title) {
		return "title must match [A-Z, a-z, 0-9, _, -, space]", false
	}
	if len(payload) > maxPanelLayoutPayloadBytes {
		return "payload exceeds 10KB limit", false
	}
	if len(payload) == 0 {
		payload = json.RawMessage(`{}`)
	}
	if !json.Valid(payload) {
		return "payload must be valid JSON", false
	}

	count, err := countPanelsInPayload(payload)
	if err == nil && count > maxPanelCount {
		return fmt.Sprintf("layout cannot exceed %d panels (has %d)", maxPanelCount, count), false
	}

	return "", true
}

func toOwnerIDPtr(userID uuid.NullUUID) *uuid.UUID {
	if !userID.Valid {
		return nil
	}
	id := userID.UUID
	return &id
}

func toStringPtr(value pgtype.Text) *string {
	if !value.Valid {
		return nil
	}
	v := value.String
	return &v
}

func toNullUUID(id uuid.UUID) uuid.NullUUID {
	return uuid.NullUUID{UUID: id, Valid: true}
}

func panelLayoutToSDK(row database.UserPanelLayout) chroniclesdk.UserPanelLayout {
	return chroniclesdk.UserPanelLayout{
		ID:           row.ID,
		Title:        row.Title,
		Icon:         row.Icon,
		Description:  row.Description,
		Payload:      json.RawMessage(row.Payload),
		Version:      row.Version,
		OwnerID:      toOwnerIDPtr(row.UserID),
		IsTracked:    false,
		TrackerCount: 0,
		CreatedAt:    row.CreatedAt.Time,
		UpdatedAt:    row.UpdatedAt.Time,
	}
}

func panelLayoutListRowToSDK(row database.ListUserPanelLayoutsRow) chroniclesdk.UserPanelLayout {
	return chroniclesdk.UserPanelLayout{
		ID:            row.ID,
		Title:         row.Title,
		Icon:          row.Icon,
		Description:   row.Description,
		Payload:       json.RawMessage(row.Payload),
		Version:       row.Version,
		OwnerID:       toOwnerIDPtr(row.UserID),
		OwnerUsername: toStringPtr(row.OwnerUsername),
		IsTracked:     row.IsTracked,
		TrackerCount:  row.TrackerCount,
		CreatedAt:     row.CreatedAt.Time,
		UpdatedAt:     row.UpdatedAt.Time,
	}
}

func panelLayoutWithTrackerToSDK(row database.GetPanelLayoutByIDRow) chroniclesdk.UserPanelLayout {
	return chroniclesdk.UserPanelLayout{
		ID:            row.ID,
		Title:         row.Title,
		Icon:          row.Icon,
		Description:   row.Description,
		Payload:       json.RawMessage(row.Payload),
		Version:       row.Version,
		OwnerID:       toOwnerIDPtr(row.UserID),
		OwnerUsername: toStringPtr(row.OwnerUsername),
		IsTracked:     false,
		TrackerCount:  row.TrackerCount,
		CreatedAt:     row.CreatedAt.Time,
		UpdatedAt:     row.UpdatedAt.Time,
	}
}

func writeDuplicateLayoutTitleError(ctx context.Context, w http.ResponseWriter) {
	err := httpapi.NewAPIError(
		errors.New("layout with that title already exists for this user"),
		"A layout with this title already exists in your Layout Book.",
		http.StatusBadRequest,
	).
		CTA("Rename the layout before saving or cloning.")

	httpapi.Write(ctx, w, err.Status, err.Response)
}

func (h *Handler) ensureUserLayoutLimitNotReached(ctx context.Context, w http.ResponseWriter, userID uuid.UUID) bool {
	count, err := h.zed.CountUserPanelLayoutsTotal(ctx, toNullUUID(userID))
	if err != nil {
		httpapi.InternalServerError(w, err)
		return false
	}
	if count >= maxUserPanelLayouts {
		httpapi.Write(ctx, w, http.StatusConflict, chroniclesdk.Response{
			Message: fmt.Sprintf("maximum of %d panel layouts reached", maxUserPanelLayouts),
		})
		return false
	}

	return true
}

func (h *Handler) ListUserPanelLayouts(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	targetUser := httpmw.User(ctx)

	layouts, err := h.zed.ListUserPanelLayouts(ctx, toNullUUID(targetUser.ID))
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}

	resp := make([]chroniclesdk.UserPanelLayout, 0, len(layouts))
	for _, layout := range layouts {
		resp = append(resp, panelLayoutListRowToSDK(layout))
	}

	httpapi.Write(ctx, w, http.StatusOK, chroniclesdk.ListUserPanelLayoutsResponse{Layouts: resp})
}

func (h *Handler) GetSharedLayout(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	layoutIDRaw := chi.URLParam(r, "layoutID")
	layoutID, err := uuid.Parse(layoutIDRaw)
	if err != nil {
		httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{Message: "invalid layout id"})
		return
	}

	layout, err := h.zed.GetPanelLayoutByID(ctx, layoutID)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			httpapi.Write(ctx, w, http.StatusNotFound, chroniclesdk.Response{Message: "layout not found"})
			return
		}
		httpapi.InternalServerError(w, err)
		return
	}

	claims := chronauth.MustAuthenticatedClaims(ctx)
	isTracked, err := h.zed.IsLayoutTrackedByUser(ctx, database.IsLayoutTrackedByUserParams{
		UserID:   claims.Subject,
		LayoutID: layoutID,
	})
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}

	resp := panelLayoutWithTrackerToSDK(layout)
	resp.IsTracked = isTracked
	httpapi.Write(ctx, w, http.StatusOK, resp)
}

func (h *Handler) TrackLayout(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	claims := chronauth.MustAuthenticatedClaims(ctx)

	var req chroniclesdk.TrackLayoutRequest
	if !httpapi.Read(ctx, w, r, &req) {
		return
	}

	layout, err := h.zed.GetPanelLayoutByID(ctx, req.LayoutID)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			httpapi.Write(ctx, w, http.StatusNotFound, chroniclesdk.Response{Message: "layout not found"})
			return
		}
		httpapi.InternalServerError(w, err)
		return
	}

	if layout.UserID.Valid && layout.UserID.UUID == claims.Subject {
		httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{Message: "cannot track your own layout"})
		return
	}

	if !h.ensureUserLayoutLimitNotReached(ctx, w, claims.Subject) {
		return
	}

	if _, err := h.zed.TrackUserPanelLayout(ctx, database.TrackUserPanelLayoutParams{
		UserID:   claims.Subject,
		LayoutID: req.LayoutID,
	}); err != nil {
		httpapi.InternalServerError(w, err)
		return
	}

	httpapi.Write(ctx, w, http.StatusNoContent, nil)
}

func (h *Handler) UntrackLayout(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	claims := chronauth.MustAuthenticatedClaims(ctx)
	layoutIDRaw := chi.URLParam(r, "layoutID")
	layoutID, err := uuid.Parse(layoutIDRaw)
	if err != nil {
		httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{Message: "invalid layout id"})
		return
	}

	affected, err := h.zed.UntrackUserPanelLayout(ctx, database.UntrackUserPanelLayoutParams{
		UserID:   claims.Subject,
		LayoutID: layoutID,
	})
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}
	if affected == 0 {
		httpapi.Write(ctx, w, http.StatusNotFound, chroniclesdk.Response{Message: "layout tracking not found"})
		return
	}

	httpapi.Write(ctx, w, http.StatusNoContent, nil)
}

func (h *Handler) CreateUserPanelLayout(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	claims := chronauth.MustAuthenticatedClaims(ctx)

	actor, ok := authz.ActorFromContext(ctx)
	if !ok {
		httpapi.Forbidden(w, nil)
		return
	}
	if ok, err := h.zed.CheckOne(ctx, nil, policy.New().GlobalChronicle().CanCreate_layout_User(actor)); !ok || err != nil {
		httpapi.Forbidden(w, nil)
		return
	}

	var req chroniclesdk.CreateUserPanelLayoutRequest
	if !httpapi.Read(ctx, w, r, &req) {
		return
	}

	if errMsg, ok := validatePanelLayoutRequest(req.Title, req.Payload); !ok {
		httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{Message: errMsg})
		return
	}

	if !h.ensureUserLayoutLimitNotReached(ctx, w, claims.Subject) {
		return
	}

	payload := req.Payload
	if len(payload) == 0 {
		payload = json.RawMessage(`{}`)
	}
	icon := req.Icon
	if icon == "" {
		icon = "INV_Misc_Book_09"
	}

	layout, err := h.zed.CreateUserPanelLayout(ctx, database.CreateUserPanelLayoutParams{
		UserID:      toNullUUID(claims.Subject),
		Title:       req.Title,
		Icon:        icon,
		Description: req.Description,
		Payload:     payload,
	})
	if err != nil {
		if database.IsUniqueViolation(err, database.UniqueUserPanelLayoutsUserTitleCiUidx) {
			writeDuplicateLayoutTitleError(ctx, w)
			return
		}
		httpapi.InternalServerError(w, err)
		return
	}

	httpapi.Write(ctx, w, http.StatusCreated, panelLayoutToSDK(layout))
}

func (h *Handler) UpdateUserPanelLayoutByID(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	layoutIDRaw := chi.URLParam(r, "layoutID")
	layoutID, err := uuid.Parse(layoutIDRaw)
	if err != nil {
		httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{Message: "invalid layout id"})
		return
	}

	actor, ok := authz.ActorFromContext(ctx)
	if !ok {
		httpapi.Forbidden(w, nil)
		return
	}
	if ok, err := h.zed.CheckOne(ctx, nil, policy.New().Layout(layoutID).CanEdit_User(actor)); !ok || err != nil {
		httpapi.Forbidden(w, nil)
		return
	}

	var req chroniclesdk.UpdateUserPanelLayoutRequest
	if !httpapi.Read(ctx, w, r, &req) {
		return
	}

	if req.Title != nil {
		if errMsg, ok := validatePanelLayoutRequest(*req.Title, json.RawMessage(`{}`)); !ok {
			httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{Message: errMsg})
			return
		}
	}
	if req.Payload != nil {
		if len(*req.Payload) > maxPanelLayoutPayloadBytes {
			httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{Message: "payload exceeds 10KB limit"})
			return
		}
		if !json.Valid(*req.Payload) {
			httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{Message: "payload must be valid JSON"})
			return
		}
		count, err := countPanelsInPayload(*req.Payload)
		if err == nil && count > maxPanelCount {
			httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{Message: fmt.Sprintf("layout cannot exceed %d panels (has %d)", maxPanelCount, count)})
			return
		}
	}

	updateTitle := pgtype.Text{}
	if req.Title != nil && *req.Title != "" {
		updateTitle = pgtype.Text{String: *req.Title, Valid: true}
	}
	updateIcon := pgtype.Text{}
	if req.Icon != nil && *req.Icon != "" {
		updateIcon = pgtype.Text{String: *req.Icon, Valid: true}
	}
	updateDescription := pgtype.Text{}
	if req.Description != nil && *req.Description != "" {
		updateDescription = pgtype.Text{String: *req.Description, Valid: true}
	}
	var updatePayload []byte
	if req.Payload != nil && len(*req.Payload) > 0 {
		updatePayload = *req.Payload
	}

	layout, err := h.zed.UpdateUserPanelLayoutByID(ctx, database.UpdateUserPanelLayoutByIDParams{
		ID:          layoutID,
		Title:       updateTitle,
		Icon:        updateIcon,
		Description: updateDescription,
		Payload:     updatePayload,
	})
	if err != nil {
		if database.IsUniqueViolation(err, database.UniqueUserPanelLayoutsUserTitleCiUidx) {
			writeDuplicateLayoutTitleError(ctx, w)
			return
		}
		if errors.Is(err, sql.ErrNoRows) {
			httpapi.Write(ctx, w, http.StatusNotFound, chroniclesdk.Response{Message: "layout not found"})
			return
		}
		httpapi.InternalServerError(w, err)
		return
	}

	httpapi.Write(ctx, w, http.StatusOK, panelLayoutToSDK(layout))
}

func (h *Handler) DeleteUserPanelLayoutByID(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	layoutIDRaw := chi.URLParam(r, "layoutID")
	layoutID, err := uuid.Parse(layoutIDRaw)
	if err != nil {
		httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{Message: "invalid layout id"})
		return
	}

	actor, ok := authz.ActorFromContext(ctx)
	if !ok {
		httpapi.Forbidden(w, nil)
		return
	}
	if ok, err := h.zed.CheckOne(ctx, nil, policy.New().Layout(layoutID).CanDelete_User(actor)); !ok || err != nil {
		httpapi.Forbidden(w, nil)
		return
	}

	affected, err := h.zed.DeleteUserPanelLayoutByID(ctx, layoutID)
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}
	if affected == 0 {
		httpapi.Write(ctx, w, http.StatusNotFound, chroniclesdk.Response{Message: "layout not found"})
		return
	}

	httpapi.Write(ctx, w, http.StatusNoContent, nil)
}
