package api

import (
	"encoding/json"
	"net/http"
	"strconv"

	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/api/db2sdk"
	"github.com/Emyrk/chronicle/api/httpapi"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/authz"
	"github.com/Emyrk/chronicle/database/authz/policy"
	"github.com/Emyrk/chronicle/internal/services/servicetenant"
	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
)

const defaultMinParserVersion = "v0.0.437"

// AdminListUsers returns all users in the system.
// @Summary List all users
// @Tags Admin
// @Success 200 {object} chroniclesdk.AdminUsersResponse
// @Router /api/v1/admin/users [get]
func (a *API) AdminListUsers(w http.ResponseWriter, r *http.Request) {
	users, err := a.Opts.Zed.ListAllUsers(r.Context())
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}

	resp := chroniclesdk.AdminUsersResponse{
		Users: make([]chroniclesdk.User, len(users)),
	}
	for i, u := range users {
		roles, err := a.Opts.Zed.UserChronicleRoles(r.Context(), u.ID)
		if err != nil {
			httpapi.InternalServerError(w, err)
			return
		}

		resp.Users[i] = db2sdk.User(u, roles)
	}

	httpapi.Write(r.Context(), w, http.StatusOK, resp)
}

// UpsertUserGrant creates or updates a storage grant for a user.
// @Summary Upsert user storage grant
// @Tags Admin
// @Param userID path string true "User ID"
// @Param request body chroniclesdk.UpsertDataGrantRequest true "Grant details"
// @Success 200 {object} chroniclesdk.DataGrant
// @Router /api/v1/admin/users/{userID}/grants [put]
func (a *API) UpsertUserGrant(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	userIDStr := chi.URLParam(r, "userID")

	userID, err := uuid.Parse(userIDStr)
	if err != nil {
		httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{
			Message: "Invalid user ID",
			Detail:  err.Error(),
		})
		return
	}

	actor, _ := authz.ActorFromContext(ctx)
	b := policy.New()

	ok, err := a.Zed.CheckOne(ctx, nil, b.GlobalChronicle().CanSet_user_data_limit_User(actor))
	if err != nil || !ok {
		httpapi.Forbidden(w, err)
		return
	}

	var req chroniclesdk.UpsertDataGrantRequest
	if !httpapi.Read(ctx, w, r, &req) {
		return
	}

	if req.Source == "" {
		httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{
			Message: "Source is required",
		})
		return
	}

	var expiresAt pgtype.Timestamptz
	if req.ExpiresAt != nil {
		expiresAt = pgtype.Timestamptz{Time: *req.ExpiresAt, Valid: true}
	}

	grant, err := a.Opts.Zed.UpsertDataGrant(ctx, database.UpsertDataGrantParams{
		UserID:       userID,
		Source:       req.Source,
		StorageBytes: req.StorageBytes,
		Description:  pgtype.Text{String: req.Description, Valid: req.Description != ""},
		ExpiresAt:    expiresAt,
	})
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}

	httpapi.Write(ctx, w, http.StatusOK, db2sdk.DataGrant(grant))
}

// DeleteUserGrant removes a storage grant from a user.
// @Summary Delete user storage grant
// @Tags Admin
// @Param userID path string true "User ID"
// @Param source path string true "Grant source"
// @Success 204
// @Router /api/v1/admin/users/{userID}/grants/{source} [delete]
func (a *API) DeleteUserGrant(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	userIDStr := chi.URLParam(r, "userID")
	source := chi.URLParam(r, "source")

	userID, err := uuid.Parse(userIDStr)
	if err != nil {
		httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{
			Message: "Invalid user ID",
			Detail:  err.Error(),
		})
		return
	}

	actor, _ := authz.ActorFromContext(ctx)
	b := policy.New()

	ok, err := a.Zed.CheckOne(ctx, nil, b.GlobalChronicle().CanSet_user_data_limit_User(actor))
	if err != nil || !ok {
		httpapi.Forbidden(w, err)
		return
	}

	err = a.Opts.Zed.DeleteDataGrant(ctx, database.DeleteDataGrantParams{
		UserID: userID,
		Source: source,
	})
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

