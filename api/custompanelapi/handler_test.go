package custompanelapi

import (
	"context"
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
			Entry:  chroniclesdk.CustomPanelManifestArtifact{Path: "dist/panel.js", SHA256: strings.Repeat("a", 64), Size: 25},
			Worker: ptr(chroniclesdk.CustomPanelManifestArtifact{Path: "dist/worker.js", SHA256: strings.Repeat("b", 64), Size: 26}),
			Styles: ptr(chroniclesdk.CustomPanelManifestArtifact{Path: "dist/panel.css", SHA256: strings.Repeat("c", 64), Size: 21}),
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

func validInstallation() chroniclesdk.CustomPanelInstallation {
	digest := strings.Repeat("a", 64)
	manifest := validManifest()
	artifacts := ArtifactSet("owner/repo", testCommit, manifest.Artifacts)
	return chroniclesdk.CustomPanelInstallation{
		Repository:     "owner/repo",
		CommitSHA:      testCommit,
		InstalledRef:   "main",
		Manifest:       manifest,
		ManifestSHA256: digest,
		Artifacts:      artifacts,
		Enabled:        true,
		InstalledAt:    "2026-10-06T00:00:00Z",
		UpdatedAt:      "2026-10-06T00:00:00Z",
	}
}

func TestValidateStoredInstallation(t *testing.T) {
	t.Parallel()
	installation := validInstallation()
	require.NoError(t, ValidateStoredInstallation(installation))

	installation.Artifacts.Entry.URL = "https://evil.example/panel.js"
	require.Error(t, ValidateStoredInstallation(installation))
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
	var artifactRequests atomic.Int32
	server := githubServer(t, manifest, func(w http.ResponseWriter, r *http.Request) bool {
		if strings.Contains(r.URL.Path, "/dist/") {
			artifactRequests.Add(1)
			http.Error(w, "artifacts must not be fetched", http.StatusInternalServerError)
			return true
		}
		return false
	})
	defer server.Close()

	handler := newTestHandler(server, time.Second).Routes()
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
			assert.Equal(t, manifest.Artifacts.Entry.SHA256, response.Artifacts.Entry.SHA256)
			assert.Equal(t, manifest.Artifacts.Entry.Size, response.Artifacts.Entry.Size)
			assert.Equal(t, "https://raw.githubusercontent.com/owner/repo/"+testCommit+"/dist/panel.js", response.Artifacts.Entry.URL)
			require.NotNil(t, response.Artifacts.Worker)
			require.NotNil(t, response.Artifacts.Styles)
			assert.Len(t, response.ManifestSHA256, 64)
		})
	}
	assert.Zero(t, artifactRequests.Load())
}

func TestResolveReleaseFetchesOnlyPinnedManifest(t *testing.T) {
	t.Parallel()
	var commitRequests atomic.Int32
	var artifactRequests atomic.Int32
	server := githubServer(t, validManifest(), func(w http.ResponseWriter, r *http.Request) bool {
		if strings.Contains(r.URL.Path, "/commits/") {
			commitRequests.Add(1)
		}
		if strings.Contains(r.URL.Path, "/dist/") {
			artifactRequests.Add(1)
		}
		return false
	})
	defer server.Close()

	response, err := newTestHandler(server, time.Second).ResolveRelease(context.Background(), "owner/repo", testCommit)
	require.NoError(t, err)
	require.Equal(t, testCommit, response.CommitSHA)
	require.Zero(t, commitRequests.Load())
	require.Zero(t, artifactRequests.Load())
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
		{"panel description too long", func(m *chroniclesdk.CustomPanelManifest) {
			m.Panels[0].Description = strings.Repeat("x", maxPanelDescription+1)
		}},
		{"invalid panel ID", func(m *chroniclesdk.CustomPanelManifest) { m.Panels[0].ID = "Bad ID" }},
		{"duplicate panel ID", func(m *chroniclesdk.CustomPanelManifest) { m.Panels = append(m.Panels, m.Panels[0]) }},
		{"unknown stream", func(m *chroniclesdk.CustomPanelManifest) {
			m.Panels[0].Streams = []chroniclesdk.WoWEventType{"unknown"}
		}},
		{"uppercase stream", func(m *chroniclesdk.CustomPanelManifest) { m.Panels[0].Streams = []chroniclesdk.WoWEventType{"AURA"} }},
		{"worker missing", func(m *chroniclesdk.CustomPanelManifest) { m.Artifacts.Worker = nil }},
		{"path traversal", func(m *chroniclesdk.CustomPanelManifest) { m.Artifacts.Entry.Path = "dist/../panel.js" }},
		{"absolute path", func(m *chroniclesdk.CustomPanelManifest) { m.Artifacts.Entry.Path = "/panel.js" }},
		{"path query", func(m *chroniclesdk.CustomPanelManifest) { m.Artifacts.Entry.Path = "panel.js?raw=1" }},
		{"uppercase digest", func(m *chroniclesdk.CustomPanelManifest) { m.Artifacts.Entry.SHA256 = strings.Repeat("A", 64) }},
		{"negative size", func(m *chroniclesdk.CustomPanelManifest) { m.Artifacts.Entry.Size = -1 }},
		{"oversized entry declaration", func(m *chroniclesdk.CustomPanelManifest) { m.Artifacts.Entry.Size = maxEntrySize + 1 }},
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
	withoutDescription := validManifest()
	withoutDescription.Panels[0].Description = ""
	assert.NoError(t, validateManifest("owner/repo", &withoutDescription))
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
