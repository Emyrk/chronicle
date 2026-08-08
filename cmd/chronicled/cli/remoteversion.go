package cli

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/internal/version"
)

const remoteVersionTimeout = 10 * time.Second

// checkRemoteParserVersion fetches GET <baseURL>/api/v1/parser-version from
// the remote Chronicle server and returns an error if its release version does
// not match the local GitTag. Commit metadata may differ between builds of the
// same release and is intentionally ignored for this resync safety check.
func checkRemoteParserVersion(ctx context.Context, rawURL string) error {
	endpoint, err := resolveParserVersionURL(rawURL)
	if err != nil {
		return err
	}

	client := &http.Client{Timeout: remoteVersionTimeout}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return fmt.Errorf("build request: %w", err)
	}

	resp, err := client.Do(req)
	if err != nil {
		return fmt.Errorf("fetch remote parser version: %w", err)
	}
	defer func() { _ = resp.Body.Close() }()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("remote parser version returned HTTP %d", resp.StatusCode)
	}

	var body chroniclesdk.ParserVersionResponse
	if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
		return fmt.Errorf("decode remote parser version: %w", err)
	}

	localBuild := version.ExactParserVersion()
	localRelease := version.GitTag
	remoteRelease := parserReleaseVersion(body.Version)
	if remoteRelease != localRelease {
		return fmt.Errorf(
			"parser version mismatch: local=%q remote=%q (builds: local=%q remote=%q)",
			localRelease, remoteRelease, localBuild, body.Version,
		)
	}
	return nil
}

func parserReleaseVersion(buildVersion string) string {
	release, _, _ := strings.Cut(buildVersion, "+")
	return release
}

// resolveParserVersionURL normalises a base URL and appends the
// /api/v1/parser-version path.
func resolveParserVersionURL(rawURL string) (string, error) {
	rawURL = strings.TrimSpace(rawURL)
	if rawURL == "" {
		return "", fmt.Errorf("remote URL is empty")
	}

	u, err := url.Parse(rawURL)
	if err != nil {
		return "", fmt.Errorf("parse remote URL: %w", err)
	}
	if u.Scheme == "" {
		return "", fmt.Errorf("remote URL must include scheme (http:// or https://)")
	}

	// Normalise: ensure path ends without trailing slash, then append. A base
	// URL's query or fragment is not part of the API endpoint.
	u.Path = strings.TrimRight(u.Path, "/") + "/api/v1/parser-version"
	u.RawQuery = ""
	u.Fragment = ""
	return u.String(), nil
}
