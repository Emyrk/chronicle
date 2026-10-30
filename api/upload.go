package api

import (
	"context"
	"errors"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"strconv"
	"strings"

	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/api/httpapi"
	"github.com/Emyrk/chronicle/api/httpmw"
	"github.com/Emyrk/chronicle/chronicle"
	"github.com/Emyrk/chronicle/combatlog/parser/wotlk/sidekickstorage"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/authz"
	"github.com/Emyrk/chronicle/database/authz/policy"
	"github.com/Emyrk/chronicle/database/storage"
	"github.com/Emyrk/chronicle/internal/services"
	"github.com/Emyrk/chronicle/internal/services/servicetenant"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
)

const (
	MaxLogFileSize     = 250 * 1024 * 1024 // 250 MB
	MaxLogArtifactSize = 8 * 1024 * 1024   // 8 MB
	MaxUserLogAppends  = 5
)

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

func (api *API) enqueueReparseLogGroup(ctx context.Context, logID uuid.UUID, verbose bool, identityMode bool, profile bool, override reparseOverride) (int64, error) {
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

	// A new reparse supersedes any previous profile, even when this reparse is
	// not profiled or later fails before reaching the parse phase.
	if err := api.Chronicle.RemoveParseCPUProfile(ctx, logID); err != nil {
		return 0, err
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

	res, err := api.Chronicle.EnqueueReParseLog(ctx, logID, verbose, identityMode, profile, realmID)
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
	profile := r.URL.Query().Get("profile") == "true"
	if identityMode || profile {
		adminActor, _ := authz.ActorFromContext(ctx)
		isAdmin, adminErr := api.Zed.CheckOne(ctx, nil, policy.New().GlobalChronicle().CanAdmin_logs_User(adminActor))
		if adminErr != nil || !isAdmin {
			message := "Only admins can use identity mode"
			if profile {
				message = "Only admins can profile reparses"
			}
			httpapi.Write(ctx, w, http.StatusForbidden, chroniclesdk.Response{Message: message})
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

	jobID, err := api.enqueueReparseLogGroup(ctx, logID, verbose, identityMode, profile, override)
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

func (api *API) WoWLogParseProfileDownload(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	logID := httpmw.LogID(ctx)
	actor, _ := authz.ActorFromContext(ctx)

	isAdmin, err := api.Zed.CheckOne(ctx, nil, policy.New().GlobalChronicle().CanAdmin_logs_User(actor))
	if err != nil || !isAdmin {
		httpapi.Forbidden(w, err)
		return
	}

	canView, err := api.Zed.CheckOne(ctx, nil, policy.New().Raid_log(logID).CanView_User(actor))
	if err != nil || !canView {
		httpapi.Forbidden(w, err)
		return
	}

	available, err := api.Chronicle.CurrentParseCPUProfileAvailable(ctx, logID)
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}
	if !available {
		httpapi.Write(ctx, w, http.StatusNotFound, chroniclesdk.Response{Message: "No CPU profile is available for the current parse"})
		return
	}

	profile, err := api.Chronicle.DownloadParseCPUProfile(ctx, logID)
	if errors.Is(err, storage.ErrFileNotFound) {
		httpapi.Write(ctx, w, http.StatusNotFound, chroniclesdk.Response{Message: "The CPU profile is no longer available"})
		return
	}
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}

	w.Header().Set("Content-Type", "application/octet-stream")
	w.Header().Set("Content-Disposition", fmt.Sprintf("attachment; filename=\"parse-%s-cpu.pprof\"", logID.String()))
	w.Header().Set("Content-Length", strconv.Itoa(len(profile)))
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(profile)
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
		Message: "Log files and artifacts deleted successfully",
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

func uploadUnlisted(r *http.Request) (bool, error) {
	value := r.FormValue("unlisted")
	if value == "" {
		value = r.URL.Query().Get("unlisted")
	}
	if value == "" {
		return false, nil
	}
	return strconv.ParseBool(value)
}

func userLogAppendMeta(header http.Header) (chronicle.LogAppendMeta, error) {
	uploadID, err := uuid.Parse(header.Get("X-Chronicle-Upload-ID"))
	if err != nil {
		return chronicle.LogAppendMeta{}, errors.New("invalid or missing X-Chronicle-Upload-ID header")
	}
	sequence, err := strconv.ParseInt(header.Get("X-Chronicle-Chunk-Sequence"), 10, 64)
	if err != nil || sequence <= 0 {
		return chronicle.LogAppendMeta{}, errors.New("invalid or missing X-Chronicle-Chunk-Sequence header")
	}
	return chronicle.LogAppendMeta{
		UploadID:       uploadID,
		SourceSequence: pgtype.Int8{Int64: sequence, Valid: true},
	}, nil
}

func (api *API) authorizeUnlistedUpload(ctx context.Context, w http.ResponseWriter, unlisted bool) bool {
	if !unlisted {
		return true
	}
	actor, _ := authz.ActorFromContext(ctx)
	allowed, err := api.Zed.CheckOne(ctx, nil, policy.New().GlobalChronicle().CanMark_log_unlisted_User(actor))
	if err != nil {
		httpapi.InternalServerError(w, err)
		return false
	}
	if !allowed {
		httpapi.Write(ctx, w, http.StatusForbidden, chroniclesdk.Response{
			Message: "You do not have permission to upload unlisted logs.",
		})
		return false
	}
	return true
}

func (api *API) WoWLogAppend(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	logID := httpmw.LogID(ctx)
	actor, _ := authz.ActorFromContext(ctx)
	if api.clientUploadsDisabled(ctx) {
		isAdmin, err := api.Zed.CheckOne(ctx, nil, policy.New().GlobalChronicle().CanAdmin_logs_User(actor))
		if err != nil || !isAdmin {
			httpapi.Write(ctx, w, http.StatusForbidden, chroniclesdk.Response{
				Message: "Client-side uploads are disabled for this server.",
			})
			return
		}
	}

	allowed, err := api.Zed.CheckOne(ctx, nil, policy.New().Raid_log(logID).CanAppend_User(actor))
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}
	if !allowed {
		httpapi.Forbidden(w, nil)
		return
	}

	group, err := api.Zed.GetWoWLogGroupByID(ctx, logID)
	if errors.Is(err, pgx.ErrNoRows) {
		httpapi.Write(ctx, w, http.StatusNotFound, chroniclesdk.Response{Message: "Log not found"})
		return
	}
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}

	meta, err := userLogAppendMeta(r.Header)
	if err != nil {
		httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{Message: err.Error()})
		return
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
			Message: "Log file part is too large, exceeds maximum allowed size of 250 MB",
			Detail:  fmt.Sprintf("file size: %d bytes", header.Size),
		})
		return
	}
	if !isGzipped(header) {
		httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{Message: "Log file parts must be gzip-compressed"})
		return
	}

	var artifactInput *chronicle.ArtifactInput
	artifactFile, artifactHeader, artifactErr := r.FormFile("sidekick_storage")
	switch {
	case artifactErr == nil:
		defer func() { _ = artifactFile.Close() }()
		if artifactHeader.Size > MaxLogArtifactSize {
			httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{
				Message: "Sidekick SavedVariables file is too large, exceeds maximum allowed size of 8 MB",
				Detail:  fmt.Sprintf("file size: %d bytes", artifactHeader.Size),
			})
			return
		}
		effectiveFormat := group.WoWLogGroup.LogType.Format()
		if group.WoWLogGroup.Format.Valid {
			effectiveFormat = group.WoWLogGroup.Format.LogFormat
		}
		if effectiveFormat != database.LogFormat335aCcAddon {
			httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{
				Message: "Sidekick SavedVariables artifacts are only supported for 3.3.5a logs",
			})
			return
		}
		decoded, decodeErr := (sidekickstorage.Decoder{}).Decode(ctx, artifactFile)
		if decodeErr != nil {
			httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{
				Message: "Invalid Sidekick SavedVariables file",
				Detail:  decodeErr.Error(),
			})
			return
		}
		sidekickSource, ok := decoded.(*sidekickstorage.Source)
		if !ok {
			httpapi.InternalServerError(w, fmt.Errorf("unexpected Sidekick storage source type %T", decoded))
			return
		}
		if _, seekErr := artifactFile.Seek(0, io.SeekStart); seekErr != nil {
			httpapi.InternalServerError(w, fmt.Errorf("rewind Sidekick SavedVariables file: %w", seekErr))
			return
		}
		artifactInput = &chronicle.ArtifactInput{
			Kind:             chronicle.ArtifactKindSidekickStorage,
			SchemaVersion:    sidekickSource.SchemaVersion(),
			Reader:           artifactFile,
			MimeType:         "text/plain;charset=UTF-8",
			OriginalFilename: artifactHeader.Filename,
		}
	case errors.Is(artifactErr, http.ErrMissingFile):
		// Sidekick storage is optional for each appended part.
	default:
		httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{
			Message: "Failed to get Sidekick SavedVariables file from form",
			Detail:  artifactErr.Error(),
		})
		return
	}

	isAdmin, err := api.Zed.CheckOne(ctx, nil, policy.New().GlobalChronicle().CanAdmin_logs_User(actor))
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}
	maxAppends := int64(MaxUserLogAppends)
	if isAdmin {
		maxAppends = 0
	}

	var realmID uuid.UUID
	if realm, realmErr := api.Zed.GetServerUploadMetaRealmID(ctx, logID); realmErr == nil && realm.Valid {
		realmID = realm.UUID
	}
	if err := api.Chronicle.AppendUserLog(ctx, group.WoWLogGroup, file, artifactInput, realmID, meta, maxAppends); err != nil {
		status := http.StatusInternalServerError
		message := "Failed to append log file"
		switch {
		case errors.Is(err, chronicle.ErrUserLogAppendLimit):
			status = http.StatusConflict
			message = fmt.Sprintf("A log can have at most %d user appends", MaxUserLogAppends)
		case errors.Is(err, chronicle.ErrLogAppendInProgress):
			status = http.StatusConflict
			message = "This log append is already in progress"
		}
		httpapi.HandleResponseError(ctx, w, err, httpapi.APIError{
			Response: chroniclesdk.Response{Message: message, Detail: err.Error()},
			Status:   status,
		})
		return
	}

	if api.Opts.Sidekick != nil {
		api.Opts.Sidekick.RecordUpload(ctx)
	}
	files, err := api.Zed.GetWoWLogFilesByGroupID(ctx, logID)
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}
	fileIDs := make([]uuid.UUID, 0, len(files))
	for _, logFile := range files {
		fileIDs = append(fileIDs, logFile.ID)
	}
	httpapi.Write(ctx, w, http.StatusCreated, chroniclesdk.LogUploadResponse{LogID: logID, Files: fileIDs})
}

