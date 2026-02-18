package api

import (
	"database/sql"
	"encoding/json"
	"errors"
	"net/http"

	"github.com/Emyrk/chronicle/api/chronauth"
	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/api/httpapi"
	"github.com/Emyrk/chronicle/database"
	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
)

// ListGuilds returns a list of guilds with their page status
func (api *API) ListGuilds(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	search := r.URL.Query().Get("search")
	limit := 50
	offset := 0

	guilds, err := api.Opts.DB.ListGuildsWithPages(ctx, database.ListGuildsWithPagesParams{
		Column1: search, // Empty string handled in SQL with IS NULL check
		Limit:   int32(limit),
		Offset:  int32(offset),
	})
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}

	// Check if user can edit each guild
	userID := uuid.Nil
	if claims, ok := chronauth.AuthenticatedClaims(ctx); ok {
		userID = claims.Subject
	}

	result := make([]chroniclesdk.GuildInfo, 0, len(guilds))
	for _, g := range guilds {
		canEdit := false
		if userID != uuid.Nil {
			_, err := api.Opts.DB.GetGuildMember(ctx, database.GetGuildMemberParams{
				GuildID: g.ID,
				UserID:  userID,
			})
			canEdit = err == nil
		}

		result = append(result, chroniclesdk.GuildInfo{
			ID:        g.ID,
			Name:      g.Name,
			RealmID:   g.RealmID,
			RealmName: g.RealmName,
			HasPage:   g.PageID.Valid,
			CanEdit:   canEdit,
		})
	}

	httpapi.Write(ctx, w, http.StatusOK, chroniclesdk.ListGuildsResponse{
		Guilds: result,
		Total:  len(result),
	})
}

// GetGuild returns info about a specific guild
func (api *API) GetGuild(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	guildID, err := uuid.Parse(chi.URLParam(r, "guildID"))
	if err != nil {
		httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{
			Message: "Invalid guild ID",
		})
		return
	}

	guild, err := api.Opts.DB.GetGuildByID(ctx, guildID)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			httpapi.Write(ctx, w, http.StatusNotFound, chroniclesdk.Response{
				Message: "Guild not found",
			})
			return
		}
		httpapi.InternalServerError(w, err)
		return
	}

	// Check if page exists
	_, pageErr := api.Opts.DB.GetGuildPage(ctx, guildID)
	hasPage := pageErr == nil

	// Check if user can edit
	canEdit := false
	if claims, ok := chronauth.AuthenticatedClaims(ctx); ok {
		_, err := api.Opts.DB.GetGuildMember(ctx, database.GetGuildMemberParams{
			GuildID: guildID,
			UserID:  claims.Subject,
		})
		canEdit = err == nil
	}

	httpapi.Write(ctx, w, http.StatusOK, chroniclesdk.GuildInfo{
		ID:        guild.ID,
		Name:      guild.Name,
		RealmID:   guild.RealmID,
		RealmName: guild.RealmName,
		HasPage:   hasPage,
		CanEdit:   canEdit,
	})
}

