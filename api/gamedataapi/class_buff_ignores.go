package gamedataapi

import (
	"net/http"
	"strings"

	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/api/httpapi"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/internal/services/servicetenant"
	"github.com/google/uuid"
)

func requireRootScope(w http.ResponseWriter, r *http.Request) bool {
	if servicetenant.TenantFromContext(r.Context()) == nil {
		return true
	}
	httpapi.Write(r.Context(), w, http.StatusBadRequest, chroniclesdk.Response{
		Message: "tenant bulk management is only available from the root domain",
	})
	return false
}

func (h *Handler) ListClassBuffIgnorePolicies(w http.ResponseWriter, r *http.Request) {
	if !requireRootScope(w, r) {
		return
	}
	ctx := servicetenant.AdminBypass(r.Context())
	rows, err := database.New(h.pool).ListClassBuffIgnorePolicies(ctx)
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}

	policies := make([]chroniclesdk.ClassBuffIgnorePolicy, 0, len(rows))
	for _, row := range rows {
		policy := chroniclesdk.ClassBuffIgnorePolicy{SpellName: row.SpellName}
		if row.TenantID.Valid {
			policy.TenantID = &row.TenantID.UUID
		}
		policies = append(policies, policy)
	}
	httpapi.Write(ctx, w, http.StatusOK, policies)
}

func (h *Handler) SetClassBuffIgnores(w http.ResponseWriter, r *http.Request) {
	if !requireRootScope(w, r) {
		return
	}
	ctx := servicetenant.AdminBypass(r.Context())
	var req chroniclesdk.SetClassBuffIgnoresRequest
	if !httpapi.Read(ctx, w, r, &req) {
		return
	}
	req.SpellName = strings.TrimSpace(req.SpellName)
	if req.SpellName == "" {
		httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{Message: "spell_name is required"})
		return
	}
	if !req.IncludeRoot && len(req.TenantIDs) == 0 {
		httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{Message: "select at least one tenant or root"})
		return
	}

	scopes := make(map[uuid.UUID]uuid.NullUUID, len(req.TenantIDs)+1)
	if req.IncludeRoot {
		scopes[uuid.Nil] = uuid.NullUUID{}
	}
	for _, tenantID := range req.TenantIDs {
		if tenantID == uuid.Nil {
			httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{Message: "tenant_ids cannot contain the nil UUID"})
			return
		}
		scopes[tenantID] = uuid.NullUUID{UUID: tenantID, Valid: true}
	}

	store := database.New(h.pool)
	if err := store.InTx(ctx, func(tx database.Store) error {
		for scopeID, tenantID := range scopes {
			if req.Ignored {
				if err := tx.UpsertClassBuffIgnore(ctx, database.UpsertClassBuffIgnoreParams{
					ScopeID: scopeID, TenantID: tenantID, SpellName: req.SpellName,
				}); err != nil {
					return err
				}
				continue
			}
			if err := tx.DeleteClassBuffIgnore(ctx, database.DeleteClassBuffIgnoreParams{
				ScopeID: scopeID, SpellName: req.SpellName,
			}); err != nil {
				return err
			}
		}
		return nil
	}, nil); err != nil {
		httpapi.InternalServerError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
