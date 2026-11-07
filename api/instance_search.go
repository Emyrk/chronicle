package api

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"math"
	"net/http"
	"time"

	"github.com/Emyrk/chronicle/api/chronauth"
	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/api/httpapi"
	"github.com/Emyrk/chronicle/database/authz"
	"github.com/Emyrk/chronicle/database/authz/policy"
	"github.com/Emyrk/chronicle/internal/instancesearch"
	"github.com/Emyrk/chronicle/internal/ratelimit"
	"github.com/Emyrk/chronicle/internal/services/serviceinstancesearch"
	"github.com/Emyrk/chronicle/internal/services/servicetenant"
	"github.com/google/uuid"
)

const (
	InstanceSearchCostHeader        = serviceinstancesearch.CostHeader
	InstanceSearchRuntimeCostHeader = serviceinstancesearch.RuntimeCostHeader
)
const instanceSearchMaxBody = 64 << 10

func newInstanceSearchUserLimitResolver(zed *authz.Authz) serviceinstancesearch.UserAccessResolver {
	return func(ctx context.Context, user uuid.UUID) (serviceinstancesearch.UserAccess, error) {
		actor := policy.New().User(user)
		chronicle := policy.New().GlobalChronicle()
		permissions, err := zed.Check(ctx, nil, chronicle.CanHas_exalted_User(actor), chronicle.CanHas_revered_User(actor), chronicle.CanHas_honored_User(actor))
		if err != nil {
			return serviceinstancesearch.UserAccess{}, err
		}
		if len(permissions) != 3 {
			return serviceinstancesearch.UserAccess{}, errors.New("check instance search supporter tier: expected 3 permission results")
		}
		return serviceinstancesearch.AccessForTier(highestSupporterTier(permissions[0], permissions[1], permissions[2])), nil
	}
}
func instanceSearchCaller(r *http.Request) serviceinstancesearch.Caller {
	c := serviceinstancesearch.Caller{TenantID: servicetenant.TenantIDFromContext(r.Context()), IP: serviceinstancesearch.ClientIP(r)}
	if claims, ok := chronauth.AuthenticatedClaims(r.Context()); ok {
		c.UserID = claims.Subject
	}
	return c
}

// invalidSearchBody resolves the caller before rejecting malformed JSON, as
// the original HTTP adapter did. A failed bucket peek only omits headers.
func (api *API) invalidSearchBody(w http.ResponseWriter, r *http.Request, c serviceinstancesearch.Caller, bodyErr error, explain bool, start time.Time) {
	if err := api.instanceSearch.ResolveCaller(r.Context(), c); err != nil {
		httpapi.Write(r.Context(), w, http.StatusInternalServerError, chroniclesdk.Response{Message: "Search is unavailable right now."})
		return
	}
	api.instanceSearch.ObserveInvalidBody(c, explain, start)
	if st, _, err := api.instanceSearch.Peek(r.Context(), c); err == nil {
		ratelimit.SetHeaders(w, st)
	}
	httpapi.Write(r.Context(), w, http.StatusBadRequest, chroniclesdk.Response{Message: "Request body must be valid JSON.", Detail: bodyErr.Error()})
}

func (api *API) InstanceSearch(w http.ResponseWriter, r *http.Request) {
	start := time.Now()
	c := instanceSearchCaller(r)
	var q chroniclesdk.InstanceSearchQuery
	if err := json.NewDecoder(io.LimitReader(r.Body, instanceSearchMaxBody)).Decode(&q); err != nil {
		api.invalidSearchBody(w, r, c, err, false, start)
		return
	}
	page, result := api.instanceSearch.Search(r.Context(), c, q)
	if result.Err != nil {
		serviceinstancesearch.WriteResult(w, r, result, false)
		return
	}
	serviceinstancesearch.WriteResult(w, r, result, false)
	httpapi.Write(r.Context(), w, http.StatusOK, page)
}
func (api *API) InstanceSearchExplain(w http.ResponseWriter, r *http.Request) {
	start := time.Now()
	c := instanceSearchCaller(r)
	var req chroniclesdk.InstanceSearchExplainRequest
	if err := json.NewDecoder(io.LimitReader(r.Body, instanceSearchMaxBody)).Decode(&req); err != nil {
		api.invalidSearchBody(w, r, c, err, true, start)
		return
	}
	ex, result := api.instanceSearch.Explain(r.Context(), c, chroniclesdk.InstanceSearchQuery{Where: req.Query.Where}, req.InstanceID)
	serviceinstancesearch.WriteResult(w, r, result, true)
	if result.Err == nil {
		httpapi.Write(r.Context(), w, http.StatusOK, ex)
	}
}
func (api *API) InstanceSearchLimit(w http.ResponseWriter, r *http.Request) {
	c := instanceSearchCaller(r)
	st, limit, err := api.instanceSearch.Peek(r.Context(), c)
	if err != nil {
		httpapi.Write(r.Context(), w, http.StatusInternalServerError, chroniclesdk.Response{Message: "Search is unavailable right now."})
		return
	}
	ratelimit.SetHeaders(w, st)
	httpapi.Write(r.Context(), w, http.StatusOK, chroniclesdk.InstanceSearchLimitResponse{LoggedIn: c.UserID != uuid.Nil, Limit: st.Limit, Remaining: st.Remaining, RefillPerMinute: limit.PerSecond * 60, ResetSeconds: int64(math.Ceil(st.Reset.Seconds()))})
}
func (api *API) InstanceSearchFields(w http.ResponseWriter, r *http.Request) {
	httpapi.Write(r.Context(), w, http.StatusOK, instancesearch.Describe())
}
