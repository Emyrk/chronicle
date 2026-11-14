package api

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math"
	"net/http"
	"strconv"

	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/api/httpapi"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/internal/billing"
	"github.com/Emyrk/chronicle/internal/ratelimit"
	"github.com/Emyrk/chronicle/internal/services/servicedataset"
	"github.com/Emyrk/chronicle/internal/services/serviceinstancesearch"
	"github.com/Emyrk/chronicle/internal/services/servicetenant"
	"github.com/Emyrk/chronicle/internal/spellsearch"
	"github.com/google/uuid"
)

const spellSearchMaxBody = 64 << 10

func spellSearchDatasetID(r *http.Request) (uuid.UUID, error) {
	if raw := r.URL.Query().Get("dataset_id"); raw != "" {
		return uuid.Parse(raw)
	}
	if tenant := servicetenant.TenantFromContext(r.Context()); tenant != nil && tenant.DefaultDatasetID.Valid {
		return tenant.DefaultDatasetID.UUID, nil
	}
	return servicedataset.DefaultDatasetID, nil
}

func writeSpellSearchResult(w http.ResponseWriter, r *http.Request, result serviceinstancesearch.Result) {
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
	case errors.Is(result.Err, serviceinstancesearch.ErrSupporterRequired):
		httpapi.Write(ctx, w, http.StatusForbidden, chroniclesdk.Response{
			Message:      "Advanced spell search is a Revered supporter perk.",
			CallToAction: "Become a Revered supporter to search spell effects, attributes, and power costs.",
			Link:         "/supporter", LinkText: "View supporter perks",
		})
	case errors.Is(result.Err, serviceinstancesearch.ErrRateLimited), errors.Is(result.Err, serviceinstancesearch.ErrTooComplex):
		retrySeconds := int64(math.Ceil(result.RetryAfter.Seconds()))
		if retrySeconds < 1 || errors.Is(result.Err, serviceinstancesearch.ErrTooComplex) {
			retrySeconds = 1
		}
		w.Header().Set("Retry-After", strconv.FormatInt(retrySeconds, 10))
		message := "You are searching too quickly. Try again shortly."
		if errors.Is(result.Err, serviceinstancesearch.ErrTooComplex) {
			message = "This search is too complex. Remove some filters and try again."
		}
		httpapi.Write(ctx, w, http.StatusTooManyRequests, chroniclesdk.Response{Message: message})
	case errors.Is(result.Err, serviceinstancesearch.ErrBusy):
		w.Header().Set("Retry-After", "1")
		httpapi.Write(ctx, w, http.StatusServiceUnavailable, chroniclesdk.Response{Message: "Search is busy. Try again in a moment."})
	case errors.Is(result.Err, spellsearch.ErrTimeout):
		httpapi.Write(ctx, w, http.StatusUnprocessableEntity, chroniclesdk.Response{Message: "This search took too long.", CallToAction: "Narrow it with more spell, effect, or power filters."})
	default:
		httpapi.Write(ctx, w, http.StatusInternalServerError, chroniclesdk.Response{Message: "Search failed."})
	}
}

func (api *API) SpellSearch(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	datasetID, err := spellSearchDatasetID(r)
	if err != nil {
		httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{Message: "Invalid dataset_id", Detail: err.Error()})
		return
	}
	w.Header().Set(httpapi.DatasetHeader, datasetID.String())
	caller := instanceSearchCaller(r)
	var query chroniclesdk.SpellSearchRequest
	decoder := json.NewDecoder(io.LimitReader(r.Body, spellSearchMaxBody))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&query); err != nil {
		if status, _, peekErr := api.instanceSearch.Peek(ctx, caller); peekErr == nil {
			ratelimit.SetHeaders(w, status)
		}
		httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{Message: "Request body must be valid JSON.", Detail: err.Error()})
		return
	}
	compiled, err := spellsearch.Compile(datasetID, query, spellsearch.Options{})
	if err != nil {
		if status, _, peekErr := api.instanceSearch.Peek(ctx, caller); peekErr == nil {
			ratelimit.SetHeaders(w, status)
		}
		httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{Message: "Invalid search.", Detail: err.Error()})
		return
	}
	value, admission := api.instanceSearch.ExecuteAdvanced(ctx, caller, billing.TierRevered, compiled.Cost, compiled.Fields, func(runCtx context.Context, store database.Store) (any, error) {
		return spellsearch.Search(runCtx, store, compiled, spellsearch.SearchOptions{})
	})
	writeSpellSearchResult(w, r, admission)
	if admission.Err != nil {
		return
	}
	page, ok := value.(spellsearch.Page)
	if !ok {
		httpapi.Write(ctx, w, http.StatusInternalServerError, chroniclesdk.Response{Message: "Search failed.", Detail: fmt.Sprintf("unexpected result type %T", value)})
		return
	}
	httpapi.Write(ctx, w, http.StatusOK, page)
}

func (api *API) SpellSearchLimit(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	datasetID, err := spellSearchDatasetID(r)
	if err != nil {
		httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{Message: "Invalid dataset_id", Detail: err.Error()})
		return
	}
	w.Header().Set(httpapi.DatasetHeader, datasetID.String())
	caller := instanceSearchCaller(r)
	status, access, err := api.instanceSearch.PeekAccess(ctx, caller)
	if err != nil {
		httpapi.Write(ctx, w, http.StatusInternalServerError, chroniclesdk.Response{Message: "Search is unavailable right now."})
		return
	}
	ratelimit.SetHeaders(w, status)
	httpapi.Write(ctx, w, http.StatusOK, chroniclesdk.SpellSearchLimitResponse{
		LoggedIn:     caller.UserID != uuid.Nil,
		Allowed:      caller.UserID != uuid.Nil && serviceinstancesearch.TierAtLeast(access.Tier, billing.TierRevered),
		RequiredTier: billing.TierRevered,
		Limit:        status.Limit, Remaining: status.Remaining,
		RefillPerMinute: access.Limit.PerSecond * 60,
		ResetSeconds:    int64(math.Ceil(status.Reset.Seconds())),
	})
}
