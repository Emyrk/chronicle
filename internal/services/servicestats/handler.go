package servicestats

import (
	"bytes"
	"context"
	_ "embed"
	"errors"
	"fmt"
	"html/template"
	"log/slog"
	"net/http"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/internal/services/servicetenant"
)

//go:embed layout.html.tmpl
var layoutSource string

var layoutTemplate = template.Must(template.New("stats-layout").Parse(layoutSource))

// CacheControl is the Cache-Control header of every rendered /stats page.
var CacheControl = fmt.Sprintf("public, max-age=%d, s-maxage=%d", int(BrowserMaxAge.Seconds()), int(EdgeMaxAge.Seconds()))

// SiteResolver resolves the Site for a request. It must not run uncached
// database queries.
type SiteResolver func(r *http.Request) (Site, error)

type layoutData struct {
	Site        Site
	Content     Content
	Canonical   string
	Description string
	Robots      string
	// Snapshot is false for static pages, which have no "Updated" line.
	Snapshot    bool
	Updated     string
	UpdatedISO  string
	SampleN     string
	Methodology string
	JSONLD      map[string]any
}

// Handler serves the /stats pages. A hit reads exactly one snapshot row by
// primary key (a static page reads the tenant's activity row) and never runs
// an aggregate query. Unknown paths, percent-encoded path variants, hidden
// (non-discoverable) sites and pages without a snapshot, including every page
// of a tenant below the activity threshold, are 404.
func (s *Service) Handler(resolve SiteResolver) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Percent-encoded variants of a path (e.g. /stats/%61bout) are not the
		// page; serving them would create duplicate URLs.
		if r.URL.RawPath != "" && r.URL.RawPath != r.URL.Path {
			http.NotFound(w, r)
			return
		}
		if to, ok := s.redirects[r.URL.Path]; ok {
			w.Header().Set("Cache-Control", CacheControl)
			http.Redirect(w, r, to, http.StatusMovedPermanently)
			return
		}
		ctx := r.Context()
		tenantID := servicetenant.TenantIDFromContext(ctx)
		static, isStatic := s.static[r.URL.Path]
		family, page, isFamily := s.match(r.URL.Path)
		if !isStatic && !isFamily {
			http.NotFound(w, r)
			return
		}
		site, err := resolve(r)
		if err != nil {
			// Only a page that exists is worth a 500; a page with nothing
			// behind it stays a 404 even when the site lookup fails.
			if exists, existsErr := s.pageExists(ctx, tenantID, isStatic, family, page); existsErr == nil && !exists {
				http.NotFound(w, r)
				return
			}
			s.serverError(ctx, w, "resolve stats site", err)
			return
		}
		// Hidden sites get no pages, even stale ones (the dispatch skips them).
		if !site.Discoverable {
			http.NotFound(w, r)
			return
		}
		data := layoutData{Site: site, Methodology: MethodologyPath}
		var minSample, sampleN int

		if isStatic {
			activity, found, err := s.activity(ctx, tenantID)
			if err != nil {
				s.serverError(ctx, w, "read stats activity", err)
				return
			}
			if !found || !activity.Eligible {
				http.NotFound(w, r)
				return
			}
			data.Content, data.Canonical = static.Render(site), site.Origin+static.Path
		} else {
			row, err := s.store.GetStatsSnapshot(ctx, database.GetStatsSnapshotParams{TenantID: tenantID, PageKey: page.Key})
			if errors.Is(err, pgx.ErrNoRows) || err == nil && row.ProducerKey != family.Producer.Key() {
				http.NotFound(w, r)
				return
			}
			if err != nil {
				s.serverError(ctx, w, "read stats snapshot", err)
				return
			}
			snap := Snapshot{
				Payload: row.Payload, SampleN: int(row.SampleN), MinSample: int(row.MinSample),
				ComputedAt: row.ComputedAt.Time, ChangedAt: row.PayloadChangedAt.Time,
			}
			content, err := family.Render(site, page, snap)
			if err != nil {
				s.serverError(ctx, w, "render stats page", err)
				return
			}
			data.Content, data.Canonical = content, site.Origin+page.Path
			data.Snapshot = true
			data.Updated = FormatDate(snap.ComputedAt)
			data.UpdatedISO = snap.ComputedAt.UTC().Format(time.RFC3339)
			data.SampleN = FormatInt(int64(snap.SampleN))
			minSample, sampleN = snap.MinSample, snap.SampleN
			data.JSONLD = map[string]any{"dateModified": snap.ChangedAt.UTC().Format(time.RFC3339)}
		}

		data.Description = data.Content.Description
		if data.Description == "" {
			data.Description = data.Content.Lead
		}
		// Query-parameter variants are never indexed; their canonical is the
		// clean URL.
		indexable := sampleN >= minSample && r.URL.RawQuery == ""
		if !indexable {
			data.Robots = "noindex"
		}
		data.JSONLD = webPageJSONLD(data)

		var buf bytes.Buffer
		if err := layoutTemplate.Execute(&buf, data); err != nil {
			s.serverError(ctx, w, "execute stats layout", err)
			return
		}
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		w.Header().Set("Cache-Control", CacheControl)
		if !indexable {
			w.Header().Set("X-Robots-Tag", "noindex")
		}
		_, _ = w.Write(buf.Bytes())
	})
}