// GetUserGrants returns all active grants for a user.
// @Summary Get user storage grants
// @Tags Admin
// @Param userID path string true "User ID"
// @Success 200 {array} chroniclesdk.DataGrant
// @Router /api/v1/admin/users/{userID}/grants [get]
func (a *API) GetUserGrants(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	userIDStr := chi.URLParam(r, "userID")

	userID, err := uuid.Parse(userIDStr)
	if err != nil {
		httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{
			Message: "Invalid user ID",
			Detail:  err.Error(),
		})
		return
	}

	grants, err := a.Opts.Zed.GetUserDataGrants(ctx, userID)
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}

	httpapi.Write(ctx, w, http.StatusOK, db2sdk.DataGrants(grants))
}

// AdminResyncUserRoles re-syncs a user's primary roles from Discord.
// @Summary Resync user roles from Discord
// @Tags Admin
// @Param userID path string true "User ID"
// @Success 200 {object} chroniclesdk.User
// @Router /api/v1/admin/users/{userID}/resync [post]
func (a *API) AdminResyncUserRoles(w http.ResponseWriter, r *http.Request) {
	userIDStr := chi.URLParam(r, "userID")
	userID, err := uuid.Parse(userIDStr)
	if err != nil {
		httpapi.Write(r.Context(), w, http.StatusBadRequest, map[string]string{
			"message": "Invalid user ID",
		})
		return
	}

	// Get the user's Discord link
	link, err := a.Opts.Zed.GetUserAuthLinkByUserID(r.Context(), userID)
	if err != nil {
		httpapi.Write(r.Context(), w, http.StatusNotFound, map[string]string{
			"message": "User has no linked Discord account",
		})
		return
	}

	if link.Provider != "discord" {
		httpapi.Write(r.Context(), w, http.StatusBadRequest, map[string]string{
			"message": "User is not linked via Discord",
		})
		return
	}

	// Resync via bot
	if a.Opts.Bot == nil {
		httpapi.Write(r.Context(), w, http.StatusServiceUnavailable, map[string]string{
			"message": "Discord bot not configured",
		})
		return
	}

	err = a.Opts.Bot.SyncDiscordUser(r.Context(), a.Opts.Zed, link.LinkedID, userID)
	if err != nil {
		httpapi.Write(r.Context(), w, http.StatusInternalServerError, map[string]string{
			"message": "Failed to sync user roles: " + err.Error(),
		})
		return
	}

	// Fetch updated user
	user, err := a.Opts.Zed.GetUserByID(r.Context(), userID)
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}

	roles, err := a.Opts.Zed.UserChronicleRoles(r.Context(), userID)
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}

	httpapi.Write(r.Context(), w, http.StatusOK, db2sdk.User(user, roles))
}

// AdminSetUserRoles sets a user's Chronicle roles directly.
// @Summary Set user roles
// @Tags Admin
// @Param userID path string true "User ID"
// @Param request body chroniclesdk.SetUserRolesRequest true "Role list"
// @Success 200 {object} chroniclesdk.User
// @Router /api/v1/admin/users/{userID}/roles [put]
func (a *API) AdminSetUserRoles(w http.ResponseWriter, r *http.Request) {
	userIDStr := chi.URLParam(r, "userID")
	userID, err := uuid.Parse(userIDStr)
	if err != nil {
		httpapi.Write(r.Context(), w, http.StatusBadRequest, map[string]string{
			"message": "Invalid user ID",
		})
		return
	}

	var req chroniclesdk.SetUserRolesRequest
	if !httpapi.Read(r.Context(), w, r, &req) {
		return
	}

	if err := a.Opts.Zed.SetUserChronicleRoles(r.Context(), userID, req.Roles); err != nil {
		httpapi.Write(r.Context(), w, http.StatusBadRequest, map[string]string{
			"message": err.Error(),
		})
		return
	}

	// Return updated user
	user, err := a.Opts.Zed.GetUserByID(r.Context(), userID)
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}

	roles, err := a.Opts.Zed.UserChronicleRoles(r.Context(), userID)
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}

	httpapi.Write(r.Context(), w, http.StatusOK, db2sdk.User(user, roles))
}

