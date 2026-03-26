package api

import (
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"

	"github.com/Emyrk/chronicle/api/chronauth"
	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/api/httpapi"
	"github.com/Emyrk/chronicle/api/httpmw"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/authz"
	"github.com/Emyrk/chronicle/database/authz/policy"
	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
)

// validateTheme validates all theme fields server-side.
func validateTheme(theme chroniclesdk.GuildPageTheme) error {
	// Description length
	if len(theme.Description) > chroniclesdk.MaxDescriptionLength {
		return fmt.Errorf("description exceeds %d characters", chroniclesdk.MaxDescriptionLength)
	}

	// Tags — must be valid enum values, max count
	if len(theme.Tags) > chroniclesdk.MaxTags {
		return fmt.Errorf("maximum %d tags allowed", chroniclesdk.MaxTags)
	}
	for _, t := range theme.Tags {
		if !t.IsValid() {
			return fmt.Errorf("invalid tag: %q", t)
		}
	}

	// Socials — keys must be valid enum values, values must have valid URL prefixes
	for platform, url := range theme.Socials {
		if !platform.IsValid() {
			return fmt.Errorf("unknown social platform: %q", platform)
		}
		if url == "" {
			continue // empty = removed
		}
		prefixes, ok := chroniclesdk.SocialURLPrefixes[platform]
		if !ok {
			continue
		}
		valid := false
		for _, prefix := range prefixes {
			if strings.HasPrefix(url, prefix) {
				valid = true
				break
			}
		}
		if !valid {
			return fmt.Errorf("invalid URL for %s: must start with one of %v", platform, prefixes)
		}
	}

	// Logo URL must be HTTPS if set
	if theme.LogoURL != "" && !strings.HasPrefix(theme.LogoURL, "https://") {
		return fmt.Errorf("logo URL must use HTTPS")
	}

	return nil
}

// GuildPageOptions returns the allowed tags and social platforms for guild pages.
func (api *API) GuildPageOptions(w http.ResponseWriter, r *http.Request) {
	httpapi.Write(r.Context(), w, http.StatusOK, chroniclesdk.GuildPageOptionsResponse{
		AllowedTags:     chroniclesdk.GuildTagValues(),
		SocialPlatforms: chroniclesdk.SocialPlatformValues(),
	})
}

// defaultGuildPageConfig returns a starter page config when no page exists in the DB yet.
func defaultGuildPageConfig(guild chroniclesdk.GuildInfo) chroniclesdk.GuildPageConfig {
	return chroniclesdk.GuildPageConfig{
		GuildID: guild.ID,
		Guild:   guild,
		Theme:   chroniclesdk.GuildPageTheme{},
		Tabs: []chroniclesdk.GuildPageTab{
			{
				ID:        uuid.Nil,
				Label:     "Overview",
				Slug:      "overview",
				SortOrder: 0,
				Panels: []chroniclesdk.GuildPagePanel{
					{
						ID:        uuid.Nil,
						PanelType: "calendar",
						Config: map[string]any{
							"_style": map[string]any{
								"background":      "transparent",
								"backgroundColor": "rgba(0, 0, 0, 0.5)",
								"panelName":       "",
								"showHeader":      false,
							},
							"category": "raid",
							"hasVideo": "all",
						},
						Position:   chroniclesdk.GuildPanelPosition{X: 0, Y: 0, W: 12, H: 6},
						Visibility: "",
					},
				},
			},
		},
	}
}

