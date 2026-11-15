package servicestats

import (
	"context"
	"encoding/json"
	"fmt"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/google/uuid"

	"github.com/Emyrk/chronicle/database"
)

// Producer computes one page family's snapshots in a background River job.
// Compute runs with ctx scoped to the tenant (row-level security), so its
// queries only see that tenant's data. It never runs on a page request.
type Producer interface {
	// Key names the family. It owns every page key that is Key() itself or
	// starts with Key()+"/" (see PageKey). Unique; no "/" and no leading "_".
	Key() string
	// Cadence is how long the family's snapshots may age before it reruns.
	Cadence() time.Duration
	// Timeout bounds one Compute. Zero means DefaultProducerTimeout.
	Timeout() time.Duration
	// Compute returns one Output per page this tenant should have. Pages it
	// stops emitting are deleted.
	Compute(ctx context.Context, tenant Tenant) ([]Output, error)
}

// Output is one page's snapshot.
type Output struct {
	// Key is the page key: PageKey(producer.Key(), params...).
	Key string
	// Payload is stored as JSON and handed back to Render.
	Payload any
	// SampleN is the sample size the numbers rest on (raids, parses, ...).
	SampleN int
	// MinSample is the smallest SampleN at which the page is indexable.
	// Below it the page renders with noindex and stays out of the sitemap.
	MinSample int
}

// Tenant is what a producer computes for.
type Tenant struct {
	// ID is uuid.Nil for the root site.
	ID uuid.UUID
	// Row is the tenant record, nil for the root site.
	Row *database.Tenant
	// Flavor is the site's resolved flavor tags (dataset plus tenant tags).
	Flavor database.WoWFlavor
	// DatasetID is the site's game-data dataset.
	DatasetID uuid.UUID
	// Activity is the tenant's latest threshold check.
	Activity Activity
}

// Activity is the stored result of the tenant threshold check.
type Activity struct {
	// Raids is the listed-raid count (logical runs) in ActivityWindow.
	Raids int64 `json:"raids"`
	// Players is the distinct-player count, nil when the raid count alone
	// decided the check and players were not counted.
	Players *int64 `json:"players,omitempty"`
	// WindowDays is ActivityWindow in days when the check ran.
	WindowDays int `json:"window_days"`
	// Eligible reports whether the tenant gets /stats pages.
	Eligible bool `json:"eligible"`
}

// Family is a set of /stats pages served from one producer's snapshots.
type Family struct {
	// Pattern is the URL pattern, e.g. "/stats/about" (one page) or
	// "/stats/{instance}/{boss}" (one page per parameter combination).
	// Parameters are lowercase slugs: [a-z0-9] words joined by "-".
	Pattern  string
	Producer Producer
	// Render turns a snapshot into page content. It must only use its
	// arguments: no database access.
	Render func(site Site, page Page, snap Snapshot) (Content, error)

	segments []segment
}

type segment struct {
	literal string
	param   string // set for "{name}" segments
}

// Page identifies a matched page.
type Page struct {
	Key  string
	Path string
	// Params maps the pattern's parameter names to their values.
	Params map[string]string
}

// Snapshot is a stored producer output.
type Snapshot struct {
	Payload    json.RawMessage
	SampleN    int
	MinSample  int
	ComputedAt time.Time
	// ChangedAt is when the payload last changed (the sitemap lastmod).
	ChangedAt time.Time
}

// StaticPage is a /stats page with no snapshot behind it, such as the
// methodology. It is served only to tenants that clear the threshold.
type StaticPage struct {
	Path   string
	Render func(site Site) Content
}

var (
	slugPattern     = regexp.MustCompile(`^[a-z0-9]+(?:-[a-z0-9]+)*$`)
	producerPattern = regexp.MustCompile(`^[a-z0-9]+(?:[-_][a-z0-9]+)*$`)
)

// PageKey builds the page key for a family's page from its parameter values,
// in pattern order.
func PageKey(producerKey string, params ...string) string {
	if len(params) == 0 {
		return producerKey
	}
	return producerKey + "/" + strings.Join(params, "/")
}

