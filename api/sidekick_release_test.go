package api

import (
	"context"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/stretchr/testify/require"
)

const sidekickReleaseFixture = `{
  "tag_name": "v0.3.0",
  "html_url": "https://github.com/Emyrk/chronicle-sidekick/releases/tag/v0.3.0",
  "published_at": "2026-10-20T12:00:00Z",
  "assets": [
    {"name": "checksums.txt", "size": 300, "browser_download_url": "https://example.test/checksums.txt"},
    {"name": "Chronicle-Sidekick-linux-amd64.tar.gz", "size": 4000000, "digest": "sha256:cc", "browser_download_url": "https://example.test/linux.tar.gz"},
    {"name": "Chronicle-Sidekick-windows-amd64.exe", "size": 9000000, "digest": "sha256:bb", "browser_download_url": "https://example.test/windows.exe"},
    {"name": "Chronicle-Sidekick-macos.zip", "size": 12000000, "digest": "sha256:aa", "browser_download_url": "https://example.test/macos.zip"}
  ]
}`

func TestSidekickReleaseCache(t *testing.T) {
	t.Parallel()

	t.Run("maps assets and caches", func(t *testing.T) {
		t.Parallel()
		var calls atomic.Int32
		gh := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
			calls.Add(1)
			_, _ = w.Write([]byte(sidekickReleaseFixture))
		}))
		t.Cleanup(gh.Close)

		cache := &sidekickReleaseCache{apiURL: gh.URL}
		release := cache.get(context.Background())
		require.True(t, release.Available)
		require.Equal(t, "v0.3.0", release.Version)
		require.Len(t, release.Assets, 3)
		require.Equal(t, "macos", release.Assets[0].OS)
		require.Equal(t, "aa", release.Assets[0].SHA256)
		require.Equal(t, "https://example.test/macos.zip", release.Assets[0].URL)
		require.Equal(t, "windows", release.Assets[1].OS)
		require.Equal(t, "linux", release.Assets[2].OS)

		cache.get(context.Background())
		require.EqualValues(t, 1, calls.Load(), "second read within the TTL is served from cache")

		cache.mu.Lock()
		cache.fetchedAt = time.Now().Add(-sidekickReleaseTTL)
		cache.mu.Unlock()
		cache.get(context.Background())
		require.EqualValues(t, 2, calls.Load(), "an expired entry refetches")
	})

	t.Run("no release yet", func(t *testing.T) {
		t.Parallel()
		gh := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
			http.NotFound(w, nil)
		}))
		t.Cleanup(gh.Close)

		release := (&sidekickReleaseCache{apiURL: gh.URL}).get(context.Background())
		require.False(t, release.Available)
		require.Equal(t, sidekickReleasesURL, release.ReleasesURL)
	})

	t.Run("keeps stale value on error", func(t *testing.T) {
		t.Parallel()
		var fail atomic.Bool
		gh := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
			if fail.Load() {
				w.WriteHeader(http.StatusForbidden)
				return
			}
			_, _ = w.Write([]byte(sidekickReleaseFixture))
		}))
		t.Cleanup(gh.Close)

		cache := &sidekickReleaseCache{apiURL: gh.URL}
		cache.get(context.Background())
		fail.Store(true)
		cache.mu.Lock()
		cache.fetchedAt = time.Now().Add(-sidekickReleaseTTL)
		cache.mu.Unlock()
		require.Equal(t, "v0.3.0", cache.get(context.Background()).Version)
	})
}

func TestSidekickDownload(t *testing.T) {
	t.Parallel()
	gh := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write([]byte(sidekickReleaseFixture))
	}))
	t.Cleanup(gh.Close)

	api := &API{sidekickRelease: &sidekickReleaseCache{apiURL: gh.URL}}
	router := chi.NewRouter()
	router.Get("/api/v1/sidekick-release/download/{os}", api.SidekickDownload)

	for os, want := range map[string]string{
		"windows": "https://example.test/windows.exe",
		"plan9":   "https://github.com/Emyrk/chronicle-sidekick/releases/tag/v0.3.0",
	} {
		rec := httptest.NewRecorder()
		router.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/api/v1/sidekick-release/download/"+os+"?utm_source=x", nil))
		require.Equal(t, http.StatusFound, rec.Code)
		require.Equal(t, want, rec.Header().Get("Location"))
	}
}
