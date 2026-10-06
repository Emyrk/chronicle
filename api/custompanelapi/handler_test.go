package custompanelapi

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

const testCommit = "0123456789abcdef0123456789abcdef01234567"

func validManifest() chroniclesdk.CustomPanelManifest {
	return chroniclesdk.CustomPanelManifest{
		SchemaVersion: 1,
		Plugin: chroniclesdk.CustomPanelManifestPlugin{
			ID:          "github:owner/repo",
			Name:        "Raid Tools",
			Version:     "1.0.0",
			Description: "Useful raid panels",
			Homepage:    "https://github.com/owner/repo",
		},
		Host: chroniclesdk.CustomPanelManifestHost{APIVersion: 1},
		Artifacts: chroniclesdk.CustomPanelManifestArtifacts{
			Entry:  "dist/panel.js",
			Worker: "dist/worker.js",
			Styles: "dist/panel.css",
		},
		Panels: []chroniclesdk.CustomPanelManifestPanel{{
			ID:          "raid-cooldowns",
			Name:        "Raid Cooldowns",
			Description: "Cooldown view",
			Streams:     []chroniclesdk.WoWEventType{chroniclesdk.WoWEventTypeSpellGo, chroniclesdk.WoWEventTypeAura},
			Worker:      true,
		}},
	}
}

func githubServer(t *testing.T, manifest chroniclesdk.CustomPanelManifest, mutate func(http.ResponseWriter, *http.Request) bool) *httptest.Server {
	t.Helper()
	manifestJSON, err := json.Marshal(manifest)
	require.NoError(t, err)
	return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if mutate != nil && mutate(w, r) {
			return
		}
		switch {
		case strings.HasPrefix(r.URL.Path, "/api/repos/owner/repo/commits/"):
			if r.Header.Get("Accept") != "application/vnd.github.sha" {
				http.Error(w, "missing compact GitHub SHA media type", http.StatusBadRequest)
				return
			}
			_, _ = w.Write([]byte(testCommit))
		case r.URL.Path == "/raw/owner/repo/"+testCommit+"/chronicle-panel.json":
			_, _ = w.Write(manifestJSON)
		case r.URL.Path == "/raw/owner/repo/"+testCommit+"/dist/panel.js":
			_, _ = w.Write([]byte("export const panel = true;"))
		case r.URL.Path == "/raw/owner/repo/"+testCommit+"/dist/worker.js":
			_, _ = w.Write([]byte("self.onmessage = () => {};"))
		case r.URL.Path == "/raw/owner/repo/"+testCommit+"/dist/panel.css":
			_, _ = w.Write([]byte(":host { color: red; }"))
		default:
			http.NotFound(w, r)
		}
	}))
}

func newTestHandler(server *httptest.Server, timeout time.Duration) *Handler {
	return New(Options{
		HTTPClient:     server.Client(),
		APIBaseURL:     server.URL + "/api",
		RawBaseURL:     server.URL + "/raw",
		RequestTimeout: timeout,
	})
}

func performRequest(handler http.Handler, method, target, body string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(method, target, strings.NewReader(body))
	req.RemoteAddr = "192.0.2.1:1234"
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)
	return rec
}

func TestResolve(t *testing.T) {
	t.Parallel()
	manifest := validManifest()
	server := githubServer(t, manifest, nil)
	defer server.Close()

	handler := newTestHandler(server, time.Second).Routes()
	entryBytes := []byte("export const panel = true;")
	entryHash := sha256.Sum256(entryBytes)

	for _, ref := range []string{"", "main", "feature/custom-panel", "v1.0.0", testCommit} {
		ref := ref
		t.Run(ref, func(t *testing.T) {
			body := fmt.Sprintf(`{"repository":"Owner/Repo","ref":%q}`, ref)
			rec := performRequest(handler, http.MethodPost, "/resolve", body)
			require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
			var response chroniclesdk.CustomPanelResolveResponse
			require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &response))
			assert.Equal(t, "owner/repo", response.Repository)
			assert.Equal(t, testCommit, response.CommitSHA)
			assert.Equal(t, manifest, response.Manifest)
			assert.Equal(t, hex.EncodeToString(entryHash[:]), response.Artifacts.Entry.SHA256)
			assert.Equal(t, int64(len(entryBytes)), response.Artifacts.Entry.Size)
			assert.Equal(t, "/api/v1/custom-panels/github/owner/repo/"+testCommit+"/entry", response.Artifacts.Entry.URL)
			require.NotNil(t, response.Artifacts.Worker)
			require.NotNil(t, response.Artifacts.Styles)
			assert.Len(t, response.ManifestSHA256, 64)
		})
	}
}