// AdminSetUserRetention sets a user's raw log retention policy.
// @Summary Set user raw log retention
// @Tags Admin
// @Param userID path string true "User ID"
// @Param request body chroniclesdk.AdminSetUserRetentionRequest true "Retention settings"
// @Success 200 {object} chroniclesdk.User
// @Router /api/v1/admin/users/{userID}/retention [put]
func (a *API) AdminSetUserRetention(w http.ResponseWriter, r *http.Request) {
	userID, err := uuid.Parse(chi.URLParam(r, "userID"))
	if err != nil {
		httpapi.Write(r.Context(), w, http.StatusBadRequest, map[string]string{
			"message": "invalid user ID",
		})
		return
	}

	var req chroniclesdk.AdminSetUserRetentionRequest
	if !httpapi.Read(r.Context(), w, r, &req) {
		return
	}

	var retentionHours pgtype.Int4
	if req.RawLogRetentionHours > 0 {
		retentionHours = pgtype.Int4{Int32: req.RawLogRetentionHours, Valid: true}
	}
	// 0 means "keep forever" → NULL in DB

	_, err = a.Opts.Zed.UpdateUserRawLogRetentionHours(r.Context(), database.UpdateUserRawLogRetentionHoursParams{
		ID:                   userID,
		RawLogRetentionHours: retentionHours,
	})
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}

	user, err := a.Opts.Zed.GetUserByID(r.Context(), userID)
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}

	roles, err := a.Opts.Zed.UserChronicleRoles(r.Context(), userID)
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}

	httpapi.Write(r.Context(), w, http.StatusOK, db2sdk.User(user, roles))
}

const (
	defaultAdminLogsLimit = 50
	maxAdminLogsLimit     = 100
)

// AdminListLogs returns all logs in the system with pagination, sorting, and filtering.
// @Summary List all logs
// @Tags Admin
// @Param limit query int false "Number of results per page (default 50, max 100)"
// @Param offset query int false "Offset for pagination"
// @Param sort_by query string false "Sort field: date, user, size, instance (default: date)"
// @Param sort_order query string false "Sort order: asc, desc (default: desc)"
// @Param user_id query string false "Filter by user ID (UUID)"
// @Param instance_name query string false "Filter by instance name"
// @Success 200 {object} chroniclesdk.AdminLogsResponse
// @Router /api/v1/admin/logs [get]
func (a *API) AdminListLogs(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	// Parse limit
	limit := defaultAdminLogsLimit
	if l := r.URL.Query().Get("limit"); l != "" {
		if parsed, err := strconv.Atoi(l); err == nil && parsed > 0 {
			limit = parsed
		}
	}
	if limit > maxAdminLogsLimit {
		limit = maxAdminLogsLimit
	}

	// Parse offset
	offset := 0
	if o := r.URL.Query().Get("offset"); o != "" {
		if parsed, err := strconv.Atoi(o); err == nil && parsed >= 0 {
			offset = parsed
		}
	}

	// Parse sort_by with allowlist validation
	sortBy := r.URL.Query().Get("sort_by")
	if sortBy == "" {
		sortBy = "date"
	}
	if sortBy != "date" && sortBy != "user" && sortBy != "size" && sortBy != "instance" {
		sortBy = "date"
	}

	// Parse sort_order with allowlist validation
	sortOrder := r.URL.Query().Get("sort_order")
	if sortOrder == "" {
		sortOrder = "desc"
	}
	if sortOrder != "asc" && sortOrder != "desc" {
		sortOrder = "desc"
	}

	// Parse filter parameters
	filterUserID := uuid.Nil
	if userIDStr := r.URL.Query().Get("user_id"); userIDStr != "" {
		if parsed, err := uuid.Parse(userIDStr); err == nil {
			filterUserID = parsed
		}
	}
	filterInstanceName := r.URL.Query().Get("instance_name")

	// Fetch total count for pagination (with filters applied)
	totalCount, err := a.Opts.Zed.CountAllWoWLogGroups(ctx, database.CountAllWoWLogGroupsParams{
		FilterUserID:       filterUserID,
		FilterInstanceName: filterInstanceName,
	})
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}

	// Fetch logs with +1 to detect hasMore
	logs, err := a.Opts.Zed.ListAllWoWLogGroupsWithOwnerPaginated(ctx, database.ListAllWoWLogGroupsWithOwnerPaginatedParams{
		FilterUserID:       filterUserID,
		FilterInstanceName: filterInstanceName,
		SortBy:             sortBy,
		SortOrder:          sortOrder,
		LimitCount:         int32(limit + 1),
		OffsetCount:        int32(offset),
	})
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}

	// Determine hasMore
	hasMore := len(logs) > limit
	if hasMore {
		logs = logs[:limit]
	}

	resp := chroniclesdk.AdminLogsResponse{
		Logs:       make([]chroniclesdk.AdminLog, len(logs)),
		HasMore:    hasMore,
		TotalCount: int(totalCount),
	}

	for i, l := range logs {
		state := "unknown"
		if l.ProcessingOutput != nil {
			state = "processed"
		}

		ownerName := ""
		if l.OwnerName.Valid {
			ownerName = l.OwnerName.String
		}

		// Extract total size from interface{}
		var sizeBytes int64
		if l.TotalSizeBytes != nil {
			switch v := l.TotalSizeBytes.(type) {
			case int64:
				sizeBytes = v
			case float64:
				sizeBytes = int64(v)
			}
		}

		// Extract instance names from interface{}
		var instanceNames []string
		if l.InstanceNames != nil {
			if names, ok := l.InstanceNames.([]interface{}); ok {
				for _, n := range names {
					if s, ok := n.(string); ok {
						instanceNames = append(instanceNames, s)
					}
				}
			}
		}
		if instanceNames == nil {
			instanceNames = []string{}
		}

		resp.Logs[i] = chroniclesdk.AdminLog{
			ID:            l.WoWLogGroup.ID,
			OwnerID:       l.WoWLogGroup.Owner,
			OwnerName:     ownerName,
			Description:   "",
			CreatedAt:     l.WoWLogGroup.CreatedAt.Time.Format("2006-01-02T15:04:05Z"),
			State:         state,
			SizeBytes:     sizeBytes,
			InstanceNames: instanceNames,
		}
	}

	httpapi.Write(ctx, w, http.StatusOK, resp)
}

