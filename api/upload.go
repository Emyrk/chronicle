package api

import (
	"context"
	"fmt"
	"mime/multipart"
	"net/http"
	"strings"

	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/api/httpapi"
	"github.com/Emyrk/chronicle/api/httpmw"
	"github.com/Emyrk/chronicle/chronicle"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/authz"
	"github.com/Emyrk/chronicle/database/authz/policy"
	"github.com/Emyrk/chronicle/internal/services"
	"github.com/Emyrk/chronicle/internal/services/servicetenant"
	"github.com/google/uuid"
)

const MaxLogFileSize = 250 * 1024 * 1024 // 250 MB

// parseFlavorParam parses a comma-separated flavor query param into a WoWFlavor,
// trimming whitespace and dropping empties.
func parseFlavorParam(raw string) database.WoWFlavor {
	tags := strings.Split(raw, ",")
	flavor := make(database.WoWFlavor, 0, len(tags))
	for _, t := range tags {
		if t = strings.TrimSpace(t); t != "" {
			flavor = append(flavor, database.FlavorTag(t))
		}
	}
	return flavor
}

// reparseOverride carries optional admin overrides applied to the log group
// before reparsing. Any nil/empty field leaves the persisted value unchanged.
type reparseOverride struct {
	LogType *database.LogType
	Format  *database.LogFormat
	Flavor  database.WoWFlavor
}

func (api *API) enqueueReparseLogGroup(ctx context.Context, logID uuid.UUID, verbose bool, identityMode bool, override reparseOverride) (int64, error) {
	files, err := api.Zed.GetWoWLogFilesByGroupID(ctx, logID)
	if err != nil {
		return 0, err
	}

	for _, f := range files {
		if f.StorageDeletedAt.Valid {
			return 0, httpapi.NewAPIError(
				fmt.Errorf("log files were deleted at %s", f.StorageDeletedAt.Time),
				"re-parse requires the log files to be present in storage",
				http.StatusBadRequest,
			)
		}
	}

	if override.LogType != nil {
		err := api.Zed.UpdateWoWLogGroupLogType(ctx, database.UpdateWoWLogGroupLogTypeParams{
			ID:      logID,
			LogType: *override.LogType,
			// Keep the dual-written format axis in sync with the overridden type.
			Format: database.NullLogFormat{LogFormat: override.LogType.Format(), Valid: override.LogType.Format().Valid()},
		})
		if err != nil {
			return 0, err
		}
	}

	// Direct format/flavor overrides win over any log-type-derived format and
	// are the only way to set flavor. Applied after the log_type update so an
	// explicit format isn't clobbered by the derived one.
	if override.Format != nil || override.Flavor != nil {
		params := database.UpdateWoWLogGroupFormatFlavorParams{ID: logID}
		if override.Format != nil {
			params.Format = database.NullLogFormat{LogFormat: *override.Format, Valid: override.Format.Valid()}
		}
		if override.Flavor != nil {
			params.Flavor = override.Flavor.Strings()
		}
		if err := api.Zed.UpdateWoWLogGroupFormatFlavor(ctx, params); err != nil {
			return 0, err
		}
	}

	var realmID uuid.UUID
	if meta, metaErr := api.Zed.GetServerUploadMetaRealmID(ctx, logID); metaErr == nil && meta.Valid {
		realmID = meta.UUID
	}

	res, err := api.Chronicle.EnqueueReParseLog(ctx, logID, verbose, identityMode, realmID)
	if err != nil {
		return 0, err
	}

	return res.Job.ID, nil
}