// pageExists reports whether a matched path has something to serve: the
// tenant is eligible (static pages) or the page's snapshot is stored.
func (s *Service) pageExists(ctx context.Context, tenantID uuid.UUID, isStatic bool, family *Family, page Page) (bool, error) {
	if isStatic {
		activity, found, err := s.activity(ctx, tenantID)
		return found && activity.Eligible, err
	}
	row, err := s.store.GetStatsSnapshot(ctx, database.GetStatsSnapshotParams{TenantID: tenantID, PageKey: page.Key})
	if errors.Is(err, pgx.ErrNoRows) {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	return row.ProducerKey == family.Producer.Key(), nil
}

func (s *Service) serverError(ctx context.Context, w http.ResponseWriter, msg string, err error) {
	s.logger.ErrorContext(ctx, msg, slog.String("error", err.Error()))
	w.Header().Set("Content-Type", "text/plain; charset=utf-8")
	w.WriteHeader(http.StatusInternalServerError)
	_, _ = w.Write([]byte("Internal server error\n"))
}

// webPageJSONLD builds the WebPage JSON-LD. dateModified is when the
// snapshot's payload last changed, not when it was last recomputed.
func webPageJSONLD(d layoutData) map[string]any {
	ld := map[string]any{
		"@context":    "https://schema.org",
		"@type":       "WebPage",
		"name":        d.Content.Title,
		"url":         d.Canonical,
		"description": d.Description,
		"isPartOf": map[string]any{
			"@type": "WebSite",
			"name":  d.Site.Name,
			"url":   d.Site.Origin + "/",
		},
		"publisher": map[string]any{
			"@type": "Organization",
			"name":  "Chronicle",
			"url":   "https://chronicleclassic.com/",
		},
	}
	if modified, ok := d.JSONLD["dateModified"]; ok {
		ld["dateModified"] = modified
	}
	return ld
}

// SitemapEntry is one /stats URL for the tenant sitemap.
type SitemapEntry struct {
	Path string
	// LastMod is when the page's payload last changed (zero for static pages).
	LastMod time.Time
}

// SitemapEntries lists the request tenant's indexable /stats pages: stored
// pages of registered families at or above their minimum sample, plus the
// static pages when the tenant has any. Meant for a cached sitemap loader; it
// reads snapshot metadata only.
func (s *Service) SitemapEntries(ctx context.Context) ([]SitemapEntry, error) {
	meta, err := s.store.ListStatsSnapshotMeta(ctx, servicetenant.TenantIDFromContext(ctx))
	if err != nil {
		return nil, err
	}
	var entries []SitemapEntry
	for _, m := range meta {
		f := s.byProducer[m.ProducerKey]
		if f == nil || m.SampleN < m.MinSample {
			continue
		}
		path, ok := f.PathForKey(m.PageKey)
		if !ok || !s.servesFamily(path, f) {
			continue
		}
		entries = append(entries, SitemapEntry{Path: path, LastMod: m.PayloadChangedAt.Time})
	}
	if len(entries) > 0 {
		for _, p := range s.staticOrder {
			entries = append(entries, SitemapEntry{Path: p.Path})
		}
	}
	return entries, nil
}