// compile parses Pattern. It is called by New.
func (f *Family) compile() error {
	if f.Producer == nil || f.Render == nil {
		return fmt.Errorf("family %q needs a producer and a render func", f.Pattern)
	}
	if key := f.Producer.Key(); !producerPattern.MatchString(key) {
		return fmt.Errorf("family %q has invalid producer key %q", f.Pattern, key)
	}
	segments, err := parsePath(f.Pattern)
	if err != nil {
		return err
	}
	seen := map[string]bool{}
	for i, s := range segments {
		if strings.HasPrefix(s, "{") && strings.HasSuffix(s, "}") {
			name := s[1 : len(s)-1]
			if name == "" || seen[name] {
				return fmt.Errorf("pattern %q has an empty or repeated parameter", f.Pattern)
			}
			seen[name] = true
			f.segments = append(f.segments, segment{param: name})
			continue
		}
		if !slugPattern.MatchString(s) {
			return fmt.Errorf("pattern %q has invalid segment %q", f.Pattern, s)
		}
		if i == 0 && s != "stats" {
			return fmt.Errorf("pattern %q must be under /stats", f.Pattern)
		}
		f.segments = append(f.segments, segment{literal: s})
	}
	return nil
}

func parsePath(path string) ([]string, error) {
	if !strings.HasPrefix(path, "/stats") || strings.HasSuffix(path, "/") && path != "/" {
		return nil, fmt.Errorf("path %q must be under /stats with no trailing slash", path)
	}
	segments := strings.Split(strings.TrimPrefix(path, "/"), "/")
	if segments[0] != "stats" {
		return nil, fmt.Errorf("path %q must be under /stats", path)
	}
	return segments, nil
}

// Match returns the page key for path, or false if path is not one of this
// family's pages.
func (f *Family) Match(path string) (string, bool) {
	page, ok := f.match(path)
	return page.Key, ok
}

func (f *Family) match(path string) (Page, bool) {
	parts := strings.Split(strings.TrimPrefix(path, "/"), "/")
	if !strings.HasPrefix(path, "/") || len(parts) != len(f.segments) {
		return Page{}, false
	}
	var values []string
	params := map[string]string{}
	for i, s := range f.segments {
		if s.param == "" {
			if parts[i] != s.literal {
				return Page{}, false
			}
			continue
		}
		if !slugPattern.MatchString(parts[i]) {
			return Page{}, false
		}
		values = append(values, parts[i])
		params[s.param] = parts[i]
	}
	return Page{Key: PageKey(f.Producer.Key(), values...), Path: path, Params: params}, true
}

// PathForKey returns the URL path of one of this family's page keys, or false
// if the key does not belong to the family or has the wrong shape.
func (f *Family) PathForKey(key string) (string, bool) {
	page, ok := f.pageForKey(key)
	return page.Path, ok
}

func (f *Family) pageForKey(key string) (Page, bool) {
	producer := f.Producer.Key()
	var values []string
	if key != producer {
		rest, ok := strings.CutPrefix(key, producer+"/")
		if !ok {
			return Page{}, false
		}
		values = strings.Split(rest, "/")
	}
	var parts []string
	params := map[string]string{}
	n := 0
	for _, s := range f.segments {
		if s.param == "" {
			parts = append(parts, s.literal)
			continue
		}
		if n >= len(values) || !slugPattern.MatchString(values[n]) {
			return Page{}, false
		}
		parts = append(parts, values[n])
		params[s.param] = values[n]
		n++
	}
	if n != len(values) {
		return Page{}, false
	}
	return Page{Key: key, Path: "/" + strings.Join(parts, "/"), Params: params}, true
}

// moreSpecific reports whether f beats g for a path both match: at the first
// segment where they differ, a literal beats a parameter.
func (f *Family) moreSpecific(g *Family) bool {
	for i := range f.segments {
		fl, gl := f.segments[i].param == "", g.segments[i].param == ""
		if fl != gl {
			return fl
		}
	}
	return false
}

// sameShape reports whether f and g would match exactly the same paths.
func (f *Family) sameShape(g *Family) bool {
	if len(f.segments) != len(g.segments) {
		return false
	}
	for i := range f.segments {
		if f.segments[i].literal != g.segments[i].literal {
			return false
		}
	}
	return true
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
	// Window is the data window, e.g. "last 180 days".
	Window string
	// Table is the page's data as a real HTML table.
	Table *Table
	// Sections are extra prose sections after the table.
	Sections []Section
	// Links point into the SPA for the full, interactive views.
	Links []Link
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

// Section is a prose section with an optional anchor ID.
type Section struct {
	ID         string
	Heading    string
	Paragraphs []string
}

// Link is a link into the SPA.
type Link struct {
	Text string
	Href string
}

// MethodologyPath is where every page's methodology link points.
const MethodologyPath = "/stats/methodology"

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