// AdminListInstanceNames returns all distinct instance names for filtering.
// @Summary List all instance names
// @Tags Admin
// @Success 200 {array} string
// @Router /api/v1/admin/instance-names [get]
func (a *API) AdminListInstanceNames(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	names, err := a.Opts.Zed.ListDistinctInstanceNames(ctx)
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}

	// Ensure we return an empty array, not null
	if names == nil {
		names = []string{}
	}

	httpapi.Write(ctx, w, http.StatusOK, names)
}

// AdminListOutdatedInstances returns instances not on the current parser version.
func (a *API) AdminListOutdatedInstances(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	minParserVersion := r.URL.Query().Get("parser_version")
	if minParserVersion == "" {
		minParserVersion = defaultMinParserVersion
	}

	nameFilter := r.URL.Query().Get("instance_name")
	var instanceName pgtype.Text
	if nameFilter != "" {
		instanceName = pgtype.Text{String: nameFilter, Valid: true}
	}

	rows, err := a.Opts.Zed.AdminListOutdatedParserVersionInstances(ctx, database.AdminListOutdatedParserVersionInstancesParams{
		MinParserVersion: minParserVersion,
		InstanceName:     instanceName,
	})
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}

	instances := make([]chroniclesdk.AdminOutdatedInstance, len(rows))
	for i, row := range rows {
		inst := chroniclesdk.AdminOutdatedInstance{
			ID:            row.ID,
			LogGroupID:    row.LogGroupID,
			Name:          row.Name,
			Slug:          row.HashedSlug.String,
			ParserVersion: row.ParserVersion,
			RealmName:     row.RealmName,
			UploaderName:  row.UploaderName,
			UploadedAt:    row.UploadedAt.Time,
		}
		if row.StartTime.Valid && row.EndTime.Valid {
			elapsed := row.EndTime.Time.Sub(row.StartTime.Time).Seconds()
			inst.ElapsedSeconds = &elapsed
		}
		instances[i] = inst
	}

	httpapi.Write(ctx, w, http.StatusOK, chroniclesdk.AdminOutdatedInstancesResponse{
		Instances:  instances,
		MinVersion: minParserVersion,
	})
}

