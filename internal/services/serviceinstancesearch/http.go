package serviceinstancesearch

import (
	"errors"
	"fmt"
	"math"
	"net"
	"net/http"
	"strconv"
	"strings"

	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/api/httpapi"
	"github.com/Emyrk/chronicle/internal/instancesearch"
	"github.com/Emyrk/chronicle/internal/ratelimit"
)

// Response headers reporting what a search charged.
const (
	CostHeader        = "Chronicle-Search-Cost"
	RuntimeCostHeader = "Chronicle-Search-Runtime-Cost"
)

// WriteResult writes the headers and, on failure, the error response for a
// search or explain result. On success it writes headers only; the caller
// writes the body.
func WriteResult(w http.ResponseWriter, r *http.Request, result Result, explain bool) {
	ctx := r.Context()
	if result.Status.Limit != 0 {
		ratelimit.SetHeaders(w, result.Status)
	}
	if result.Cost != 0 {
		w.Header().Set(CostHeader, strconv.Itoa(result.Cost))
	}
	if result.RuntimeCost != 0 {
		w.Header().Set(RuntimeCostHeader, strconv.Itoa(result.RuntimeCost))
	}
	if result.Err == nil {
		return
	}
	switch {
	case errors.Is(result.Err, ErrInvalid):
		httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{Message: "Invalid search.", Detail: strings.TrimPrefix(result.Err.Error(), ErrInvalid.Error()+"\n")})
	case errors.Is(result.Err, ErrSupporterRequired):
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
	case errors.Is(result.Err, ErrLoginRequired):
		response := chroniclesdk.Response{Message: "Log in to use advanced search.", Detail: strings.TrimPrefix(result.Err.Error(), ErrLoginRequired.Error()+"\n")}
		if !explain {
			response.CallToAction = "Logged-in users can search by players, specs, parses, kill times and more."
		}
		httpapi.Write(ctx, w, http.StatusForbidden, response)
	case errors.Is(result.Err, ErrRateLimited), errors.Is(result.Err, ErrTooComplex):
		retrySeconds := int64(math.Ceil(result.RetryAfter.Seconds()))
		if retrySeconds < 1 || errors.Is(result.Err, ErrTooComplex) {
			retrySeconds = 1
		}
		w.Header().Set("Retry-After", strconv.FormatInt(retrySeconds, 10))
		msg := "You are searching too quickly. Try again shortly."
		if errors.Is(result.Err, ErrTooComplex) {
			msg = "This search is too complex. Remove some filters and try again."
		}
		httpapi.Write(ctx, w, http.StatusTooManyRequests, chroniclesdk.Response{Message: msg})
	case errors.Is(result.Err, ErrBusy):
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

// ClientIP is the anonymous bucket subject: the first X-Forwarded-For hop,
// else the peer address.
func ClientIP(r *http.Request) string {
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
