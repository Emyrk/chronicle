package servicedataset

import (
	"net/http"

	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/api/httpapi"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/internal/services/servicetenant"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
)

// Routes returns the dataset admin CRUD router.
// Callers are responsible for wrapping with auth middleware.
func (s *Service) Routes() http.Handler {
	r := chi.NewRouter()
	r.Get("/", s.List)
	r.Post("/", s.Upsert)
	r.Get("/{datasetID}", s.Get)
	r.Get("/{datasetID}/tenants", s.ListTenants)
	r.Get("/{datasetID}/import-summary", s.ImportSummary)
	r.Put("/{datasetID}", s.Upsert)
	r.Delete("/{datasetID}", s.Delete)
	return r
}

// ListTenants returns the tenants that use a dataset (directly or via a
// server they own). Used by the import CLI's confirmation guard.
func (s *Service) ListTenants(w http.ResponseWriter, r *http.Request) {
	ctx := servicetenant.AdminBypass(r.Context())
	id, err := uuid.Parse(chi.URLParam(r, "datasetID"))
	if err != nil {
		httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{Message: "invalid dataset id"})
		return
	}

	rows, err := s.db.ListTenantsByDataset(ctx, uuid.NullUUID{UUID: id, Valid: true})
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}

	out := make([]chroniclesdk.DatasetTenantSummary, 0, len(rows))
	for _, row := range rows {
		out = append(out, chroniclesdk.DatasetTenantSummary{
			ID:   row.ID,
			Name: row.Name,
			Slug: nullStr(row.Slug),
		})
	}
	httpapi.Write(ctx, w, http.StatusOK, out)
}

// nullStr unwraps a pgtype.Text-like slug into a plain string.
func nullStr(s pgtype.Text) string {
	if s.Valid {
		return s.String
	}
	return ""
}

func (s *Service) List(w http.ResponseWriter, r *http.Request) {
	ctx := servicetenant.AdminBypass(r.Context())
	datasets, err := s.db.ListDatasets(ctx)
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}

	out := make([]chroniclesdk.Dataset, 0, len(datasets))
	for _, d := range datasets {
		out = append(out, chroniclesdk.DatasetFromDB(d))
	}
	httpapi.Write(ctx, w, http.StatusOK, out)
}

func (s *Service) Get(w http.ResponseWriter, r *http.Request) {
	ctx := servicetenant.AdminBypass(r.Context())
	id, err := uuid.Parse(chi.URLParam(r, "datasetID"))
	if err != nil {
		httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{Message: "invalid dataset id"})
		return
	}

	d, err := s.db.GetDataset(ctx, id)
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}
	httpapi.Write(ctx, w, http.StatusOK, chroniclesdk.DatasetFromDB(d))
}

func (s *Service) Upsert(w http.ResponseWriter, r *http.Request) {
	ctx := servicetenant.AdminBypass(r.Context())
	var req chroniclesdk.UpsertDatasetRequest
	if !httpapi.Read(ctx, w, r, &req) {
		return
	}

	// On PUT, the ID comes from the URL path, not the body.
	if idStr := chi.URLParam(r, "datasetID"); idStr != "" {
		parsed, err := uuid.Parse(idStr)
		if err != nil {
			httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{Message: "invalid dataset id"})
			return
		}
		req.ID = uuid.NullUUID{UUID: parsed, Valid: true}
	}

	var d database.Dataset
	var err error
	if req.IsCreate() {
		if req.Name == "" {
			httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{Message: "name is required"})
			return
		}
		if req.Slug == "" {
			httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{Message: "slug is required"})
			return
		}
		if req.WoWVersion == "" {
			httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{Message: "wow_version is required"})
			return
		}
		d, err = s.db.InsertDataset(ctx, req.ToInsertParams())
	} else {
		d, err = s.db.UpdateDataset(ctx, req.ToUpdateParams())
	}
	if err != nil {
		if database.IsUniqueViolation(err) {
			httpapi.Write(ctx, w, http.StatusConflict, chroniclesdk.Response{
				Message: "dataset slug already exists",
			})
			return
		}
		httpapi.InternalServerError(w, err)
		return
	}

	httpapi.Write(ctx, w, http.StatusOK, chroniclesdk.DatasetFromDB(d))
}

func (s *Service) Delete(w http.ResponseWriter, r *http.Request) {
	ctx := servicetenant.AdminBypass(r.Context())
	id, err := uuid.Parse(chi.URLParam(r, "datasetID"))
	if err != nil {
		httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{Message: "invalid dataset id"})
		return
	}

	// The default dataset is the bottom of every resolution chain and must
	// always exist; never allow deleting it.
	if id == DefaultDatasetID {
		httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{
			Message: "The default dataset cannot be deleted",
		})
		return
	}

	err = s.db.DeleteDataset(ctx, id)
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}

	httpapi.Write(ctx, w, http.StatusOK, chroniclesdk.Response{Message: "deleted"})
}
func (s *Service) ImportSummary(w http.ResponseWriter, r *http.Request) {
	ctx := servicetenant.AdminBypass(r.Context())
	id, err := uuid.Parse(chi.URLParam(r, "datasetID"))
	if err != nil {
		httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{Message: "invalid dataset id"})
		return
	}

	summary, err := s.db.GetDatasetImportSummary(ctx, id)
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}
	httpapi.Write(ctx, w, http.StatusOK, summary)
}
