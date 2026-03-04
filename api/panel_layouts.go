package api

import (
	"database/sql"
	"encoding/json"
	"errors"
	"net/http"
	"regexp"

	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/api/httpapi"
	"github.com/Emyrk/chronicle/api/httpmw"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/authz"
	"github.com/Emyrk/chronicle/database/authz/policy"
	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
)

var panelLayoutTitleRegex = regexp.MustCompile(`^[A-Za-z1-9_\-\s]+$`)

const maxPanelLayoutPayloadBytes = 10 * 1024

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

func (a *API) ListUserPanelLayouts(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	targetUser := httpmw.User(ctx)

	layouts, err := a.Opts.Zed.ListUserPanelLayouts(ctx, targetUser.ID)
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

func (a *API) GetUserPanelLayoutByTitle(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	targetUser := httpmw.User(ctx)
	title := chi.URLParam(r, "title")

	layout, err := a.Opts.Zed.GetUserPanelLayoutByTitle(ctx, database.GetUserPanelLayoutByTitleParams{
		UserID: targetUser.ID,
		Lower:  title,
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

func (a *API) CreateUserPanelLayout(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	targetUser := httpmw.User(ctx)

	actor, ok := authz.ActorFromContext(ctx)
	if !ok {
		httpapi.Forbidden(w, nil)
		return
	}
	if ok, err := a.Opts.Zed.CheckOne(ctx, nil, policy.New().GlobalChronicle().CanCreate_layout_User(actor)); !ok || err != nil {
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

	layout, err := a.Opts.Zed.CreateUserPanelLayout(ctx, database.CreateUserPanelLayoutParams{
		UserID:      targetUser.ID,
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

func (a *API) UpdateUserPanelLayoutByID(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	targetUser := httpmw.User(ctx)
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
	if ok, err := a.Opts.Zed.CheckOne(ctx, nil, policy.New().Layout(layoutID).CanEdit_User(actor)); !ok || err != nil {
		httpapi.Forbidden(w, nil)
		return
	}

	var req chroniclesdk.UpdateUserPanelLayoutRequest
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

	layout, err := a.Opts.Zed.UpdateUserPanelLayoutByID(ctx, database.UpdateUserPanelLayoutByIDParams{
		ID:          layoutID,
		UserID:      targetUser.ID,
		Title:       req.Title,
		Icon:        icon,
		Description: req.Description,
		Payload:     payload,
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

func (a *API) DeleteUserPanelLayoutByID(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	targetUser := httpmw.User(ctx)
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
	if ok, err := a.Opts.Zed.CheckOne(ctx, nil, policy.New().Layout(layoutID).CanDelete_User(actor)); !ok || err != nil {
		httpapi.Forbidden(w, nil)
		return
	}

	affected, err := a.Opts.Zed.DeleteUserPanelLayoutByID(ctx, database.DeleteUserPanelLayoutByIDParams{
		UserID: targetUser.ID,
		ID:     layoutID,
	})
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
