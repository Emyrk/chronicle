package servicetenant

import (
	"net/http"

	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/api/httpapi"
	"github.com/Emyrk/chronicle/database"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
)

// Routes returns the tenant admin CRUD router.
// Callers are responsible for wrapping with auth middleware.
func (s *Service) Routes() http.Handler {
	r := chi.NewRouter()
	r.Get("/", s.List)
	r.Post("/", s.Upsert)
	r.Get("/{tenantID}", s.Get)
	r.Put("/{tenantID}", s.Upsert)
	r.Put("/{tenantID}/dataset", s.SetTenantDataset)
	r.Delete("/{tenantID}", s.Delete)
	return r
}

func (s *Service) List(w http.ResponseWriter, r *http.Request) {
	ctx := AdminBypass(r.Context())
	tenants, err := s.db.ListTenants(ctx)
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}

	out := make([]chroniclesdk.Tenant, 0, len(tenants))
	for _, t := range tenants {
		out = append(out, chroniclesdk.TenantFromDB(t))
	}
	httpapi.Write(ctx, w, http.StatusOK, out)
}

func (s *Service) Get(w http.ResponseWriter, r *http.Request) {
	ctx := AdminBypass(r.Context())
	id, err := uuid.Parse(chi.URLParam(r, "tenantID"))
	if err != nil {
		httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{Message: "invalid tenant id"})
		return
	}

	t, err := s.db.GetTenantByID(ctx, id)
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}
	httpapi.Write(ctx, w, http.StatusOK, chroniclesdk.TenantFromDB(t))
}

func (s *Service) Upsert(w http.ResponseWriter, r *http.Request) {
	ctx := AdminBypass(r.Context())
	var req chroniclesdk.UpsertTenantRequest
	if !httpapi.Read(ctx, w, r, &req) {
		return
	}

	// On PUT, the ID comes from the URL path, not the body.
	if idStr := chi.URLParam(r, "tenantID"); idStr != "" {
		parsed, err := uuid.Parse(idStr)
		if err != nil {
			httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{Message: "invalid tenant id"})
			return
		}
		req.ID = uuid.NullUUID{UUID: parsed, Valid: true}
	}

	var t database.Tenant
	var err error
	if req.IsCreate() {
		if req.Name == "" {
			httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{Message: "name is required"})
			return
		}
		t, err = s.db.InsertTenant(ctx, req.ToInsertParams())
	} else {
		t, err = s.db.UpdateTenant(ctx, req.ToUpdateParams())
	}
	if err != nil {
		if database.IsUniqueViolation(err) {
			httpapi.Write(ctx, w, http.StatusConflict, chroniclesdk.Response{
				Message: "tenant name already exists",
			})
			return
		}
		httpapi.InternalServerError(w, err)
		return
	}

	s.InvalidateCache()
	httpapi.Write(ctx, w, http.StatusOK, chroniclesdk.TenantFromDB(t))
}

func (s *Service) Delete(w http.ResponseWriter, r *http.Request) {
	ctx := AdminBypass(r.Context())
	id, err := uuid.Parse(chi.URLParam(r, "tenantID"))
	if err != nil {
		httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{Message: "invalid tenant id"})
		return
	}

	err = s.db.DeleteTenant(ctx, id)
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}

	s.InvalidateCache()
	httpapi.Write(ctx, w, http.StatusOK, chroniclesdk.Response{Message: "deleted"})
}

func (s *Service) SetServerTenant(w http.ResponseWriter, r *http.Request) {
	ctx := AdminBypass(r.Context())
	serverID, err := uuid.Parse(chi.URLParam(r, "serverID"))
	if err != nil {
		httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{Message: "invalid server id"})
		return
	}

	var req chroniclesdk.SetServerTenantRequest
	if !httpapi.Read(ctx, w, r, &req) {
		return
	}

	params := database.SetServerTenantParams{
		ID: serverID,
	}
	if req.TenantID != nil {
		params.TenantID = uuid.NullUUID{UUID: *req.TenantID, Valid: true}
	}

	err = s.db.SetServerTenant(ctx, params)
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}

	httpapi.Write(ctx, w, http.StatusOK, chroniclesdk.Response{Message: "updated"})
}

// SetServerDataset assigns or removes the default dataset of a server.
// Pass a null dataset_id to clear the assignment.
func (s *Service) SetServerDataset(w http.ResponseWriter, r *http.Request) {
	ctx := AdminBypass(r.Context())
	serverID, err := uuid.Parse(chi.URLParam(r, "serverID"))
	if err != nil {
		httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{Message: "invalid server id"})
		return
	}

	var req chroniclesdk.SetDatasetRequest
	if !httpapi.Read(ctx, w, r, &req) {
		return
	}

	params := database.SetServerDatasetParams{ID: serverID}
	if req.DatasetID != nil {
		params.DefaultDatasetID = uuid.NullUUID{UUID: *req.DatasetID, Valid: true}
	}

	if err := s.db.SetServerDataset(ctx, params); err != nil {
		httpapi.InternalServerError(w, err)
		return
	}

	httpapi.Write(ctx, w, http.StatusOK, chroniclesdk.Response{Message: "updated"})
}

// SetTenantDataset assigns or removes the default dataset of a tenant.
// Pass a null dataset_id to clear the assignment.
func (s *Service) SetTenantDataset(w http.ResponseWriter, r *http.Request) {
	ctx := AdminBypass(r.Context())
	tenantID, err := uuid.Parse(chi.URLParam(r, "tenantID"))
	if err != nil {
		httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{Message: "invalid tenant id"})
		return
	}

	var req chroniclesdk.SetDatasetRequest
	if !httpapi.Read(ctx, w, r, &req) {
		return
	}

	params := database.SetTenantDatasetParams{ID: tenantID}
	if req.DatasetID != nil {
		params.DefaultDatasetID = uuid.NullUUID{UUID: *req.DatasetID, Valid: true}
	}

	if err := s.db.SetTenantDataset(ctx, params); err != nil {
		httpapi.InternalServerError(w, err)
		return
	}

	s.InvalidateCache()
	httpapi.Write(ctx, w, http.StatusOK, chroniclesdk.Response{Message: "updated"})
}