func TestResolveRejectsInvalidSourceBeforeGitHub(t *testing.T) {
	t.Parallel()
	var requests atomic.Int32
	server := githubServer(t, validManifest(), func(http.ResponseWriter, *http.Request) bool {
		requests.Add(1)
		return false
	})
	defer server.Close()
	tests := []string{
		`{"repository":"https://github.com/owner/repo","ref":"main"}`,
		`{"repository":"owner/repo/extra","ref":"main"}`,
		`{"repository":"-owner/repo","ref":"main"}`,
		`{"repository":"owner/repo.git","ref":"main"}`,
		`{"repository":"owner/repo","ref":"../main"}`,
		`{"repository":"owner/repo","ref":"feature//bad"}`,
		`{"repository":"owner/repo","ref":"bad ref"}`,
		`{"repository":"owner/repo","ref":"main","extra":true}`,
	}
	for _, body := range tests {
		rec := performRequest(newTestHandler(server, time.Second).Routes(), http.MethodPost, "/resolve", body)
		assert.Equal(t, http.StatusBadRequest, rec.Code, body+": "+rec.Body.String())
	}
	assert.Zero(t, requests.Load())
}

func TestValidateManifest(t *testing.T) {
	t.Parallel()
	tests := []struct {
		name   string
		mutate func(*chroniclesdk.CustomPanelManifest)
	}{
		{"schema version", func(m *chroniclesdk.CustomPanelManifest) { m.SchemaVersion = 2 }},
		{"host API version", func(m *chroniclesdk.CustomPanelManifest) { m.Host.APIVersion = 2 }},
		{"plugin identity", func(m *chroniclesdk.CustomPanelManifest) { m.Plugin.ID = "github:other/repo" }},
		{"invalid panel ID", func(m *chroniclesdk.CustomPanelManifest) { m.Panels[0].ID = "Bad ID" }},
		{"duplicate panel ID", func(m *chroniclesdk.CustomPanelManifest) { m.Panels = append(m.Panels, m.Panels[0]) }},
		{"unknown stream", func(m *chroniclesdk.CustomPanelManifest) {
			m.Panels[0].Streams = []chroniclesdk.WoWEventType{"unknown"}
		}},
		{"uppercase stream", func(m *chroniclesdk.CustomPanelManifest) { m.Panels[0].Streams = []chroniclesdk.WoWEventType{"AURA"} }},
		{"worker missing", func(m *chroniclesdk.CustomPanelManifest) { m.Artifacts.Worker = "" }},
		{"path traversal", func(m *chroniclesdk.CustomPanelManifest) { m.Artifacts.Entry = "dist/../panel.js" }},
		{"absolute path", func(m *chroniclesdk.CustomPanelManifest) { m.Artifacts.Entry = "/panel.js" }},
		{"path query", func(m *chroniclesdk.CustomPanelManifest) { m.Artifacts.Entry = "panel.js?raw=1" }},
		{"bad homepage host", func(m *chroniclesdk.CustomPanelManifest) { m.Plugin.Homepage = "https://example.com/owner/repo" }},
		{"too many panels", func(m *chroniclesdk.CustomPanelManifest) {
			for len(m.Panels) <= maxPanels {
				panel := m.Panels[0]
				panel.ID = fmt.Sprintf("panel-%d", len(m.Panels))
				m.Panels = append(m.Panels, panel)
			}
		}},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			manifest := validManifest()
			tc.mutate(&manifest)
			assert.Error(t, validateManifest("owner/repo", &manifest))
		})
	}
	assert.NoError(t, validateManifest("owner/repo", ptr(validManifest())))
}

func ptr[T any](value T) *T { return &value }

