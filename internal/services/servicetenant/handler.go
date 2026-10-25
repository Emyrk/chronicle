package servicetenant

import (
	"errors"
	"net/http"

	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/api/httpapi"
	"github.com/Emyrk/chronicle/database"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

// Routes returns the tenant admin CRUD router.
// Callers are responsible for wrapping with auth middleware.
func (s *Service) Routes() http.Handler {
	r := chi.NewRouter()
	r.Get("/", s.List)
	r.Post("/", s.Upsert)
	r.Put("/bulk", s.BulkUpdate)
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

	if req.IsCreate() && req.Name == "" {
		httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{Message: "name is required"})
		return
	}

	var t database.Tenant
	err := s.mutateAndPublish(ctx, func(tx database.Store) error {
		var err error
		if req.IsCreate() {
			t, err = tx.InsertTenant(ctx, req.ToInsertParams())
		} else {
			t, err = tx.UpdateTenant(ctx, req.ToUpdateParams())
		}
		return err
	})
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

	httpapi.Write(ctx, w, http.StatusOK, chroniclesdk.TenantFromDB(t))
}

// BulkUpdate applies partial updates to several existing tenants atomically.
func (s *Service) BulkUpdate(w http.ResponseWriter, r *http.Request) {
	ctx := AdminBypass(r.Context())
	var req chroniclesdk.BulkUpdateTenantsRequest
	if !httpapi.Read(ctx, w, r, &req) {
		return
	}
	if len(req.Tenants) == 0 {
		httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{Message: "no tenants to update"})
		return
	}
	for _, t := range req.Tenants {
		if t.IsCreate() {
			httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{Message: "every tenant update requires an id"})
			return
		}
	}

	out := make([]chroniclesdk.Tenant, 0, len(req.Tenants))
	err := s.mutateAndPublish(ctx, func(tx database.Store) error {
		out = out[:0]
		for _, t := range req.Tenants {
			updated, err := tx.UpdateTenant(ctx, t.ToUpdateParams())
			if err != nil {
				return err
			}
			out = append(out, chroniclesdk.TenantFromDB(updated))
		}
		return nil
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			httpapi.Write(ctx, w, http.StatusNotFound, chroniclesdk.Response{Message: "tenant not found"})
			return
		}
		if database.IsUniqueViolation(err) {
			httpapi.Write(ctx, w, http.StatusConflict, chroniclesdk.Response{Message: "tenant name already exists"})
			return
		}
		httpapi.InternalServerError(w, err)
		return
	}

	httpapi.Write(ctx, w, http.StatusOK, out)
}

func (s *Service) Delete(w http.ResponseWriter, r *http.Request) {
	ctx := AdminBypass(r.Context())
	id, err := uuid.Parse(chi.URLParam(r, "tenantID"))
	if err != nil {
		httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{Message: "invalid tenant id"})
		return
	}

	err = s.mutateAndPublish(ctx, func(tx database.Store) error {
		return tx.DeleteTenant(ctx, id)
	})
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}
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

	if err := s.mutateAndPublish(ctx, func(tx database.Store) error {
		return tx.SetTenantDataset(ctx, params)
	}); err != nil {
		httpapi.InternalServerError(w, err)
		return
	}
	httpapi.Write(ctx, w, http.StatusOK, chroniclesdk.Response{Message: "updated"})
}
