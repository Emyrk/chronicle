package api

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math"
	"net"
	"net/http"
	"strconv"
	"strings"
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
	InstanceSearchCostHeader        = "Chronicle-Search-Cost"
	InstanceSearchRuntimeCostHeader = "Chronicle-Search-Runtime-Cost"
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
	c := serviceinstancesearch.Caller{TenantID: servicetenant.TenantIDFromContext(r.Context()), IP: instanceSearchClientIP(r)}
	if claims, ok := chronauth.AuthenticatedClaims(r.Context()); ok {
		c.UserID = claims.Subject
	}
	return c
}
func writeSearchResult(w http.ResponseWriter, r *http.Request, result serviceinstancesearch.Result, explain bool) {
	ctx := r.Context()
	if result.Status.Limit != 0 {
		ratelimit.SetHeaders(w, result.Status)
	}
	if result.Cost != 0 {
		w.Header().Set(InstanceSearchCostHeader, strconv.Itoa(result.Cost))
	}
	if result.RuntimeCost != 0 {
		w.Header().Set(InstanceSearchRuntimeCostHeader, strconv.Itoa(result.RuntimeCost))
	}
	if result.Err == nil {
		return
	}
	switch {
	case errors.Is(result.Err, serviceinstancesearch.ErrInvalid):
		httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{Message: "Invalid search.", Detail: strings.TrimPrefix(result.Err.Error(), serviceinstancesearch.ErrInvalid.Error()+"\n")})
	case errors.Is(result.Err, serviceinstancesearch.ErrSupporterRequired):
		tierName := strings.ToUpper(result.RequiredTier[:1]) + result.RequiredTier[1:]
		article := "a"
		if result.RequiredTier == "honored" {
			article = "an"
		}
		httpapi.Write(ctx, w, http.StatusForbidden, chroniclesdk.Response{
			Message:      fmt.Sprintf("Sorting by this property is %s %s supporter perk.", article, tierName),
			CallToAction: fmt.Sprintf("Become %s %s supporter to use this sort order.", article, tierName),
			Link:         "/supporter",
			LinkText:     "View supporter perks",
		})
	case errors.Is(result.Err, serviceinstancesearch.ErrLoginRequired):
		response := chroniclesdk.Response{Message: "Log in to use advanced search.", Detail: strings.TrimPrefix(result.Err.Error(), serviceinstancesearch.ErrLoginRequired.Error()+"\n")}
		if !explain {
			response.CallToAction = "Logged-in users can search by players, specs, parses, kill times and more."
		}
		httpapi.Write(ctx, w, http.StatusForbidden, response)
	case errors.Is(result.Err, serviceinstancesearch.ErrRateLimited), errors.Is(result.Err, serviceinstancesearch.ErrTooComplex):
		retrySeconds := int64(math.Ceil(result.RetryAfter.Seconds()))
		if retrySeconds < 1 || errors.Is(result.Err, serviceinstancesearch.ErrTooComplex) {
			retrySeconds = 1
		}
		w.Header().Set("Retry-After", strconv.FormatInt(retrySeconds, 10))
		msg := "You are searching too quickly. Try again shortly."
		if errors.Is(result.Err, serviceinstancesearch.ErrTooComplex) {
			msg = "This search is too complex. Remove some filters and try again."
		}
		httpapi.Write(ctx, w, http.StatusTooManyRequests, chroniclesdk.Response{Message: msg})
	case errors.Is(result.Err, serviceinstancesearch.ErrBusy):
		w.Header().Set("Retry-After", "1")
		httpapi.Write(ctx, w, http.StatusServiceUnavailable, chroniclesdk.Response{Message: "Search is busy. Try again in a moment."})
	case errors.Is(result.Err, instancesearch.ErrNotFound):
		httpapi.Write(ctx, w, http.StatusNotFound, chroniclesdk.Response{Message: "Run not found."})
	case errors.Is(result.Err, instancesearch.ErrTimeout):
		response := chroniclesdk.Response{Message: "This search took too long.", CallToAction: "Narrow it with a zone, realm or date range."}
		if explain {
			response = chroniclesdk.Response{Message: "Explaining this run took too long."}
		}
		httpapi.Write(ctx, w, http.StatusUnprocessableEntity, response)
	default:
		msg := "Search failed."
		if explain {
			msg = "Explain failed."
		}
		httpapi.Write(ctx, w, http.StatusInternalServerError, chroniclesdk.Response{Message: msg})
	}
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
		writeSearchResult(w, r, result, false)
		return
	}
	writeSearchResult(w, r, result, false)
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
	ex, result := api.instanceSearch.Explain(r.Context(), c, chroniclesdk.InstanceSearchQuery{Where: req.Query.Where, Validity: req.Query.Validity}, req.InstanceID)
	writeSearchResult(w, r, result, true)
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
func instanceSearchClientIP(r *http.Request) string {
	if xff := r.Header.Get("X-Forwarded-For"); xff != "" {
		first, _, _ := strings.Cut(xff, ",")
		return strings.TrimSpace(first)
	}
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return host
}