func TestResolveRejectsInvalidAndOversizedContent(t *testing.T) {
	t.Parallel()
	tests := []struct {
		name       string
		mutate     func(http.ResponseWriter, *http.Request) bool
		wantStatus int
	}{
		{
			name: "invalid manifest JSON",
			mutate: func(w http.ResponseWriter, r *http.Request) bool {
				if strings.HasSuffix(r.URL.Path, manifestFilename) {
					_, _ = w.Write([]byte("{"))
					return true
				}
				return false
			},
			wantStatus: http.StatusUnprocessableEntity,
		},
		{
			name: "oversized manifest streamed",
			mutate: func(w http.ResponseWriter, r *http.Request) bool {
				if strings.HasSuffix(r.URL.Path, manifestFilename) {
					w.(http.Flusher).Flush()
					_, _ = w.Write([]byte(strings.Repeat("x", maxManifestSize+1)))
					return true
				}
				return false
			},
			wantStatus: http.StatusRequestEntityTooLarge,
		},
		{
			name: "oversized entry streamed",
			mutate: func(w http.ResponseWriter, r *http.Request) bool {
				if strings.HasSuffix(r.URL.Path, "/dist/panel.js") {
					w.(http.Flusher).Flush()
					_, _ = w.Write([]byte(strings.Repeat("x", maxEntrySize+1)))
					return true
				}
				return false
			},
			wantStatus: http.StatusRequestEntityTooLarge,
		},
		{
			name: "upstream error",
			mutate: func(w http.ResponseWriter, r *http.Request) bool {
				if strings.Contains(r.URL.Path, "/commits/") {
					http.Error(w, "boom", http.StatusInternalServerError)
					return true
				}
				return false
			},
			wantStatus: http.StatusBadGateway,
		},
		{
			name: "not found",
			mutate: func(w http.ResponseWriter, r *http.Request) bool {
				if strings.Contains(r.URL.Path, "/commits/") {
					http.NotFound(w, r)
					return true
				}
				return false
			},
			wantStatus: http.StatusNotFound,
		},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			server := githubServer(t, validManifest(), tc.mutate)
			defer server.Close()
			rec := performRequest(newTestHandler(server, time.Second).Routes(), http.MethodPost, "/resolve", `{"repository":"owner/repo","ref":"main"}`)
			assert.Equal(t, tc.wantStatus, rec.Code, rec.Body.String())
		})
	}
}

func TestArtifact(t *testing.T) {
	t.Parallel()
	server := githubServer(t, validManifest(), nil)
	defer server.Close()
	handler := newTestHandler(server, time.Second).Routes()
	base := "/github/owner/repo/" + testCommit + "/"

	for _, tc := range []struct {
		name        string
		contentType string
		body        string
	}{
		{"entry", "text/javascript; charset=utf-8", "export const panel = true;"},
		{"worker", "text/javascript; charset=utf-8", "self.onmessage = () => {};"},
		{"styles", "text/css; charset=utf-8", ":host { color: red; }"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			rec := performRequest(handler, http.MethodGet, base+tc.name, "")
			require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
			assert.Equal(t, tc.contentType, rec.Header().Get("Content-Type"))
			assert.Equal(t, "nosniff", rec.Header().Get("X-Content-Type-Options"))
			assert.Equal(t, "public, max-age=31536000, immutable", rec.Header().Get("Cache-Control"))
			assert.Regexp(t, `^"sha256-[0-9a-f]{64}"$`, rec.Header().Get("ETag"))
			assert.Equal(t, tc.body, rec.Body.String())
		})
	}

	first := performRequest(handler, http.MethodGet, base+"entry", "")
	req := httptest.NewRequest(http.MethodGet, base+"entry", nil)
	req.Header.Set("If-None-Match", first.Header().Get("ETag"))
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)
	assert.Equal(t, http.StatusNotModified, rec.Code)
	assert.Empty(t, rec.Body.String())
}

