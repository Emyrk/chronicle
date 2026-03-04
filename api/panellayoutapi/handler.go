package panellayoutapi

import (
	"database/sql"
	"encoding/json"
	"errors"
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

var panelLayoutTitleRegex = regexp.MustCompile(`^[A-Za-z1-9_\-\s]+$`)

const maxPanelLayoutPayloadBytes = 10 * 1024

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
	r.Post("/", h.CreateUserPanelLayout)
	r.Put("/{layoutID}", h.UpdateUserPanelLayoutByID)
	r.Delete("/{layoutID}", h.DeleteUserPanelLayoutByID)
	return r
}

func validatePanelLayoutRequest(title string, payload json.RawMessage) (string, bool) {
	if title == "" {
		return "title is required", false
	}
	if !panelLayoutTitleRegex.MatchString(title) {
		return "title must match [A-Z, a-z, 1-9, _, -, space]", false
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
	return "", true
}

func panelLayoutToSDK(row database.UserPanelLayout) chroniclesdk.UserPanelLayout {
	return chroniclesdk.UserPanelLayout{
		ID:          row.ID,
		Title:       row.Title,
		Icon:        row.Icon,
		Description: row.Description,
		Payload:     json.RawMessage(row.Payload),
		CreatedAt:   row.CreatedAt.Time,
		UpdatedAt:   row.UpdatedAt.Time,
	}
}

func (h *Handler) ListUserPanelLayouts(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	targetUser := httpmw.User(ctx)

	layouts, err := h.zed.ListUserPanelLayouts(ctx, targetUser.ID)
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}

	resp := make([]chroniclesdk.UserPanelLayout, 0, len(layouts))
	for _, layout := range layouts {
		resp = append(resp, panelLayoutToSDK(layout))
	}

	httpapi.Write(ctx, w, http.StatusOK, chroniclesdk.ListUserPanelLayoutsResponse{Layouts: resp})
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

	payload := req.Payload
	if len(payload) == 0 {
		payload = json.RawMessage(`{}`)
	}
	icon := req.Icon
	if icon == "" {
		icon = "INV_Misc_Book_09"
	}

	layout, err := h.zed.CreateUserPanelLayout(ctx, database.CreateUserPanelLayoutParams{
		UserID:      claims.Subject,
		Title:       req.Title,
		Icon:        icon,
		Description: req.Description,
		Payload:     payload,
	})
	if err != nil {
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
