package api

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/google/uuid"

	"github.com/Emyrk/chronicle/api/chronauth"
	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/api/httpapi"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/authz"
	"github.com/Emyrk/chronicle/internal/aikey"
	"github.com/Emyrk/chronicle/internal/services/servicetenant"
)

// aiKeyBenefits resolves the user's live tier with the same check that sets
// search budgets.
func (api *API) aiKeyBenefits(ctx context.Context, user uuid.UUID) (chroniclesdk.AIKeyBenefits, error) {
	access, err := api.instanceSearch.UserAccess(ctx, user)
	if err != nil {
		return chroniclesdk.AIKeyBenefits{}, err
	}
	return aikey.BenefitsFor(access.Tier), nil
}

// GetMyAIKey returns the user's current AI key in this community (never its
// secret), its usage and the tier benefits.
func (api *API) GetMyAIKey(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	user := chronauth.MustAuthenticatedClaims(ctx).Subject
	benefits, err := api.aiKeyBenefits(ctx, user)
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}
	resp := chroniclesdk.AIKeyUsage{Benefits: benefits, Tiers: aikey.AllTiers()}
	row, err := api.Opts.Zed.GetUnrevokedAIKey(ctx, database.GetUnrevokedAIKeyParams{
		UserID: user, TenantScopeID: aikey.TenantScope(servicetenant.TenantIDFromContext(ctx)),
	})
	switch {
	case isNoRows(err):
	case err != nil:
		httpapi.InternalServerError(w, err)
		return
	default:
		k := aikey.SDK(row, benefits, time.Now())
		resp.Key = &k
	}
	resp.ViewsRemainingToday, err = aikey.ViewsRemainingToday(ctx, api.Opts.Zed, user, benefits)
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}
	httpapi.Write(ctx, w, http.StatusOK, resp)
}

// CreateMyAIKey returns the user's working AI key, creating one if there is
// none. The secret is only in the response that created the key; a client
// that no longer has it should rotate.
func (api *API) CreateMyAIKey(w http.ResponseWriter, r *http.Request) {
	api.issueAIKey(w, r, false)
}

// RotateMyAIKey replaces the user's AI key with a new one, so links with the
// old key stop working.
func (api *API) RotateMyAIKey(w http.ResponseWriter, r *http.Request) {
	api.issueAIKey(w, r, true)
}

// RevokeMyAIKey revokes the user's AI key in this community.
func (api *API) RevokeMyAIKey(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	user := chronauth.MustAuthenticatedClaims(ctx).Subject
	n, err := api.Opts.Zed.RevokeAIKeys(ctx, database.RevokeAIKeysParams{
		UserID: user, TenantScopeID: aikey.TenantScope(servicetenant.TenantIDFromContext(ctx)),
	})
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}
	msg := "Your AI key was revoked. Links with it no longer work."
	if n == 0 {
		msg = "You have no AI key to revoke."
	}
	httpapi.Write(ctx, w, http.StatusOK, chroniclesdk.Response{Message: msg})
}

func (api *API) issueAIKey(w http.ResponseWriter, r *http.Request, rotate bool) {
	ctx := r.Context()
	user := chronauth.MustAuthenticatedClaims(ctx).Subject
	tenantID := servicetenant.TenantIDFromContext(ctx)

	var req chroniclesdk.CreateAIKeyRequest
	if err := decodeOptionalJSON(r, &req); err != nil {
		httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{Message: "Request body must be valid JSON.", Detail: err.Error()})
		return
	}
	benefits, err := api.aiKeyBenefits(ctx, user)
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}
	if req.LifetimeHours == 0 {
		req.LifetimeHours = aikey.DefaultLifetimeHours
	}
	if !aikey.AllowsLifetime(benefits, req.LifetimeHours) {
		options := make([]string, len(benefits.LifetimeHours))
		for i, h := range benefits.LifetimeHours {
			options[i] = strconv.Itoa(h)
		}
		httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{
			Message:      "That key lifetime isn't available at your tier.",
			Detail:       fmt.Sprintf("lifetime_hours must be one of %s.", strings.Join(options, ", ")),
			CallToAction: "Supporters can make longer-lived keys.",
			Link:         "/supporter", LinkText: "View supporter perks",
		})
		return
	}
	if req.PrivateData && !benefits.PrivateData {
		httpapi.Write(ctx, w, http.StatusForbidden, chroniclesdk.Response{Message: "Your tier can't give AI keys access to private data."})
		return
	}

	now := time.Now()
	scope := aikey.TenantScope(tenantID)
	var resp chroniclesdk.AIKeySecretResponse
	err = api.Opts.Zed.InTx(ctx, func(tx *authz.AuthzTX) error {
		if !rotate {
			row, err := tx.GetUnrevokedAIKey(ctx, database.GetUnrevokedAIKeyParams{UserID: user, TenantScopeID: scope})
			if err == nil && now.Before(aikey.ExpiresAt(row, benefits)) {
				resp = chroniclesdk.AIKeySecretResponse{Key: aikey.SDK(row, benefits, now)}
				return nil
			}
			if err != nil && !isNoRows(err) {
				return err
			}
		}
		if _, err := tx.RevokeAIKeys(ctx, database.RevokeAIKeysParams{UserID: user, TenantScopeID: scope}); err != nil {
			return err
		}
		secret, err := aikey.Generate()
		if err != nil {
			return err
		}
		row, err := tx.InsertAIKey(ctx, database.InsertAIKeyParams{
			ID: uuid.New(), UserID: user,
			TenantID:     uuid.NullUUID{UUID: tenantID, Valid: tenantID != uuid.Nil},
			HashedSecret: aikey.Hash(secret), PrivateData: req.PrivateData,
			ExpiresAt: database.Timestamptz(now.Add(time.Duration(req.LifetimeHours) * time.Hour)),
		})
		if err != nil {
			return err
		}
		resp = chroniclesdk.AIKeySecretResponse{Key: aikey.SDK(row, benefits, now), Created: true, Secret: secret}
		return nil
	}, nil)
	if database.IsUniqueViolation(err, database.UniqueAiKeysOneUnrevokedPerUserTenant) {
		httpapi.Write(ctx, w, http.StatusConflict, chroniclesdk.Response{Message: "Another request changed your AI key at the same time. Try again."})
		return
	}
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}
	status := http.StatusOK
	if resp.Created {
		status = http.StatusCreated
	}
	// The body may carry the secret.
	w.Header().Set("Cache-Control", "no-store")
	httpapi.Write(ctx, w, status, resp)
}

// decodeOptionalJSON decodes a JSON body; an empty body leaves v unchanged.
func decodeOptionalJSON(r *http.Request, v any) error {
	body, err := io.ReadAll(io.LimitReader(r.Body, 4<<10))
	if err != nil {
		return err
	}
	if len(strings.TrimSpace(string(body))) == 0 {
		return nil
	}
	return json.Unmarshal(body, v)
}
