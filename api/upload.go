package api

import (
	"fmt"
	"net/http"

	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/api/httpapi"
	"github.com/Emyrk/chronicle/api/httpmw"
	"github.com/google/uuid"
)

const MaxLogFileSize = 50 * 1024 * 1024 // 50 MB

func (api *API) WoWLogReparse(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	logID := httpmw.LogID(ctx)

	res, err := api.Chronicle.EnqueueReParseLog(ctx, logID)
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

	httpapi.Write(ctx, w, http.StatusAccepted, res.Job.ID)
}

func (api *API) WoWLogUpload(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	//uc := chronauth.MustAuthenticatedClaims(ctx)

	first, header, err := r.FormFile("combat_log_1")
	if err != nil {
		httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{
			Message: "Failed to get first file from form",
			Detail:  err.Error(),
		})
		return
	}

	if header.Size > MaxLogFileSize {
		httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{
			Message: "First log file is too large, exceeds maximum allowed size of 50 MB",
			Detail:  fmt.Sprintf("file size: %d bytes", header.Size),
		})
		return
	}

	second, header, err := r.FormFile("combat_log_2")
	if err != nil {
		httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{
			Message: "Failed to get second file from form",
			Detail:  err.Error(),
		})
		return
	}

	if header.Size > MaxLogFileSize {
		httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{
			Message: "First log file is too large, exceeds maximum allowed size of 50 MB",
			Detail:  fmt.Sprintf("file size: %d bytes", header.Size),
		})
		return
	}

	group, files, err := api.Chronicle.UploadLogs(ctx, first, second)
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