// GetGuildPage returns the full page configuration for a guild
func (api *API) GetGuildPage(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	guildID, err := uuid.Parse(chi.URLParam(r, "guildID"))
	if err != nil {
		httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{
			Message: "Invalid guild ID",
		})
		return
	}

	page, err := api.Opts.DB.GetFullGuildPage(ctx, guildID)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			httpapi.Write(ctx, w, http.StatusNotFound, chroniclesdk.Response{
				Message: "Guild page not found",
			})
			return
		}
		httpapi.InternalServerError(w, err)
		return
	}

	// Check if user can edit
	canEdit := false
	if claims, ok := chronauth.AuthenticatedClaims(ctx); ok {
		_, err := api.Opts.DB.GetGuildMember(ctx, database.GetGuildMemberParams{
			GuildID: guildID,
			UserID:  claims.Subject,
		})
		canEdit = err == nil
	}

	// Load tabs and panels
	tabs, err := api.Opts.DB.ListGuildPageTabs(ctx, page.ID)
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}

	sdkTabs := make([]chroniclesdk.GuildPageTab, 0, len(tabs))
	for _, t := range tabs {
		panels, err := api.Opts.DB.ListGuildPagePanels(ctx, t.ID)
		if err != nil {
			httpapi.InternalServerError(w, err)
			return
		}

		sdkPanels := make([]chroniclesdk.GuildPagePanel, 0, len(panels))
		for _, p := range panels {
			var config map[string]any
			if err := json.Unmarshal(p.Config, &config); err != nil {
				config = make(map[string]any)
			}
			var position chroniclesdk.GuildPanelPosition
			if err := json.Unmarshal(p.Position, &position); err != nil {
				position = chroniclesdk.GuildPanelPosition{X: 0, Y: 0, W: 6, H: 2}
			}
			sdkPanels = append(sdkPanels, chroniclesdk.GuildPagePanel{
				ID:        p.ID,
				PanelType: p.PanelType,
				Config:    config,
				Position:  position,
			})
		}

		sdkTabs = append(sdkTabs, chroniclesdk.GuildPageTab{
			ID:        t.ID,
			Label:     t.Label,
			Slug:      t.Slug,
			SortOrder: int(t.SortOrder),
			Panels:    sdkPanels,
		})
	}

	var theme chroniclesdk.GuildPageTheme
	if err := json.Unmarshal(page.Theme, &theme); err != nil {
		theme = chroniclesdk.GuildPageTheme{}
	}

	httpapi.Write(ctx, w, http.StatusOK, chroniclesdk.GuildPageConfig{
		ID:      page.ID,
		GuildID: page.GuildID,
		Guild: chroniclesdk.GuildInfo{
			ID:        page.GuildID,
			Name:      page.GuildName,
			RealmID:   page.RealmID,
			RealmName: page.RealmName,
			HasPage:   true,
			CanEdit:   canEdit,
		},
		Theme: theme,
		Tabs:  sdkTabs,
	})
}

// GetPublicGuildPage returns the public view of a guild page
func (api *API) GetPublicGuildPage(w http.ResponseWriter, r *http.Request) {
	// Same as GetGuildPage but for the /g/{guildID} route
	api.GetGuildPage(w, r)
}

// UpsertGuildPage creates or updates a guild page
func (api *API) UpsertGuildPage(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	guildID, err := uuid.Parse(chi.URLParam(r, "guildID"))
	if err != nil {
		httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{
			Message: "Invalid guild ID",
		})
		return
	}

	// Check if user is a member
	claims := chronauth.MustAuthenticatedClaims(ctx)
	_, err = api.Opts.DB.GetGuildMember(ctx, database.GetGuildMemberParams{
		GuildID: guildID,
		UserID:  claims.Subject,
	})
	if err != nil {
		httpapi.Write(ctx, w, http.StatusForbidden, chroniclesdk.Response{
			Message: "You are not authorized to edit this guild page",
		})
		return
	}

	var req chroniclesdk.UpdateGuildPageRequest
	if !httpapi.Read(ctx, w, r, &req) {
		return
	}

	themeJSON, err := json.Marshal(req.Theme)
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}

	page, err := api.Opts.DB.UpsertGuildPage(ctx, database.UpsertGuildPageParams{
		GuildID: guildID,
		Theme:   themeJSON,
	})
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}

	httpapi.Write(ctx, w, http.StatusOK, chroniclesdk.Response{
		Message: "Guild page updated",
		Detail:  page.ID.String(),
	})
}

// CreateGuildPageTab creates a new tab for a guild page
func (api *API) CreateGuildPageTab(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	guildID, err := uuid.Parse(chi.URLParam(r, "guildID"))
	if err != nil {
		httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{
			Message: "Invalid guild ID",
		})
		return
	}

	// Check authorization
	claims := chronauth.MustAuthenticatedClaims(ctx)
	_, err = api.Opts.DB.GetGuildMember(ctx, database.GetGuildMemberParams{
		GuildID: guildID,
		UserID:  claims.Subject,
	})
	if err != nil {
		httpapi.Write(ctx, w, http.StatusForbidden, chroniclesdk.Response{
			Message: "You are not authorized to edit this guild page",
		})
		return
	}

	// Get the page
	page, err := api.Opts.DB.GetGuildPage(ctx, guildID)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			httpapi.Write(ctx, w, http.StatusNotFound, chroniclesdk.Response{
				Message: "Guild page not found. Create the page first.",
			})
			return
		}
		httpapi.InternalServerError(w, err)
		return
	}

	var req chroniclesdk.CreateTabRequest
	if !httpapi.Read(ctx, w, r, &req) {
		return
	}

	// Get current max sort order
	tabs, err := api.Opts.DB.ListGuildPageTabs(ctx, page.ID)
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}
	sortOrder := len(tabs)

	tab, err := api.Opts.DB.InsertGuildPageTab(ctx, database.InsertGuildPageTabParams{
		PageID:    page.ID,
		Label:     req.Label,
		Slug:      req.Slug,
		SortOrder: int32(sortOrder),
	})
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}

	httpapi.Write(ctx, w, http.StatusCreated, chroniclesdk.GuildPageTab{
		ID:        tab.ID,
		Label:     tab.Label,
		Slug:      tab.Slug,
		SortOrder: int(tab.SortOrder),
		Panels:    []chroniclesdk.GuildPagePanel{},
	})
}

