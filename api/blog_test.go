package api

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/internal/ratelimit"
	"github.com/Emyrk/chronicle/internal/services/serviceblog"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

func TestBlogRateLimitResponse(t *testing.T) {
	t.Parallel()
	w := httptest.NewRecorder()
	r := httptest.NewRequest(http.MethodPut, "/", nil)
	blogError(w, r, &serviceblog.RateLimited{Result: ratelimit.Result{RetryAfter: 1200 * time.Second, Status: ratelimit.Status{Limit: 5}}})
	require.Equal(t, http.StatusTooManyRequests, w.Code)
	require.Equal(t, "1200", w.Header().Get("Retry-After"))
	require.Equal(t, "5", w.Header().Get("RateLimit-Limit"))
	var response chroniclesdk.Response
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &response))
	require.NotEmpty(t, response.Message)
}

type blogPublicStore struct{ serviceblog.Store }

func (blogPublicStore) Votes(context.Context, string, uuid.UUID) (serviceblog.Votes, error) {
	return serviceblog.Votes{Up: 3, Down: 9}, nil
}
func (blogPublicStore) PublicFeedback(context.Context, string) ([]serviceblog.Feedback, error) {
	return []serviceblog.Feedback{{ID: uuid.New(), UserID: uuid.New(), TenantID: uuid.New(), Body: "hello", Status: "approved", Consent: true}}, nil
}
func TestBlogPublicProjection(t *testing.T) {
	t.Parallel()
	a := &API{blog: serviceblog.New(serviceblog.Options{Store: blogPublicStore{}, Eligible: func(context.Context, string, string) (bool, error) { return true, nil }})}
	w := httptest.NewRecorder()
	a.GetBlogInteractions(w, httptest.NewRequest(http.MethodGet, "/", nil))
	require.Equal(t, http.StatusOK, w.Code)
	var out map[string]json.RawMessage
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &out))
	require.NotContains(t, out, "down_votes")
	require.NotContains(t, out, "own_feedback")
	var feedback []map[string]json.RawMessage
	require.NoError(t, json.Unmarshal(out["feedback"], &feedback))
	require.Len(t, feedback, 1)
	require.Len(t, feedback[0], 3)
	require.Contains(t, feedback[0], "id")
	require.Contains(t, feedback[0], "body")
	require.Contains(t, feedback[0], "server_relation")
	require.Equal(t, "private, no-store", w.Header().Get("Cache-Control"))
}