func (a *API) AdminBulkDeleteLogs(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	var req chroniclesdk.AdminBulkLogRequest
	if !httpapi.Read(ctx, w, r, &req) {
		return
	}

	resp := chroniclesdk.AdminBulkDeleteResponse{
		Requested: len(req.LogIDs),
		Failed:    make([]chroniclesdk.AdminBulkLogFailure, 0),
	}

	for _, logID := range req.LogIDs {
		if err := a.Chronicle.DeleteWoWLogGroup(ctx, logID); err != nil {
			resp.Failed = append(resp.Failed, chroniclesdk.AdminBulkLogFailure{
				LogGroupID: logID,
				Detail:     err.Error(),
			})
			continue
		}
		resp.Deleted++
	}

	httpapi.Write(ctx, w, http.StatusOK, resp)
}

func (a *API) AdminBulkReparseLogs(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	var req chroniclesdk.AdminBulkLogRequest
	if !httpapi.Read(ctx, w, r, &req) {
		return
	}

	resp := chroniclesdk.AdminBulkSelectedReparseResponse{
		Requested: len(req.LogIDs),
		Failed:    make([]chroniclesdk.AdminBulkLogFailure, 0),
	}

	for _, logID := range req.LogIDs {
		files, err := a.Zed.GetWoWLogFilesByGroupID(ctx, logID)
		if err != nil {
			resp.Failed = append(resp.Failed, chroniclesdk.AdminBulkLogFailure{
				LogGroupID: logID,
				Detail:     err.Error(),
			})
			continue
		}

		storageDeleted := false
		for _, f := range files {
			if f.StorageDeletedAt.Valid {
				storageDeleted = true
				resp.Failed = append(resp.Failed, chroniclesdk.AdminBulkLogFailure{
					LogGroupID: logID,
					Detail:     "re-parse requires the log files to be present in storage",
				})
				break
			}
		}
		if storageDeleted {
			continue
		}

		var realmID uuid.UUID
		if meta, metaErr := a.Zed.GetServerUploadMetaRealmID(ctx, logID); metaErr == nil && meta.Valid {
			realmID = meta.UUID
		}

		if _, err := a.Chronicle.EnqueueReParseLog(ctx, logID, false, false, realmID); err != nil {
			resp.Failed = append(resp.Failed, chroniclesdk.AdminBulkLogFailure{
				LogGroupID: logID,
				Detail:     err.Error(),
			})
			continue
		}
		resp.Enqueued++
	}

	httpapi.Write(ctx, w, http.StatusOK, resp)
}

func (a *API) AdminBulkReparseOutdatedInstances(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	minParserVersion := r.URL.Query().Get("parser_version")
	if minParserVersion == "" {
		minParserVersion = defaultMinParserVersion
	}

	nameFilter := r.URL.Query().Get("instance_name")
	var instanceName pgtype.Text
	if nameFilter != "" {
		instanceName = pgtype.Text{String: nameFilter, Valid: true}
	}

	rows, err := a.Opts.Zed.AdminListOutdatedParserVersionInstances(ctx, database.AdminListOutdatedParserVersionInstancesParams{
		MinParserVersion: minParserVersion,
		InstanceName:     instanceName,
	})
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}

	resp := chroniclesdk.AdminBulkReparseResponse{
		Matched:    len(rows),
		Enqueued:   0,
		MinVersion: minParserVersion,
		Failed:     make([]chroniclesdk.AdminBulkReparseFailure, 0),
	}

	for _, row := range rows {
		_, enqueueErr := a.enqueueReparseLogGroup(ctx, row.LogGroupID, false, false, reparseOverride{})
		if enqueueErr != nil {
			resp.Failed = append(resp.Failed, chroniclesdk.AdminBulkReparseFailure{
				LogGroupID: row.LogGroupID,
				Name:       row.Name,
				Detail:     enqueueErr.Error(),
			})
			continue
		}
		resp.Enqueued++
	}

	httpapi.Write(ctx, w, http.StatusAccepted, resp)
}