// UpdateGuildPageTab updates a tab and its panels
func (api *API) UpdateGuildPageTab(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	guildID, err := uuid.Parse(chi.URLParam(r, "guildID"))
	if err != nil {
		httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{
			Message: "Invalid guild ID",
		})
		return
	}
	tabID, err := uuid.Parse(chi.URLParam(r, "tabID"))
	if err != nil {
		httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{
			Message: "Invalid tab ID",
		})
		return
	}

	// Check authorization
	claims := chronauth.MustAuthenticatedClaims(ctx)
	_, err = api.Opts.DB.GetGuildMember(ctx, database.GetGuildMemberParams{
		GuildID: guildID,
		UserID:  claims.Subject,
	})
	if err != nil {
		httpapi.Write(ctx, w, http.StatusForbidden, chroniclesdk.Response{
			Message: "You are not authorized to edit this guild page",
		})
		return
	}

	// Get the existing tab
	tab, err := api.Opts.DB.GetGuildPageTab(ctx, tabID)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			httpapi.Write(ctx, w, http.StatusNotFound, chroniclesdk.Response{
				Message: "Tab not found",
			})
			return
		}
		httpapi.InternalServerError(w, err)
		return
	}

	var req chroniclesdk.UpdateTabRequest
	if !httpapi.Read(ctx, w, r, &req) {
		return
	}

	// Update the tab
	updatedTab, err := api.Opts.DB.UpdateGuildPageTab(ctx, database.UpdateGuildPageTabParams{
		ID:        tabID,
		Label:     req.Label,
		Slug:      tab.Slug, // Keep original slug
		SortOrder: tab.SortOrder,
	})
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}

	// Delete existing panels and recreate
	if err := api.Opts.DB.DeleteGuildPagePanelsByTab(ctx, tabID); err != nil {
		httpapi.InternalServerError(w, err)
		return
	}

	sdkPanels := make([]chroniclesdk.GuildPagePanel, 0, len(req.Panels))
	for _, p := range req.Panels {
		configJSON, err := json.Marshal(p.Config)
		if err != nil {
			configJSON = []byte("{}")
		}
		positionJSON, err := json.Marshal(p.Position)
		if err != nil {
			positionJSON = []byte(`{"x":0,"y":0,"w":6,"h":2}`)
		}

		panel, err := api.Opts.DB.InsertGuildPagePanel(ctx, database.InsertGuildPagePanelParams{
			TabID:     tabID,
			PanelType: p.PanelType,
			Config:    configJSON,
			Position:  positionJSON,
		})
		if err != nil {
			httpapi.InternalServerError(w, err)
			return
		}

		sdkPanels = append(sdkPanels, chroniclesdk.GuildPagePanel{
			ID:        panel.ID,
			PanelType: panel.PanelType,
			Config:    p.Config,
			Position:  p.Position,
		})
	}

	httpapi.Write(ctx, w, http.StatusOK, chroniclesdk.GuildPageTab{
		ID:        updatedTab.ID,
		Label:     updatedTab.Label,
		Slug:      updatedTab.Slug,
		SortOrder: int(updatedTab.SortOrder),
		Panels:    sdkPanels,
	})
}