func (api *API) WoWLogUpload(w http.ResponseWriter, r *http.Request) {
	httpapi.Write(r.Context(), w, http.StatusGone, chroniclesdk.Response{
		Message:      "This upload endpoint has been retired.",
		CallToAction: "Use /api/v1/raidlogs/logs/upload-v2 instead.",
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

	var artifactInputs []chronicle.ArtifactInput
	artifactFile, artifactHeader, artifactErr := r.FormFile("sidekick_storage")
	switch {
	case artifactErr == nil:
		defer func() { _ = artifactFile.Close() }()
		if artifactHeader.Size > MaxLogArtifactSize {
			httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{
				Message: "Sidekick SavedVariables file is too large, exceeds maximum allowed size of 8 MB",
				Detail:  fmt.Sprintf("file size: %d bytes", artifactHeader.Size),
			})
			return
		}
		effectiveFormat := meta.Format
		if effectiveFormat == "" {
			effectiveFormat = logType.Format()
		}
		if effectiveFormat != database.LogFormat335aCcAddon {
			httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{
				Message: "Sidekick SavedVariables artifacts are only supported for 3.3.5a logs",
			})
			return
		}
		decoded, err := (sidekickstorage.Decoder{}).Decode(ctx, artifactFile)
		if err != nil {
			httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{
				Message: "Invalid Sidekick SavedVariables file",
				Detail:  err.Error(),
			})
			return
		}
		sidekickSource, ok := decoded.(*sidekickstorage.Source)
		if !ok {
			httpapi.InternalServerError(w, fmt.Errorf("unexpected Sidekick storage source type %T", decoded))
			return
		}
		if _, err := artifactFile.Seek(0, io.SeekStart); err != nil {
			httpapi.InternalServerError(w, fmt.Errorf("rewind Sidekick SavedVariables file: %w", err))
			return
		}
		artifactInputs = append(artifactInputs, chronicle.ArtifactInput{
			Kind:             chronicle.ArtifactKindSidekickStorage,
			SchemaVersion:    sidekickSource.SchemaVersion(),
			Reader:           artifactFile,
			MimeType:         "text/plain;charset=UTF-8",
			OriginalFilename: artifactHeader.Filename,
		})
	case errors.Is(artifactErr, http.ErrMissingFile):
		// Sidekick storage is optional.
	default:
		httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{
			Message: "Failed to get Sidekick SavedVariables file from form",
			Detail:  artifactErr.Error(),
		})
		return
	}

	unlisted, err := uploadUnlisted(r)
	if err != nil {
		httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{Message: "unlisted must be a boolean"})
		return
	}
	if !api.authorizeUnlistedUpload(ctx, w, unlisted) {
		return
	}
	meta.Unlisted = unlisted

	group, files, err := api.Chronicle.UploadLogs(ctx, []chronicle.UploadInput{input}, artifactInputs, logType, uuid.Nil, meta)
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

	if api.Opts.Sidekick != nil && api.Opts.Sidekick.RecordUpload(ctx) {
		api.notifySidekickUploadAccepted(ctx, group.ID)
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