func TestArtifactRejectsInvalidOrUndeclaredRequests(t *testing.T) {
	t.Parallel()
	manifest := validManifest()
	manifest.Artifacts.Worker = ""
	manifest.Panels[0].Worker = false
	server := githubServer(t, manifest, nil)
	defer server.Close()
	handler := newTestHandler(server, time.Second).Routes()

	tests := []struct {
		path string
		code int
	}{
		{"/github/owner/repo/not-a-sha/entry", http.StatusBadRequest},
		{"/github/owner/repo/" + strings.ToUpper(testCommit) + "/entry", http.StatusBadRequest},
		{"/github/owner/repo/" + testCommit + "/worker", http.StatusNotFound},
		{"/github/owner/repo/" + testCommit + "/manifest", http.StatusNotFound},
		{"/github/bad_owner/repo/" + testCommit + "/entry", http.StatusBadRequest},
	}
	for _, tc := range tests {
		rec := performRequest(handler, http.MethodGet, tc.path, "")
		assert.Equal(t, tc.code, rec.Code, tc.path+": "+rec.Body.String())
	}
}

func TestRejectsRedirectToUnapprovedHost(t *testing.T) {
	t.Parallel()
	evil := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		t.Fatal("redirect target must not be requested")
	}))
	defer evil.Close()
	server := githubServer(t, validManifest(), func(w http.ResponseWriter, r *http.Request) bool {
		if strings.Contains(r.URL.Path, "/commits/") {
			http.Redirect(w, r, evil.URL+"/steal", http.StatusFound)
			return true
		}
		return false
	})
	defer server.Close()

	rec := performRequest(newTestHandler(server, time.Second).Routes(), http.MethodPost, "/resolve", `{"repository":"owner/repo","ref":"main"}`)
	assert.Equal(t, http.StatusBadGateway, rec.Code, rec.Body.String())
}

func TestGitHubTimeout(t *testing.T) {
	t.Parallel()
	server := githubServer(t, validManifest(), func(w http.ResponseWriter, r *http.Request) bool {
		if strings.Contains(r.URL.Path, "/commits/") {
			select {
			case <-r.Context().Done():
			case <-time.After(time.Second):
			}
			return true
		}
		return false
	})
	defer server.Close()

	rec := performRequest(newTestHandler(server, 20*time.Millisecond).Routes(), http.MethodPost, "/resolve", `{"repository":"owner/repo","ref":"main"}`)
	assert.Equal(t, http.StatusGatewayTimeout, rec.Code, rec.Body.String())
}

func TestClientIPTrustsOnlyPrivateProxies(t *testing.T) {
	t.Parallel()

	direct := httptest.NewRequest(http.MethodGet, "/", nil)
	direct.RemoteAddr = "192.0.2.10:1234"
	direct.Header.Set("X-Forwarded-For", "198.51.100.99")
	assert.Equal(t, "192.0.2.10", clientIP(direct))

	proxied := httptest.NewRequest(http.MethodGet, "/", nil)
	proxied.RemoteAddr = "10.0.0.2:1234"
	proxied.Header.Set("X-Forwarded-For", "198.51.100.99, 203.0.113.15")
	assert.Equal(t, "203.0.113.15", clientIP(proxied))
}

func TestResolveRateLimit(t *testing.T) {
	t.Parallel()
	h := New(Options{})
	h.resolveLimiter = newIPLimiter(rateLimitNeverRefills, 1, 4)
	handler := h.Routes()

	first := performRequest(handler, http.MethodPost, "/resolve", `{"repository":"bad","ref":"main"}`)
	assert.Equal(t, http.StatusBadRequest, first.Code)
	second := performRequest(handler, http.MethodPost, "/resolve", `{"repository":"bad","ref":"main"}`)
	assert.Equal(t, http.StatusTooManyRequests, second.Code)
	assert.Equal(t, "12", second.Header().Get("Retry-After"))
}

const rateLimitNeverRefills = 1e-9

func TestRequestContextCancellationMapsToTimeout(t *testing.T) {
	t.Parallel()
	client := &http.Client{Transport: roundTripperFunc(func(req *http.Request) (*http.Response, error) {
		<-req.Context().Done()
		return nil, req.Context().Err()
	})}
	h := New(Options{HTTPClient: client, RequestTimeout: 20 * time.Millisecond})
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Millisecond)
	defer cancel()
	_, err := h.resolveRef(ctx, "owner", "repo", "main")
	var apiErr *apiError
	require.ErrorAs(t, err, &apiErr)
	assert.Equal(t, http.StatusGatewayTimeout, apiErr.status)
}

type roundTripperFunc func(*http.Request) (*http.Response, error)

func (f roundTripperFunc) RoundTrip(req *http.Request) (*http.Response, error) { return f(req) }