// DeleteGuildPageTab deletes a tab
func (api *API) DeleteGuildPageTab(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	guildID, err := uuid.Parse(chi.URLParam(r, "guildID"))
	if err != nil {
		httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{
			Message: "Invalid guild ID",
		})
		return
	}
	tabID, err := uuid.Parse(chi.URLParam(r, "tabID"))
	if err != nil {
		httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{
			Message: "Invalid tab ID",
		})
		return
	}

	// Check authorization
	claims := chronauth.MustAuthenticatedClaims(ctx)
	_, err = api.Opts.DB.GetGuildMember(ctx, database.GetGuildMemberParams{
		GuildID: guildID,
		UserID:  claims.Subject,
	})
	if err != nil {
		httpapi.Write(ctx, w, http.StatusForbidden, chroniclesdk.Response{
			Message: "You are not authorized to edit this guild page",
		})
		return
	}

	if err := api.Opts.DB.DeleteGuildPageTab(ctx, tabID); err != nil {
		httpapi.InternalServerError(w, err)
		return
	}

	httpapi.Write(ctx, w, http.StatusOK, chroniclesdk.Response{
		Message: "Tab deleted",
	})
}

// ReorderGuildPageTabs reorders tabs
func (api *API) ReorderGuildPageTabs(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	guildID, err := uuid.Parse(chi.URLParam(r, "guildID"))
	if err != nil {
		httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{
			Message: "Invalid guild ID",
		})
		return
	}

	// Check authorization
	claims := chronauth.MustAuthenticatedClaims(ctx)
	_, err = api.Opts.DB.GetGuildMember(ctx, database.GetGuildMemberParams{
		GuildID: guildID,
		UserID:  claims.Subject,
	})
	if err != nil {
		httpapi.Write(ctx, w, http.StatusForbidden, chroniclesdk.Response{
			Message: "You are not authorized to edit this guild page",
		})
		return
	}

	var req chroniclesdk.ReorderTabsRequest
	if !httpapi.Read(ctx, w, r, &req) {
		return
	}

	// Update each tab's sort order
	for i, tabID := range req.TabIDs {
		tab, err := api.Opts.DB.GetGuildPageTab(ctx, tabID)
		if err != nil {
			continue
		}
		_, err = api.Opts.DB.UpdateGuildPageTab(ctx, database.UpdateGuildPageTabParams{
			ID:        tabID,
			Label:     tab.Label,
			Slug:      tab.Slug,
			SortOrder: int32(i),
		})
		if err != nil {
			httpapi.InternalServerError(w, err)
			return
		}
	}

	httpapi.Write(ctx, w, http.StatusOK, chroniclesdk.Response{
		Message: "Tabs reordered",
	})
}

// AdminAddGuildMember adds a member to a guild (admin only)
func (api *API) AdminAddGuildMember(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	guildID, err := uuid.Parse(chi.URLParam(r, "guildID"))
	if err != nil {
		httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{
			Message: "Invalid guild ID",
		})
		return
	}

	var req chroniclesdk.AddGuildMemberRequest
	if !httpapi.Read(ctx, w, r, &req) {
		return
	}

	member, err := api.Opts.DB.InsertGuildMember(ctx, database.InsertGuildMemberParams{
		GuildID: guildID,
		UserID:  req.UserID,
	})
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}

	httpapi.Write(ctx, w, http.StatusCreated, chroniclesdk.GuildMember{
		ID:       member.ID,
		UserID:   member.UserID,
		JoinedAt: member.JoinedAt.Time,
	})
}

// AdminRemoveGuildMember removes a member from a guild (admin only)
func (api *API) AdminRemoveGuildMember(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	guildID, err := uuid.Parse(chi.URLParam(r, "guildID"))
	if err != nil {
		httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{
			Message: "Invalid guild ID",
		})
		return
	}
	userID, err := uuid.Parse(chi.URLParam(r, "userID"))
	if err != nil {
		httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{
			Message: "Invalid user ID",
		})
		return
	}

	if err := api.Opts.DB.DeleteGuildMember(ctx, database.DeleteGuildMemberParams{
		GuildID: guildID,
		UserID:  userID,
	}); err != nil {
		httpapi.InternalServerError(w, err)
		return
	}

	httpapi.Write(ctx, w, http.StatusOK, chroniclesdk.Response{
		Message: "Member removed",
	})
}