func (a *API) AdminGetSiteConfig(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	config, err := a.Opts.Zed.GetSiteConfig(ctx)
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}

	t := servicetenant.TenantFromContext(ctx)
	resp := chroniclesdk.SiteConfig{
		SignupsEnabled:        config.SignupsEnabled,
		ShortLinkDomain:       a.Opts.ShortLinkDomain,
		ClientUploadsDisabled: a.Opts.ClientUploadsDisabled || (t != nil && t.DisableClientUpload),
	}
	if t != nil {
		tenant := chroniclesdk.TenantFromDB(*t)
		resp.Tenant = &tenant
	}
	if a.Opts.Tenant != nil {
		resp.PrimaryDomain = a.Opts.Tenant.PrimaryDomain()
	}
	if a.Opts.AccessURL != nil {
		resp.AccessURL = a.Opts.AccessURL.String()
	}
	resp.Branding = unmarshalBranding(config.Branding)
	resp.Discoverable = config.Discoverable
	if config.DefaultFormat.Valid {
		s := string(config.DefaultFormat.LogFormat)
		resp.DefaultFormat = &s
	}
	if len(config.AvailableFormats) > 0 {
		resp.AvailableFormats = config.AvailableFormats
	}

	// Resolve the tenant's default dataset flavor so the frontend can
	// derive per-flavor settings (e.g. talent calculator max level).
	if t != nil && t.DefaultDatasetID.Valid {
		ds, err := a.Opts.Dataset.GetDataset(ctx, t.DefaultDatasetID.UUID)
		if err == nil {
			resp.DatasetFlavor = ds.DefaultFlavor
		}
	}

	w.Header().Set("Cache-Control", "private, max-age=300") // 5 min; varies per tenant
	httpapi.Write(ctx, w, http.StatusOK, resp)
}

func (a *API) AdminUpdateSiteConfig(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	var req chroniclesdk.UpdateSiteConfigRequest
	if !httpapi.Read(ctx, w, r, &req) {
		return
	}

	var params database.UpdateSiteConfigParams
	if req.SignupsEnabled != nil {
		params.SignupsEnabled = pgtype.Bool{Bool: *req.SignupsEnabled, Valid: true}
	}
	if req.Branding != nil {
		b, _ := json.Marshal(req.Branding)
		params.Branding = b
	}
	if req.Discoverable != nil {
		params.Discoverable = pgtype.Bool{Bool: *req.Discoverable, Valid: true}
	}
	if req.DefaultFormat != nil {
		params.DefaultFormat = database.NullLogFormat{LogFormat: database.LogFormat(*req.DefaultFormat), Valid: true}
	}
	if req.AvailableFormats != nil {
		params.AvailableFormats = req.AvailableFormats
	}

	// Update the per-tenant client upload flag if requested.
	t := servicetenant.TenantFromContext(ctx)
	if req.DisableClientUpload != nil && t != nil {
		updated, err := a.Opts.Zed.UpdateTenant(ctx, database.UpdateTenantParams{
			ID:                  t.ID,
			DisableClientUpload: pgtype.Bool{Bool: *req.DisableClientUpload, Valid: true},
		})
		if err != nil {
			httpapi.InternalServerError(w, err)
			return
		}
		t = &updated
	}

	config, err := a.Opts.Zed.UpdateSiteConfig(ctx, params)
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}
	httpapi.Write(ctx, w, http.StatusOK, chroniclesdk.SiteConfig{
		SignupsEnabled:        config.SignupsEnabled,
		ShortLinkDomain:       a.Opts.ShortLinkDomain,
		ClientUploadsDisabled: a.Opts.ClientUploadsDisabled || (t != nil && t.DisableClientUpload),
		Branding:              unmarshalBranding(config.Branding),
		Discoverable:          config.Discoverable,
	})
}

// unmarshalBranding converts raw JSONB bytes into a Branding pointer.
func unmarshalBranding(data []byte) *chroniclesdk.Branding {
	if len(data) == 0 {
		return nil
	}
	var b chroniclesdk.Branding
	if err := json.Unmarshal(data, &b); err != nil {
		return nil
	}
	return &b
}
