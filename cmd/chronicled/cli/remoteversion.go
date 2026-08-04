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
// the remote Chronicle server and returns an error if the remote version does
// not exactly match the local ExactParserVersion().
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
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("remote parser version returned HTTP %d", resp.StatusCode)
	}

	var body chroniclesdk.ParserVersionResponse
	if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
		return fmt.Errorf("decode remote parser version: %w", err)
	}

	local := version.ExactParserVersion()
	if body.Version != local {
		return fmt.Errorf("parser version mismatch: local=%q remote=%q", local, body.Version)
	}
	return nil
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