func (api *API) WoWLogReparse(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	logID := httpmw.LogID(ctx)
	actor, _ := authz.ActorFromContext(ctx)

	ok, err := api.Zed.CheckOne(ctx, nil, policy.New().Raid_log(logID).CanReparse_User(actor))
	if err != nil || !ok {
		httpapi.Forbidden(w, err)
		return
	}

	verbose := r.URL.Query().Get("verbose") == "true"
	identityMode := r.URL.Query().Get("identity_mode") == "true"
	if identityMode {
		idActor, _ := authz.ActorFromContext(ctx)
		isAdmin, adminErr := api.Zed.CheckOne(ctx, nil, policy.New().GlobalChronicle().CanAdmin_logs_User(idActor))
		if adminErr != nil || !isAdmin {
			httpapi.Write(ctx, w, http.StatusForbidden, chroniclesdk.Response{
				Message: "Only admins can use identity mode",
			})
			return
		}
	}

	var override reparseOverride
	q := r.URL.Query()
	// Admin overrides: log_type, format, and/or flavor. Any of these requires
	// admin; check once if at least one is present.
	if q.Get("log_type") != "" || q.Get("format") != "" || q.Get("flavor") != "" {
		ltActor, _ := authz.ActorFromContext(ctx)
		isAdmin, adminErr := api.Zed.CheckOne(ctx, nil, policy.New().GlobalChronicle().CanAdmin_logs_User(ltActor))
		if adminErr != nil || !isAdmin {
			httpapi.Write(ctx, w, http.StatusForbidden, chroniclesdk.Response{
				Message: "Only admins can override the parse axes",
			})
			return
		}
	}
	if lt := q.Get("log_type"); lt != "" {
		parsedOverrideType := database.LogType(lt)
		if !parsedOverrideType.Valid() {
			httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{
				Message: "Invalid log_type override",
				Detail:  fmt.Sprintf("unknown log type: %q", lt),
			})
			return
		}
		override.LogType = &parsedOverrideType
	}
	if f := q.Get("format"); f != "" {
		format := database.LogFormat(f)
		if !format.Valid() {
			httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{
				Message: "Invalid format override",
				Detail:  fmt.Sprintf("unknown log format: %q", f),
			})
			return
		}
		override.Format = &format
	}
	if fl := q.Get("flavor"); fl != "" {
		override.Flavor = parseFlavorParam(fl)
	}

	jobID, err := api.enqueueReparseLogGroup(ctx, logID, verbose, identityMode, override)
	if err != nil {
		httpapi.HandleResponseError(ctx, w, err, httpapi.APIError{
			Response: chroniclesdk.Response{
				Message: "Failed to enqueue log re-parse",
				Detail:  err.Error(),
			},
			Status: http.StatusInternalServerError,
		})

		return
	}

	httpapi.Write(ctx, w, http.StatusAccepted, jobID)
}

func (api *API) DeleteWoWLogFiles(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	logID := httpmw.LogID(ctx)
	actor, _ := authz.ActorFromContext(ctx)

	ok, err := api.Zed.CheckOne(ctx, nil, policy.New().Raid_log(logID).CanDelete_files_User(actor))
	if err != nil || !ok {
		httpapi.Forbidden(w, err)
		return
	}

	err = api.Chronicle.DeleteWoWLogGroupFiles(ctx, logID)
	if err != nil {
		httpapi.HandleResponseError(ctx, w, err, httpapi.APIError{
			Response: chroniclesdk.Response{
				Message: "Failed to delete log files",
				Detail:  err.Error(),
			},
			Status: http.StatusInternalServerError,
		})
		return
	}

	httpapi.Write(ctx, w, http.StatusOK, chroniclesdk.Response{
		Message: "Log files deleted successfully",
	})
}

// clientUploadsDisabled checks whether client uploads are disabled at the
// server-option, site-config (DB), or per-tenant level.
func (api *API) clientUploadsDisabled(ctx context.Context) bool {
	if api.Opts.ClientUploadsDisabled {
		return true
	}
	if t := servicetenant.TenantFromContext(ctx); t != nil && t.DisableClientUpload {
		return true
	}
	if config, err := api.Opts.Zed.GetSiteConfig(ctx); err == nil && config.ClientUploadsDisabled {
		return true
	}
	return false
}

func (api *API) WoWLogUpload(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	if api.clientUploadsDisabled(ctx) {
		actor, _ := authz.ActorFromContext(ctx)
		isAdmin, err := api.Zed.CheckOne(ctx, nil, policy.New().GlobalChronicle().CanAdmin_logs_User(actor))
		if err != nil || !isAdmin {
			httpapi.Write(ctx, w, http.StatusForbidden, chroniclesdk.Response{
				Message: "Client-side uploads are disabled for this server.",
			})
			return
		}
	}

	first, firstHeader, err := r.FormFile("combat_log_1")
	if err != nil {
		httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{
			Message: "Failed to get first file from form",
			Detail:  err.Error(),
		})
		return
	}
	defer func() { _ = first.Close() }()

	if firstHeader.Size > MaxLogFileSize {
		httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{
			Message: "First log file is too large, exceeds maximum allowed size of 250 MB",
			Detail:  fmt.Sprintf("file size: %d bytes", firstHeader.Size),
		})
		return
	}

	second, secondHeader, err := r.FormFile("combat_log_2")
	if err != nil {
		httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{
			Message: "Failed to get second file from form",
			Detail:  err.Error(),
		})
		return
	}
	defer func() { _ = second.Close() }()

	if secondHeader.Size > MaxLogFileSize {
		httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{
			Message: "Second log file is too large, exceeds maximum allowed size of 250 MB",
			Detail:  fmt.Sprintf("file size: %d bytes", secondHeader.Size),
		})
		return
	}

	// Create upload inputs, detecting if files are gzip-compressed
	firstInput := chronicle.UploadInput{
		Reader:    first,
		IsGzipped: isGzipped(firstHeader),
	}
	secondInput := chronicle.UploadInput{
		Reader:    second,
		IsGzipped: isGzipped(secondHeader),
	}

	group, files, err := api.Chronicle.UploadLogs(ctx, []chronicle.UploadInput{firstInput, secondInput}, database.LogTypeV1, uuid.Nil, chronicle.UploadMeta{})
	if err != nil {
		httpapi.HandleResponseError(ctx, w, err, httpapi.APIError{
			Response: chroniclesdk.Response{
				Message: "Failed to process uploaded log files",
				Detail:  err.Error(),
			},
			Status: http.StatusInternalServerError,
		})
		return
	}

	fileIDs := make([]uuid.UUID, 0, len(files))
	for _, f := range files {
		fileIDs = append(fileIDs, f.ID)
	}

	httpapi.Write(ctx, w, http.StatusCreated, chroniclesdk.LogUploadResponse{
		LogID: group.ID,
		Files: fileIDs,
	})
}

