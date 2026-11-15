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
	Site         Site
	Content      Content
	Canonical    string
	Robots       string
	Updated      string
	UpdatedISO   string
	SampleN      string
	Methodology  string
	JSONLD       map[string]any
	DescriptionV string
}

// Handler serves the registered /stats pages. A hit reads exactly one
// snapshot row by primary key and never runs an aggregate query. Unknown
// paths and pages without a snapshot (including every page of a tenant below
// the activity threshold) are 404.
func (s *Service) Handler(resolve SiteResolver) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		page, ok := s.pageByPath[r.URL.Path]
		if !ok {
			http.NotFound(w, r)
			return
		}
		ctx := r.Context()
		snap, err := s.snapshot(ctx, page.Producer.Key())
		if errors.Is(err, pgx.ErrNoRows) {
			http.NotFound(w, r)
			return
		}
		if err != nil {
			s.serverError(ctx, w, "read stats snapshot", err)
			return
		}
		site, err := resolve(r)
		if err != nil {
			s.serverError(ctx, w, "resolve stats site", err)
			return
		}
		content, err := page.Render(site, snap)
		if err != nil {
			s.serverError(ctx, w, "render stats page", err)
			return
		}

		// Query-parameter variants are never indexed; their canonical is the
		// clean URL.
		indexable := site.Discoverable && snap.SampleN >= page.MinSample && r.URL.RawQuery == ""
		data := layoutData{
			Site:         site,
			Content:      content,
			Canonical:    site.Origin + page.Path,
			Updated:      FormatDate(snap.ComputedAt),
			UpdatedISO:   snap.ComputedAt.UTC().Format(time.RFC3339),
			SampleN:      FormatInt(int64(snap.SampleN)),
			Methodology:  MethodologyPath,
			DescriptionV: content.Description,
		}
		if data.DescriptionV == "" {
			data.DescriptionV = content.Lead
		}
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

func (s *Service) snapshot(ctx context.Context, key string) (Snapshot, error) {
	row, err := s.store.GetStatsSnapshot(ctx, database.GetStatsSnapshotParams{
		TenantID: servicetenant.TenantIDFromContext(ctx),
		PageKey:  key,
	})
	if err != nil {
		return Snapshot{}, err
	}
	return Snapshot{Payload: row.Payload, SampleN: int(row.SampleN), ComputedAt: row.ComputedAt.Time}, nil
}

func (s *Service) serverError(ctx context.Context, w http.ResponseWriter, msg string, err error) {
	s.logger.ErrorContext(ctx, msg, slog.String("error", err.Error()))
	w.Header().Set("Content-Type", "text/plain; charset=utf-8")
	w.WriteHeader(http.StatusInternalServerError)
	_, _ = w.Write([]byte("Internal server error\n"))
}

func webPageJSONLD(d layoutData) map[string]any {
	return map[string]any{
		"@context":     "https://schema.org",
		"@type":        "WebPage",
		"name":         d.Content.Title,
		"url":          d.Canonical,
		"description":  d.DescriptionV,
		"dateModified": d.UpdatedISO,
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
}

// SitemapEntry is one /stats URL for the tenant sitemap.
type SitemapEntry struct {
	Path    string
	LastMod time.Time
}

// SitemapEntries lists the request tenant's indexable /stats pages: those
// with a snapshot at or above their minimum sample. Meant for a cached
// sitemap loader; it reads snapshot metadata only.
func (s *Service) SitemapEntries(ctx context.Context) ([]SitemapEntry, error) {
	meta, err := s.store.ListStatsSnapshotMeta(ctx, servicetenant.TenantIDFromContext(ctx))
	if err != nil {
		return nil, err
	}
	byKey := make(map[string]database.ListStatsSnapshotMetaRow, len(meta))
	for _, m := range meta {
		byKey[m.PageKey] = m
	}
	var entries []SitemapEntry
	for _, p := range s.pages {
		m, ok := byKey[p.Producer.Key()]
		if !ok || int(m.SampleN) < p.MinSample {
			continue
		}
		entries = append(entries, SitemapEntry{Path: p.Path, LastMod: m.ComputedAt.Time})
	}
	return entries, nil
}
