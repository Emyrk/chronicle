package linkedapi

import (
	"database/sql"
	"errors"
	"net/http"

	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/api/httpapi"
	"github.com/Emyrk/chronicle/internal/services/servicetenant"
	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
)

func (h *Handler) grantTenant(w http.ResponseWriter, r *http.Request) (uuid.UUID, bool) {
	if servicetenant.TenantFromContext(r.Context()) != nil {
		proofError(w, r, http.StatusForbidden, "Manage tenant grants on the root domain")
		return uuid.Nil, false
	}
	id, err := uuid.Parse(chi.URLParam(r, "tenantID"))
	if err != nil || id == uuid.Nil {
		proofError(w, r, http.StatusBadRequest, "Invalid tenant ID")
		return uuid.Nil, false
	}
	if _, err := h.zed.GetTenantByID(servicetenant.AdminBypass(r.Context()), id); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			proofError(w, r, http.StatusNotFound, "Tenant not found")
		} else {
			httpapi.InternalServerError(w, err)
		}
		return uuid.Nil, false
	}
	return id, true
}

func (h *Handler) ListTenantProofGrants(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := h.grantTenant(w, r)
	if !ok {
		return
	}
	grants, err := h.zed.TenantProofGrants(r.Context(), tenantID)
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}
	result := make([]chroniclesdk.TenantProofGrant, 0, len(grants))
	for _, grant := range grants {
		result = append(result, chroniclesdk.TenantProofGrant{UserID: grant.UserID, Submit: grant.Submit, Review: grant.Review})
	}
	httpapi.Write(r.Context(), w, http.StatusOK, result)
}

func (h *Handler) SetTenantProofGrant(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := h.grantTenant(w, r)
	if !ok {
		return
	}
	userID, err := uuid.Parse(chi.URLParam(r, "userID"))
	if err != nil || userID == uuid.Nil {
		proofError(w, r, http.StatusBadRequest, "Invalid user ID")
		return
	}
	if _, err := h.zed.GetUserByID(servicetenant.AdminBypass(r.Context()), userID); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			proofError(w, r, http.StatusNotFound, "User not found")
		} else {
			httpapi.InternalServerError(w, err)
		}
		return
	}
	var input chroniclesdk.TenantProofGrant
	if !httpapi.Read(r.Context(), w, r, &input) {
		return
	}
	if err := h.zed.SetTenantProofGrant(r.Context(), tenantID, userID, input.Submit, input.Review); err != nil {
		httpapi.InternalServerError(w, err)
		return
	}
	httpapi.Write(r.Context(), w, http.StatusOK, chroniclesdk.TenantProofGrant{UserID: userID, Submit: input.Submit, Review: input.Review})
}
