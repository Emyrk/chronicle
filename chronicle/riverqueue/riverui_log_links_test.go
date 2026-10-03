package riverqueue

import (
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestWithLogLinksInjectsScript(t *testing.T) {
	t.Parallel()

	const original = "<!doctype html><html><head><title>River</title></head><body></body></html>"
	handler := withLogLinks(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		w.Header().Set("X-River", "yes")
		w.Header().Set("Content-Length", strconv.Itoa(len(original)))
		w.WriteHeader(http.StatusAccepted)
		_, _ = w.Write([]byte(original))
	}))

	req := httptest.NewRequest(http.MethodGet, "/river/jobs/?state=cancelled", nil)
	req.Header.Set("Accept", "text/html")
	resp := httptest.NewRecorder()
	handler.ServeHTTP(resp, req)

	require.Equal(t, http.StatusAccepted, resp.Code)
	require.Equal(t, "yes", resp.Header().Get("X-River"))
	require.Equal(t, strconv.Itoa(resp.Body.Len()), resp.Header().Get("Content-Length"))
	require.Contains(t, resp.Body.String(), `<script src="/river/chronicle-log-links.js"></script></head>`)
}

func TestWithLogLinksServesScript(t *testing.T) {
	t.Parallel()

	nextCalled := false
	handler := withLogLinks(http.HandlerFunc(func(http.ResponseWriter, *http.Request) {
		nextCalled = true
	}))

	req := httptest.NewRequest(http.MethodGet, riverLogLinksScriptPath, nil)
	resp := httptest.NewRecorder()
	handler.ServeHTTP(resp, req)

	require.False(t, nextCalled)
	require.Equal(t, http.StatusOK, resp.Code)
	require.Equal(t, "text/javascript; charset=utf-8", resp.Header().Get("Content-Type"))
	require.Equal(t, strconv.Itoa(len(riverLogLinksScript)), resp.Header().Get("Content-Length"))
	require.Equal(t, string(riverLogLinksScript), resp.Body.String())
}

func TestWithLogLinksLeavesNonHTMLResponsesAlone(t *testing.T) {
	t.Parallel()

	const body = `{"data":[]}`
	handler := withLogLinks(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusCreated)
		_, _ = w.Write([]byte(body))
	}))

	req := httptest.NewRequest(http.MethodGet, "/river/api/jobs", nil)
	req.Header.Set("Accept", "application/json")
	resp := httptest.NewRecorder()
	handler.ServeHTTP(resp, req)

	require.Equal(t, http.StatusCreated, resp.Code)
	require.Equal(t, "application/json", resp.Header().Get("Content-Type"))
	require.Equal(t, body, strings.TrimSpace(resp.Body.String()))
}
