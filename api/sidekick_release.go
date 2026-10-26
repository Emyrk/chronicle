package api

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/api/httpapi"
)

const (
	sidekickReleasesURL  = "https://github.com/Emyrk/chronicle-sidekick/releases"
	sidekickLatestAPIURL = "https://api.github.com/repos/Emyrk/chronicle-sidekick/releases/latest"
	// sidekickReleaseTTL bounds how long a new Sidekick tag takes to reach
	// /download, and keeps GitHub calls far under the unauthenticated limit.
	sidekickReleaseTTL = 10 * time.Minute
)

// Asset names are fixed by chronicle-sidekick's .goreleaser.yaml.
var sidekickAssetNames = []struct{ os, name string }{
	{"macos", "Chronicle-Sidekick-macos.zip"},
	{"windows", "Chronicle-Sidekick-windows-amd64.exe"},
	{"linux", "Chronicle-Sidekick-linux-amd64.tar.gz"},
}

// sidekickReleaseCache holds the latest Sidekick release so browsers never
// call GitHub. A failed refresh keeps serving the previous value.
type sidekickReleaseCache struct {
	apiURL string
	client *http.Client
	logger *slog.Logger

	mu        sync.Mutex
	release   *chroniclesdk.SidekickRelease
	fetchedAt time.Time
}

func (c *sidekickReleaseCache) get(ctx context.Context) chroniclesdk.SidekickRelease {
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.release != nil && time.Since(c.fetchedAt) < sidekickReleaseTTL {
		return *c.release
	}
	release, err := c.fetch(ctx)
	if err != nil {
		if c.logger != nil {
			c.logger.Warn("fetch sidekick release", slog.String("error", err.Error()))
		}
		if c.release != nil {
			// Retry after a full TTL rather than on every request.
			c.fetchedAt = time.Now()
			return *c.release
		}
		return chroniclesdk.SidekickRelease{ReleasesURL: sidekickReleasesURL, Assets: []chroniclesdk.SidekickReleaseAsset{}}
	}
	c.release = &release
	c.fetchedAt = time.Now()
	return release
}

func (c *sidekickReleaseCache) fetch(ctx context.Context) (chroniclesdk.SidekickRelease, error) {
	release := chroniclesdk.SidekickRelease{ReleasesURL: sidekickReleasesURL, Assets: []chroniclesdk.SidekickReleaseAsset{}}
	ctx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, c.apiURL, nil)
	if err != nil {
		return release, err
	}
	req.Header.Set("Accept", "application/vnd.github+json")
	client := c.client
	if client == nil {
		client = http.DefaultClient
	}
	resp, err := client.Do(req)
	if err != nil {
		return release, err
	}
	defer func() { _ = resp.Body.Close() }()
	// /releases/latest is 404 until the first non-draft, non-prerelease tag.
	if resp.StatusCode == http.StatusNotFound {
		return release, nil
	}
	if resp.StatusCode != http.StatusOK {
		return release, fmt.Errorf("github releases: status %d", resp.StatusCode)
	}
	var gh struct {
		TagName     string    `json:"tag_name"`
		HTMLURL     string    `json:"html_url"`
		PublishedAt time.Time `json:"published_at"`
		Assets      []struct {
			Name               string `json:"name"`
			Size               int64  `json:"size"`
			Digest             string `json:"digest"`
			BrowserDownloadURL string `json:"browser_download_url"`
		} `json:"assets"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&gh); err != nil {
		return release, fmt.Errorf("decode github release: %w", err)
	}
	release.Version = gh.TagName
	if gh.HTMLURL != "" {
		release.ReleasesURL = gh.HTMLURL
	}
	if !gh.PublishedAt.IsZero() {
		release.PublishedAt = &gh.PublishedAt
	}
	for _, want := range sidekickAssetNames {
		for _, asset := range gh.Assets {
			if asset.Name != want.name {
				continue
			}
			release.Assets = append(release.Assets, chroniclesdk.SidekickReleaseAsset{
				OS:     want.os,
				Name:   asset.Name,
				Size:   asset.Size,
				SHA256: strings.TrimPrefix(asset.Digest, "sha256:"),
				URL:    asset.BrowserDownloadURL,
			})
		}
	}
	release.Available = len(release.Assets) > 0
	return release, nil
}

// SidekickRelease returns the latest Sidekick release. Public: the landing's
// download page serves visitors with no account.
func (api *API) SidekickRelease(w http.ResponseWriter, r *http.Request) {
	httpapi.Write(r.Context(), w, http.StatusOK, api.sidekickRelease.get(r.Context()))
}

// SidekickDownload redirects to the latest release asset for {os}, or to the
// releases page when there is none.
func (api *API) SidekickDownload(w http.ResponseWriter, r *http.Request) {
	release := api.sidekickRelease.get(r.Context())
	target := release.ReleasesURL
	for _, asset := range release.Assets {
		if asset.OS == chi.URLParam(r, "os") {
			target = asset.URL
		}
	}
	http.Redirect(w, r, target, http.StatusFound)
}
