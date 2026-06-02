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

func (api *API) enqueueReparseLogGroup(ctx context.Context, logID uuid.UUID, verbose bool, identityMode bool, overrideType *database.LogType) (int64, error) {
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

	if overrideType != nil {
		err := api.Zed.UpdateWoWLogGroupLogType(ctx, database.UpdateWoWLogGroupLogTypeParams{
			ID:      logID,
			LogType: *overrideType,
			// Keep the dual-written format axis in sync with the overridden type.
			Format: database.NullLogFormat{LogFormat: overrideType.Format(), Valid: overrideType.Format().Valid()},
		})
		if err != nil {
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

	var overrideType *database.LogType
	// Admin override: allow changing the log_type before reparsing.
	if override := r.URL.Query().Get("log_type"); override != "" {
		parsedOverrideType := database.LogType(override)
		if !parsedOverrideType.Valid() {
			httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{
				Message: "Invalid log_type override",
				Detail:  fmt.Sprintf("unknown log type: %q", override),
			})
			return
		}
		ltActor, _ := authz.ActorFromContext(ctx)
		isAdmin, adminErr := api.Zed.CheckOne(ctx, nil, policy.New().GlobalChronicle().CanAdmin_logs_User(ltActor))
		if adminErr != nil || !isAdmin {
			httpapi.Write(ctx, w, http.StatusForbidden, chroniclesdk.Response{
				Message: "Only admins can override the log type",
			})
			return
		}
		overrideType = &parsedOverrideType
	}

	jobID, err := api.enqueueReparseLogGroup(ctx, logID, verbose, identityMode, overrideType)
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

func (api *API) WoWLogUpload(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	if api.Opts.ClientUploadsDisabled {
		actor, _ := authz.ActorFromContext(ctx)
		isAdmin, err := api.Zed.CheckOne(ctx, nil, policy.New().GlobalChronicle().CanAdmin_logs_User(actor))
		if err != nil || !isAdmin {
			httpapi.Write(ctx, w, http.StatusForbidden, chroniclesdk.Response{
				Message: "Client-side uploads are disabled on this server.",
			})
			return
		}
	}

	if t := servicetenant.TenantFromContext(ctx); t != nil && t.DisableClientUpload {
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

	if api.Opts.ClientUploadsDisabled {
		actor, _ := authz.ActorFromContext(ctx)
		isAdmin, err := api.Zed.CheckOne(ctx, nil, policy.New().GlobalChronicle().CanAdmin_logs_User(actor))
		if err != nil || !isAdmin {
			httpapi.Write(ctx, w, http.StatusForbidden, chroniclesdk.Response{
				Message: "Client-side uploads are disabled on this server.",
			})
			return
		}
	}

	if t := servicetenant.TenantFromContext(ctx); t != nil && t.DisableClientUpload {
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

	// The frontend chooses format + flavor from its build tag (and later the
	// tenant), since the realm is unknown until after parsing. Both are
	// optional; empty values fall back to server-side derivation.
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
		tags := strings.Split(fl, ",")
		flavor := make(database.WoWFlavor, 0, len(tags))
		for _, t := range tags {
			if t = strings.TrimSpace(t); t != "" {
				flavor = append(flavor, database.FlavorTag(t))
			}
		}
		meta.Flavor = flavor
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