// ListGuilds returns a list of guilds with their page status
func (api *API) ListGuilds(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	search := r.URL.Query().Get("search")
	limit := 50
	offset := 0

	guilds, err := api.Opts.Zed.ListGuildsWithPages(ctx, database.ListGuildsWithPagesParams{
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
			canEdit, _ = api.Zed.IsGuildMember(ctx, g.ID, userID)
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
	guild := httpmw.Guild(ctx)
	guildID, err := uuid.Parse(chi.URLParam(r, "guildID"))
	if err != nil {
		httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{
			Message: "Invalid guild ID",
		})
		return
	}

	// Check if page exists
	_, pageErr := api.Opts.Zed.GetGuildPage(ctx, guildID)
	hasPage := pageErr == nil

	// Check if user can edit
	canEdit := false
	if claims, ok := chronauth.AuthenticatedClaims(ctx); ok {
		canEdit, _ = api.Zed.IsGuildMember(ctx, guildID, claims.Subject)
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
	guild := httpmw.Guild(ctx)

	canEdit := false
	canViewRoster := false
	// Check if user can edit
	// TODO: This should be an auth check call
	actor, ok := authz.ActorFromContext(ctx)
	if ok {
		zg := policy.New().Guild(guild.ID)
		results, err := api.Zed.Check(ctx, nil, zg.CanAdmin_guild_User(actor), zg.CanView_chronicle_roster_User(actor))
		if err == nil && len(results) == 2 {
			canEdit = results[0]
			canViewRoster = results[1]
		}
	}

	guildInfo := chroniclesdk.GuildInfo{
		ID:            guild.ID,
		Name:          guild.Name,
		RealmID:       guild.RealmID,
		RealmName:     guild.RealmName,
		HasPage:       true,
		CanEdit:       canEdit,
		CanViewRoster: canViewRoster,
	}

	page, err := api.Opts.Zed.GetFullGuildPage(ctx, guild.ID)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			// Return a default page when none exists yet
			httpapi.Write(ctx, w, http.StatusOK, defaultGuildPageConfig(guildInfo))
			return
		}
		httpapi.InternalServerError(w, err)
		return
	}

	// Load tabs and panels
	tabs, err := api.Opts.Zed.ListGuildPageTabs(ctx, page.ID)
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}

	sdkTabs := make([]chroniclesdk.GuildPageTab, 0, len(tabs))
	for _, t := range tabs {
		panels, err := api.Opts.Zed.ListGuildPagePanels(ctx, t.ID)
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
		Guild:   guildInfo,
		Theme:   theme,
		Tabs:    sdkTabs,
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
	guild := httpmw.Guild(ctx)

	var req chroniclesdk.UpdateGuildPageRequest
	if !httpapi.Read(ctx, w, r, &req) {
		return
	}

	if err := validateTheme(req.Theme); err != nil {
		httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{
			Message: "Invalid theme configuration",
			Detail:  err.Error(),
		})
		return
	}

	themeJSON, err := json.Marshal(req.Theme)
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}

	page, err := api.Opts.Zed.UpsertGuildPage(ctx, database.UpsertGuildPageParams{
		GuildID: guild.ID,
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
	guild := httpmw.Guild(ctx)

	// Get the page
	page, err := api.Opts.Zed.GetGuildPage(ctx, guild.ID)
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
	tabs, err := api.Opts.Zed.ListGuildPageTabs(ctx, page.ID)
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}
	sortOrder := len(tabs)

	tab, err := api.Opts.Zed.InsertGuildPageTab(ctx, database.InsertGuildPageTabParams{
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
	tabID, err := uuid.Parse(chi.URLParam(r, "tabID"))
	if err != nil {
		httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{
			Message: "Invalid tab ID",
		})
		return
	}

	// Get the existing tab
	tab, err := api.Opts.Zed.GetGuildPageTab(ctx, tabID)
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
	updatedTab, err := api.Opts.Zed.UpdateGuildPageTab(ctx, database.UpdateGuildPageTabParams{
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
	if err := api.Opts.Zed.DeleteGuildPagePanelsByTab(ctx, tabID); err != nil {
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

		panel, err := api.Opts.Zed.InsertGuildPagePanel(ctx, database.InsertGuildPagePanelParams{
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
	tabID, err := uuid.Parse(chi.URLParam(r, "tabID"))
	if err != nil {
		httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{
			Message: "Invalid tab ID",
		})
		return
	}

	if err := api.Opts.Zed.DeleteGuildPageTab(ctx, tabID); err != nil {
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

	var req chroniclesdk.ReorderTabsRequest
	if !httpapi.Read(ctx, w, r, &req) {
		return
	}

	// Update each tab's sort order
	for i, tabID := range req.TabIDs {
		tab, err := api.Opts.Zed.GetGuildPageTab(ctx, tabID)
		if err != nil {
			continue
		}
		_, err = api.Opts.Zed.UpdateGuildPageTab(ctx, database.UpdateGuildPageTabParams{
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
	guild := httpmw.Guild(ctx)

	var req chroniclesdk.AddGuildMemberRequest
	if !httpapi.Read(ctx, w, r, &req) {
		return
	}

	if err := api.Zed.AddGuildMember(ctx, guild.ID, req.UserID); err != nil {
		httpapi.InternalServerError(w, err)
		return
	}

	httpapi.Write(ctx, w, http.StatusCreated, chroniclesdk.Response{
		Message: "Member added",
	})
}

// AdminRemoveGuildMember removes a member from a guild (admin only)
func (api *API) AdminRemoveGuildMember(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	guild := httpmw.Guild(ctx)
	userID, err := uuid.Parse(chi.URLParam(r, "userID"))
	if err != nil {
		httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{
			Message: "Invalid user ID",
		})
		return
	}

	// TODO: Cannot remove members that are also admins - need to check if the user is an admin before allowing removal
	if err := api.Zed.RemoveGuildMember(ctx, guild.ID, userID); err != nil {
		httpapi.InternalServerError(w, err)
		return
	}

	httpapi.Write(ctx, w, http.StatusOK, chroniclesdk.Response{
		Message: "Member removed",
	})
}
// GuildRoster returns the list of Chronicle users with SpiceDB roles on this guild.
func (api *API) GuildRoster(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	guild := httpmw.Guild(ctx)

	rosterMembers, err := api.Zed.GuildRosterMembers(ctx, guild.ID)
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}

	if len(rosterMembers) == 0 {
		httpapi.Write(ctx, w, http.StatusOK, []chroniclesdk.GuildRosterMember{})
		return
	}

	// Batch-fetch usernames from DB
	userIDs := make([]uuid.UUID, len(rosterMembers))
	for i, m := range rosterMembers {
		userIDs[i] = m.UserID
	}
	users, err := api.Opts.Zed.GetUsersByIDs(ctx, userIDs)
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}
	userMap := make(map[uuid.UUID]database.ChronicleUser, len(users))
	for _, u := range users {
		userMap[u.ID] = u
	}

	result := make([]chroniclesdk.GuildRosterMember, 0, len(rosterMembers))
	for _, m := range rosterMembers {
		u, ok := userMap[m.UserID]
		if !ok {
			continue // user deleted from DB but relation remains
		}
		result = append(result, chroniclesdk.GuildRosterMember{
			UserID:   m.UserID,
			Username: u.Username,
			Roles:    m.Roles,
		})
	}
	httpapi.Write(ctx, w, http.StatusOK, result)
}

