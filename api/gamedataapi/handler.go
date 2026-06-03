package gamedataapi

import (
	"context"
	"net/http"

	"github.com/Emyrk/chronicle/api/chronauth"
	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/api/httpapi"
	"github.com/Emyrk/chronicle/api/httpmw"
	"github.com/Emyrk/chronicle/database/authz"
	"github.com/Emyrk/chronicle/database/authz/policy"
	"github.com/Emyrk/chronicle/internal/services/servicedataset"
	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Handler struct {
	zed  *authz.Authz
	auth *chronauth.Service
	pool *pgxpool.Pool
}

func New(zed *authz.Authz, auth *chronauth.Service, pool *pgxpool.Pool) *Handler {
	return &Handler{zed: zed, auth: auth, pool: pool}
}

// datasetIDFromQuery parses the optional ?dataset_id= query param, defaulting
// to the server's default dataset for backwards compatibility. Returns false
// (after writing a 400) when the param is present but malformed.
func datasetIDFromQuery(ctx context.Context, w http.ResponseWriter, r *http.Request) (uuid.UUID, bool) {
	datasetID := servicedataset.DefaultDatasetID
	if dsStr := r.URL.Query().Get("dataset_id"); dsStr != "" {
		parsed, err := uuid.Parse(dsStr)
		if err != nil {
			httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{
				Message: "Invalid dataset_id",
				Detail:  err.Error(),
			})
			return uuid.Nil, false
		}
		datasetID = parsed
	}
	return datasetID, true
}

func (h *Handler) Routes() http.Handler {
	r := chi.NewRouter()
	r.Use(
		h.auth.Authenticated(false),
		httpmw.Can(h.zed, policy.New().GlobalChronicle().CanAdmin_world_data_User),
	)
	r.Post("/wdb/upload", h.UploadWDB)
	r.Post("/sql/import", h.ImportSQL)
	r.Post("/sql/import-url", h.ImportSQLFromURL)
	r.Post("/dbc/upload", h.UploadDBC)
	r.Put("/datasets/{datasetID}/talent-trees", h.UploadTalentTrees)

	// World <-> Server assignment
	r.Post("/worlds/{worldID}/servers/{serverID}", h.AssignWorldToServer)
	r.Delete("/worlds/{worldID}/servers/{serverID}", h.UnassignWorldFromServer)

	return r
}
