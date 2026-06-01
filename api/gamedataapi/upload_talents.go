package gamedataapi

import (
	"io"
	"net/http"

	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/api/httpapi"
	"github.com/Emyrk/chronicle/database"
	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
)

const maxTalentJSONSize = 16 * 1024 * 1024 // 16 MB

// UploadTalentTrees stores a pre-computed talent-tree JSON document for a
// dataset. The CLI computes the document from multiple DBC files and PUTs the
// result here, so the server never needs to stage raw DBC files.
//
// PUT /game-data/datasets/{datasetID}/talent-trees
func (h *Handler) UploadTalentTrees(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	datasetID, err := uuid.Parse(chi.URLParam(r, "datasetID"))
	if err != nil {
		httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{
			Message: "Invalid datasetID",
			Detail:  err.Error(),
		})
		return
	}

	body, err := io.ReadAll(io.LimitReader(r.Body, maxTalentJSONSize))
	if err != nil {
		httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{
			Message: "Failed to read request body",
			Detail:  err.Error(),
		})
		return
	}

	store := database.New(h.pool)
	err = store.UpsertDatasetTalentTrees(ctx, database.UpsertDatasetTalentTreesParams{
		DatasetID: datasetID,
		Data:      body,
	})
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}

	httpapi.Write(ctx, w, http.StatusOK, chroniclesdk.Response{Message: "talent trees updated"})
}