// isGzipped checks if a file header indicates gzip compression
func isGzipped(header *multipart.FileHeader) bool {
	return strings.HasSuffix(header.Filename, ".gz") ||
		header.Header.Get("Content-Type") == "application/gzip"
}

// WoWLogUploadV2 handles single-file uploads for parserv2 logs.
func (api *API) WoWLogUploadV2(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	if api.clientUploadsDisabled(ctx) {
		actor, _ := authz.ActorFromContext(ctx)
		isAdmin, err := api.Zed.CheckOne(ctx, nil, policy.New().GlobalChronicle().CanAdmin_logs_User(actor))
		if err != nil || !isAdmin {
			httpapi.Write(ctx, w, http.StatusForbidden, chroniclesdk.Response{
				Message: "Client-side uploads are disabled for this server.",
			})
			return
		}
	}

	file, header, err := r.FormFile("combat_log")
	if err != nil {
		httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{
			Message: "Failed to get file from form",
			Detail:  err.Error(),
		})
		return
	}
	defer func() { _ = file.Close() }()

	if header.Size > MaxLogFileSize {
		httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{
			Message: "Log file is too large, exceeds maximum allowed size of 250 MB",
			Detail:  fmt.Sprintf("file size: %d bytes", header.Size),
		})
		return
	}

	input := chronicle.UploadInput{
		Reader:    file,
		IsGzipped: isGzipped(header),
	}

	logType := database.LogTypeV2
	switch services.ServerName {
	case services.ServerIdentityAzerothcore:
		logType = database.LogTypeAzerothcoreClientside
	case services.ServerIdentityEpoch:
		logType = database.LogTypeEpoch
	case services.ServerIdentityKronos:
		logType = database.LogTypeKronos
	}

	// Admin override: allow specifying log_type via query parameter.
	if override := r.URL.Query().Get("log_type"); override != "" {
		overrideType := database.LogType(override)
		if !overrideType.Valid() {
			httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{
				Message: "Invalid log_type override",
				Detail:  fmt.Sprintf("unknown log type: %q", override),
			})
			return
		}
		actor, _ := authz.ActorFromContext(ctx)
		ok, err := api.Zed.CheckOne(ctx, nil, policy.New().GlobalChronicle().CanAdmin_logs_User(actor))
		if err != nil || !ok {
			httpapi.Write(ctx, w, http.StatusForbidden, chroniclesdk.Response{
				Message: "Only admins can override the log type",
			})
			return
		}
		logType = overrideType
	}

	// Parse-axis resolution (both format and flavor):
	//   query-param override > tenant default > logType/dataset derivation.
	// The tenant fallback is free (already in context from the subdomain
	// middleware). Anything still empty falls through to UploadLogs (format)
	// or to the parser's dataset resolution (flavor).
	var meta chronicle.UploadMeta
	if f := r.URL.Query().Get("format"); f != "" {
		format := database.LogFormat(f)
		if !format.Valid() {
			httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{
				Message: "Invalid format",
				Detail:  fmt.Sprintf("unknown log format: %q", f),
			})
			return
		}
		meta.Format = format
	}
	if fl := r.URL.Query().Get("flavor"); fl != "" {
		meta.Flavor = parseFlavorParam(fl)
	}
	// Fall back to the tenant's default format when no explicit param was sent.
	// Flavor is not on the tenant — it's resolved post-parse from the dataset.
	if meta.Format == "" {
		if t := servicetenant.TenantFromContext(ctx); t != nil && t.DefaultFormat.Valid {
			meta.Format = t.DefaultFormat.LogFormat
		}
	}

	group, files, err := api.Chronicle.UploadLogs(ctx, []chronicle.UploadInput{input}, logType, uuid.Nil, meta)
	if err != nil {
		httpapi.HandleResponseError(ctx, w, err, httpapi.APIError{
			Response: chroniclesdk.Response{
				Message: "Failed to process uploaded log file",
				Detail:  err.Error(),
			},
			Status: http.StatusInternalServerError,
		})
		return
	}

	fileIDs := make([]uuid.UUID, 0, len(files))
	for _, f := range files {
		fileIDs = append(fileIDs, f.ID)
	}

	httpapi.Write(ctx, w, http.StatusCreated, chroniclesdk.LogUploadResponse{
		LogID: group.ID,
		Files: fileIDs,
	})
}
