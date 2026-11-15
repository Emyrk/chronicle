package servicestats

import (
	"context"
	"encoding/json"
	"fmt"
	"strconv"
	"strings"
	"time"

	"github.com/google/uuid"
)

// Producer computes one page's snapshot in the background job. Compute runs
// with ctx scoped to the tenant (row-level security), so its queries only see
// that tenant's data. It never runs on a page request.
type Producer interface {
	// Key is the snapshot's page_key. Unique, and must not start with "_"
	// (reserved for internal rows).
	Key() string
	// Cadence is how old a snapshot may get before the job recomputes it.
	Cadence() time.Duration
	// Compute returns the page's payload (stored as JSON) and its sample size,
	// which decides whether the page is indexable (see Page.MinSample).
	Compute(ctx context.Context, tenant Tenant) (payload any, sampleN int, err error)
}

// Tenant identifies the tenant a producer computes for. ID is uuid.Nil for
// the root site.
type Tenant struct {
	ID uuid.UUID
}

// Page is one public /stats URL backed by one producer's snapshot.
type Page struct {
	// Path is the page's URL path, e.g. "/stats/about".
	Path     string
	Producer Producer
	// MinSample is the smallest SampleN at which the page is indexable. Below
	// it the page still renders but carries noindex and stays out of the
	// sitemap.
	MinSample int
	// Render turns the snapshot into page content. It must only use the
	// snapshot and site: no database access.
	Render func(site Site, snap Snapshot) (Content, error)
}

// Snapshot is a stored producer result.
type Snapshot struct {
	Payload    json.RawMessage
	SampleN    int
	ComputedAt time.Time
}

// Decode unmarshals a snapshot payload into T.
func Decode[T any](snap Snapshot) (T, error) {
	var v T
	if err := json.Unmarshal(snap.Payload, &v); err != nil {
		return v, fmt.Errorf("decode stats payload: %w", err)
	}
	return v, nil
}

// Site describes the server a /stats page is about. The API resolves it per
// request from cached tenant data.
type Site struct {
	// Name is the server's display name, e.g. "WoW Forever".
	Name string
	// TurtleFork marks servers that run Turtle WoW content.
	TurtleFork bool
	// Origin is the tenant's canonical scheme and host, e.g.
	// "https://forever.chronicleclassic.com".
	Origin string
	// Discoverable is false for sites hidden from search engines.
	Discoverable bool
}

// Label is the server name as titles and descriptions should show it. Turtle
// forks say so, because players still search with "turtle wow" terms.
func (s Site) Label() string {
	if s.TurtleFork && !strings.Contains(strings.ToLower(s.Name), "turtle") {
		return s.Name + " (Turtle WoW fork)"
	}
	return s.Name
}

// Content is what a page renders into the shared layout, which implements the
// page spec (docs/ai-search-plan.md section 4.5).
type Content struct {
	// Title is the question the page answers, with the server name (use
	// Site.Label). It is both the <title> and the H1.
	Title string
	// Description is the meta description. Defaults to Lead.
	Description string
	// Lead is the answer-first summary: 2-3 self-contained sentences with the
	// key number, the "as of" date, the sample size and the window.
	Lead string
	// SampleLabel names what SampleN counts, e.g. "raids" or "parses".
	SampleLabel string
	// Window is the data window, e.g. "last 30 days".
	Window string
	// Table is the page's data as a real HTML table.
	Table *Table
	// Links point into the SPA for the full, interactive views.
	Links []Link
	// Methodology, when set, is rendered on this page as the methodology
	// section (anchor #methodology). Other pages link to MethodologyPath.
	Methodology []string
}

// Table is a simple HTML table.
type Table struct {
	Caption string
	Headers []string
	Rows    [][]Cell
}

// Cell is one table cell, optionally a link.
type Cell struct {
	Text string
	Href string
}

// Link is a link into the SPA.
type Link struct {
	Text string
	Href string
}

// MethodologyPath is where every page's methodology link points.
const MethodologyPath = "/stats/about#methodology"

// FormatInt formats n with thousands separators, e.g. 12345 -> "12,345".
func FormatInt(n int64) string {
	s := strconv.FormatInt(n, 10)
	neg := strings.HasPrefix(s, "-")
	s = strings.TrimPrefix(s, "-")
	var b strings.Builder
	for i, c := range s {
		if i > 0 && (len(s)-i)%3 == 0 {
			b.WriteByte(',')
		}
		b.WriteRune(c)
	}
	if neg {
		return "-" + b.String()
	}
	return b.String()
}

// FormatDate formats a snapshot time as the pages show it.
func FormatDate(t time.Time) string {
	return t.UTC().Format("2006-01-02")
}
