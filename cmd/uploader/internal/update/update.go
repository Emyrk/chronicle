// Package update checks GitHub Releases for a newer uploader build.
package update

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"
)

// TagPrefix marks uploader releases among the repo's other tags.
const TagPrefix = "uploader/v"

// DefaultURL lists the repo's releases.
const DefaultURL = "https://api.github.com/repos/Emyrk/chronicle/releases?per_page=30"

// Release is the newest published uploader release.
type Release struct {
	Version string // without the tag prefix, e.g. "0.2.0"
	URL     string // release page
}

type ghRelease struct {
	TagName    string `json:"tag_name"`
	HTMLURL    string `json:"html_url"`
	Draft      bool   `json:"draft"`
	Prerelease bool   `json:"prerelease"`
}

// Checker re-checks the release list cheaply: after the first fetch it sends
// If-None-Match, and GitHub answers 304 (not counted against the rate limit)
// while nothing has been published.
type Checker struct {
	Client *http.Client
	URL    string

	etag string
	rel  Release
	ok   bool
}

// Check returns the newest uploader release, reusing the previous answer when
// the server reports it unchanged.
func (c *Checker) Check(ctx context.Context) (Release, bool, error) {
	rel, ok, etag, err := latest(ctx, c.Client, c.URL, c.etag)
	if err != nil {
		return Release{}, false, err
	}
	if etag == "" { // 304: keep the cached answer
		return c.rel, c.ok, nil
	}
	c.etag, c.rel, c.ok = etag, rel, ok
	return rel, ok, nil
}

// Latest returns the newest uploader release listed at url. Releases are
// returned newest first by GitHub.
func Latest(ctx context.Context, client *http.Client, url string) (Release, bool, error) {
	rel, ok, _, err := latest(ctx, client, url, "")
	return rel, ok, err
}

// latest returns an empty etag when the server answered 304 to the given etag.
func latest(ctx context.Context, client *http.Client, url, etag string) (Release, bool, string, error) {
	ctx, cancel := context.WithTimeout(ctx, 15*time.Second)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return Release{}, false, "", err
	}
	req.Header.Set("Accept", "application/vnd.github+json")
	if etag != "" {
		req.Header.Set("If-None-Match", etag)
	}
	res, err := client.Do(req)
	if err != nil {
		return Release{}, false, "", err
	}
	defer func() { _ = res.Body.Close() }()
	if res.StatusCode == http.StatusNotModified && etag != "" {
		return Release{}, false, "", nil
	}
	if res.StatusCode != http.StatusOK {
		return Release{}, false, "", fmt.Errorf("github releases: %s", res.Status)
	}
	var rels []ghRelease
	if err := json.NewDecoder(res.Body).Decode(&rels); err != nil {
		return Release{}, false, "", err
	}
	// Servers without an ETag still need a non-empty marker to be cached.
	tag := res.Header.Get("ETag")
	if tag == "" {
		tag = "-"
	}
	for _, r := range rels {
		if r.Draft || r.Prerelease || !strings.HasPrefix(r.TagName, TagPrefix) {
			continue
		}
		return Release{Version: strings.TrimPrefix(r.TagName, TagPrefix), URL: r.HTMLURL}, true, tag, nil
	}
	return Release{}, false, tag, nil
}

// Newer reports whether latest is a higher x.y.z than current. Unparseable
// versions (such as "dev") are never considered outdated.
func Newer(current, latest string) bool {
	c, ok1 := parse(current)
	l, ok2 := parse(latest)
	if !ok1 || !ok2 {
		return false
	}
	for i := range c {
		if l[i] != c[i] {
			return l[i] > c[i]
		}
	}
	return false
}

func parse(v string) ([3]int, bool) {
	var out [3]int
	parts := strings.Split(strings.TrimPrefix(v, "v"), ".")
	if len(parts) != 3 {
		return out, false
	}
	for i, p := range parts {
		n, err := strconv.Atoi(p)
		if err != nil {
			return out, false
		}
		out[i] = n
	}
	return out, true
}
