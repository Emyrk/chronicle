package api

import (
	"bytes"
	"compress/gzip"
	"context"
	"encoding/json"
	"encoding/xml"
	"fmt"
	"net/http"
	"net/url"
	"slices"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/api/httpapi"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/frontend"
	"github.com/Emyrk/chronicle/internal/pageload"
	"github.com/Emyrk/chronicle/internal/services/serviceseo"
	"github.com/Emyrk/chronicle/internal/services/servicetenant"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
)

const defaultSEODescription = "Chronicle provides combat log analysis for World of Warcraft communities. Upload combat logs to explore encounters, rankings, and performance insights."

// indexableExactPaths are public pages with no child routes. Anything below
// them (for example /guilds/zzz) is not a real page and stays noindex.
var indexableExactPaths = []string{
	"/", "/recent", "/guilds", "/census", "/speedrunning", "/contact", "/privacy", "/terms",
	"/disclaimer", "/refund-policy", "/supported", "/download", "/search/guide",
	// The gear builder's own pages. Lists (/gear/lists/:id) and progressions
	// (/gear/progression/:id) are shared by link, so they stay noindex.
	"/gear", "/gear/weights", "/gear/trends", "/gear/progression",
}

// indexablePrefixes are public pages whose child routes are public too.
var indexablePrefixes = []string{
	"/g", "/armory", "/instances", "/s", "/leaderboards", "/talents", "/wowdb", "/technical",
	"/tools", "/blog", "/modules",
}

var noIndexPrefixes = []string{
	"/admin", "/account", "/settings", "/debug", "/upload", "/servers", "/login", "/apply",
	// /modules/id/:projectId serves any project by ID, published or not.
	// Published modules are indexed at /modules/:author/:slug.
	"/modules/new", "/modules/id",
}

// SEOSummaryService renders crawlable summaries for SPA pages.
type SEOSummaryService interface {
	Summary(r *http.Request) *frontend.PageSummary
}

func (api *API) brandingResolver(r *http.Request) *frontend.HTMLBranding {
	canonical := api.canonical()
	resolved := &frontend.HTMLBranding{
		CanonicalURL: canonical.URL(r),
		GA4ID:        api.Opts.GA4ID,
	}
	t := servicetenant.TenantFromContext(r.Context())

	var branding *chroniclesdk.Branding
	discoverable := true
	if t != nil {
		branding = chroniclesdk.TenantFromDB(*t).Branding
		discoverable = t.Discoverable
	} else {
		config, err := api.Opts.Zed.GetSiteConfig(r.Context())
		if err == nil {
			branding = unmarshalBranding(config.Branding)
			discoverable = config.Discoverable
		}
	}

	if branding != nil {
		resolved.SiteName = firstNonEmpty(branding.DisplayName, "Chronicle")
		resolved.Title = resolved.SiteName
		if branding.DisplayName != "" {
			resolved.Title += " by Chronicle"
		}
		resolved.Description = firstNonEmpty(branding.Description, branding.Tagline, defaultSEODescription)
		resolved.Favicon = branding.Favicon
		resolved.ThemeCSS = buildThemeCSS(branding)
		resolved.ImageURL = absoluteAssetURL(canonical, r, firstNonEmpty(branding.BackgroundBanner, branding.LogoWide, branding.SquareLogo))
	} else {
		resolved.SiteName = "Chronicle"
		resolved.Description = defaultSEODescription
	}

	if !discoverable || !isIndexablePath(r.URL.Path) || pathHasPrefix(r.URL.Path, noIndexPrefixes) || isPrivateGuildPath(r.URL.Path) || api.isUnlistedInstancePath(r) {
		resolved.Robots = "noindex, nofollow"
	} else if api.Opts.SEO != nil {
		resolved.Summary = api.Opts.SEO.Summary(r)
	}
	if r.URL.Path == "/" {
		config, err := api.Opts.Zed.GetSiteConfig(r.Context())
		if err == nil {
			rootUploadsDisabled := t == nil && config.RootUploadsDisabled
			resolved.Home = &frontend.HomeConfig{
				Flavor:                api.resolvedSiteFlavor(r.Context()).Strings(),
				ForeverLandingEnabled: config.ForeverLandingEnabled,
				UploadsDisabled:       api.Opts.ClientUploadsDisabled || siteUploadRequestsDisabled(config, t),
				RootUploadsDisabled:   rootUploadsDisabled,
			}
		}
	}
	// The WebSite entity describes the site serving the request, even when the
	// page itself is canonical on another host.
	resolved.JSONLD = websiteJSONLD(resolved.SiteName, resolved.Description, canonical.Origin(r), resolved.ImageURL)
	return resolved
}

func (api *API) isUnlistedInstancePath(r *http.Request) bool {
	if api.Zed == nil {
		return false
	}

	parts := strings.Split(strings.Trim(r.URL.Path, "/"), "/")
	if len(parts) != 2 || parts[0] != "instances" || parts[1] == "" {
		return false
	}

	instance, err := pageload.InstanceWithUnlisted(r.Context(), api.Zed, parts[1])
	return err == nil && instance.Unlisted
}

// canonical returns the canonical URL policy for the API's options.
func (api *API) canonical() *serviceseo.Canonical {
	return serviceseo.NewCanonical(serviceseo.CanonicalOptions{
		SharedContentSlug: api.Opts.SharedContentSlug,
		Logger:            api.Opts.Logger,
		Tenant:            api.Opts.Tenant,
		Dataset:           api.Opts.Dataset,
		AccessURL:         api.Opts.AccessURL,
		BlogFS:            api.sitemapBlogFS,
	})
}

func absoluteAssetURL(canonical *serviceseo.Canonical, r *http.Request, raw string) string {
	if raw == "" {
		return ""
	}
	u, err := url.Parse(raw)
	if err != nil {
		return ""
	}
	if u.IsAbs() {
		if u.Scheme == "https" || u.Scheme == "http" {
			return u.String()
		}
		return ""
	}
	if !strings.HasPrefix(u.Path, "/") {
		return ""
	}
	return canonical.Origin(r) + u.String()
}

func websiteJSONLD(name, description, canonical, image string) string {
	canonicalURL, err := url.Parse(canonical)
	if err != nil || !canonicalURL.IsAbs() {
		return ""
	}
	canonicalURL.Path = "/"
	canonicalURL.RawPath = ""
	canonicalURL.RawQuery = ""
	canonicalURL.Fragment = ""
	website := map[string]any{
		"@context":    "https://schema.org",
		"@type":       "WebSite",
		"name":        name,
		"url":         canonicalURL.String(),
		"description": description,
		"publisher": map[string]any{
			"@type": "Organization",
			"name":  "Chronicle",
			"url":   "https://chronicleclassic.com/",
		},
	}
	if image != "" {
		website["image"] = image
	}
	data, err := json.Marshal(website)
	if err != nil {
		return ""
	}
	return string(data)
}

func isPrivateGuildPath(path string) bool {
	return strings.HasSuffix(path, "/edit") || strings.HasSuffix(path, "/analytics") || strings.HasSuffix(path, "/settings")
}

func isIndexablePath(path string) bool {
	return slices.Contains(indexableExactPaths, path) || pathHasPrefix(path, indexablePrefixes)
}

func pathHasPrefix(path string, prefixes []string) bool {
	for _, prefix := range prefixes {
		if path == prefix || strings.HasPrefix(path, prefix+"/") {
			return true
		}
	}
	return false
}

// sitemapPath is a static sitemap entry. lastMod says where its <lastmod>
// comes from; truly static pages carry none rather than a made-up date.
type sitemapPath struct {
	path    string
	lastMod sitemapLastModSource
}

type sitemapLastModSource int

const (
	// sitemapLastModInstances is the newest instance the sitemap lists.
	sitemapLastModInstances sitemapLastModSource = iota + 1
	// sitemapLastModBlog is the newest blog post the sitemap lists.
	sitemapLastModBlog
)

var sitemapPaths = []sitemapPath{
	{path: "/"},
	{path: "/recent", lastMod: sitemapLastModInstances},
	{path: "/guilds", lastMod: sitemapLastModInstances},
	{path: "/armory", lastMod: sitemapLastModInstances},
	{path: "/leaderboards", lastMod: sitemapLastModInstances},
	{path: "/leaderboards/statistics", lastMod: sitemapLastModInstances},
	{path: "/leaderboards/speedruns", lastMod: sitemapLastModInstances},
	{path: "/talents"},
	{path: "/talents/warrior"},
	{path: "/talents/paladin"},
	{path: "/talents/hunter"},
	{path: "/talents/rogue"},
	{path: "/talents/priest"},
	{path: "/talents/shaman"},
	{path: "/talents/mage"},
	{path: "/talents/warlock"},
	{path: "/talents/druid"},
	{path: "/wowdb"},
	{path: "/technical"},
	{path: "/census"},
	{path: "/speedrunning"},
	{path: "/tools"},
	{path: "/blog", lastMod: sitemapLastModBlog},
}

func (api *API) robotsTXT(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "text/plain; charset=utf-8")
	w.Header().Set("Cache-Control", "public, max-age=3600")
	if !api.requestSiteDiscoverable(r) {
		_, _ = fmt.Fprint(w, "User-agent: *\nDisallow: /\n")
		return
	}
	_, _ = fmt.Fprintf(w, "User-agent: *\nDisallow: /api/\nDisallow: /admin/\nDisallow: /account/\nDisallow: /settings/\nDisallow: /debug/\nDisallow: /upload\nDisallow: /servers/\nSitemap: %s/sitemap.xml\n", strings.TrimSuffix(api.canonical().URL(r), "/robots.txt"))
}

// Caps on the sitemap's database-backed URLs, newest first. With the static
// paths and the blog they stay well under the 50,000 URLs (and 50 MB) one
// sitemap file may hold, so /sitemap.xml needs no sitemap index.
const (
	sitemapGuildLimit     = 1000
	sitemapCharacterLimit = 2000
	sitemapInstanceLimit  = 1000
)

// Bars a database-backed page must clear to be listed, so the sitemap lists
// pages worth finding rather than thousands of near-empty ones. "Listed
// instances" are listed, valid, finalized logs.
const (
	// Guilds without an edited page need this many listed runs.
	sitemapGuildMinInstances = 3
	// Characters need a known class, this many listed instances and a
	// sighting within sitemapCharacterRecency.
	sitemapCharacterMinInstances = 3
	sitemapCharacterRecency      = 90 * 24 * time.Hour
	// Instances need a boss kill, this many minutes and this many players.
	sitemapInstanceMinMinutes = 10
	sitemapInstanceMinPlayers = 3
)

type sitemapURLSet struct {
	XMLName xml.Name     `xml:"urlset"`
	XMLNS   string       `xml:"xmlns,attr"`
	URLs    []sitemapURL `xml:"url"`
}

type sitemapURL struct {
	Location string `xml:"loc"`
	LastMod  string `xml:"lastmod,omitempty"`
}

// sitemapDynamic is one load of a tenant's database-backed sitemap URLs. Each
// refresh of sitemapCache yields a new pointer, which tells the rendered cache
// when to re-render.
type sitemapDynamic struct {
	urls []sitemapURL
	// newestInstance is the newest lastmod among the listed instances, the
	// lastmod of the hubs that list them. Empty when none are listed.
	newestInstance string
}

// sitemapRenderKey identifies one rendered sitemap. host is always one of the
// tenant's canonical hosts (see sitemapHost), so the key space is bounded by
// the number of tenants, not by request input.
type sitemapRenderKey struct {
	tenant uuid.UUID
	host   string
}

type sitemapRendered struct {
	// source is the dynamic load this render used (nil when there was none).
	source *sitemapDynamic
	raw    []byte
	gz     []byte
}

// sitemapRenderCache holds rendered sitemaps per (tenant, canonical host).
type sitemapRenderCache struct {
	mu      sync.Mutex
	entries map[sitemapRenderKey]*sitemapRendered
	// renders counts renders (tests).
	renders int
}

// get returns the cached render for key if it was built from source, or
// calls render and caches the result. Rendering may query the database for
// blog flavor, so neither rendering nor compression may hold the cache lock.
// Concurrent misses may render independently; publication below keeps a slow
// render from overwriting an entry another request has already replaced.
func (c *sitemapRenderCache) get(key sitemapRenderKey, source *sitemapDynamic, render func() ([]byte, error)) (*sitemapRendered, error) {
	c.mu.Lock()
	previous := c.entries[key]
	c.mu.Unlock()
	if previous != nil && previous.source == source {
		return previous, nil
	}
	raw, err := render()
	if err != nil {
		return nil, err
	}
	var buf bytes.Buffer
	zw, err := gzip.NewWriterLevel(&buf, gzip.BestCompression)
	if err != nil {
		return nil, err
	}
	if _, err := zw.Write(raw); err != nil {
		return nil, err
	}
	if err := zw.Close(); err != nil {
		return nil, err
	}
	e := &sitemapRendered{source: source, raw: raw, gz: buf.Bytes()}
	c.mu.Lock()
	defer c.mu.Unlock()
	if current := c.entries[key]; current != previous {
		if current != nil && current.source == source {
			return current, nil
		}
		// Another source was published while we rendered. Serve this request
		// without replacing it; the next request checks the source as usual.
		return e, nil
	}
	if c.entries == nil {
		c.entries = make(map[sitemapRenderKey]*sitemapRendered)
	}
	c.entries[key] = e
	c.renders++
	return e, nil
}

func (api *API) sitemapXML(w http.ResponseWriter, r *http.Request) {
	if !api.requestSiteDiscoverable(r) {
		http.NotFound(w, r)
		return
	}
	ctx := r.Context()
	var dynamic *sitemapDynamic
	if api.Opts.Zed != nil {
		// Cached per tenant, so crawlers re-reading the sitemap never reach the
		// database more than once an hour per tenant.
		loaded, err := api.sitemapCache.Load(ctx, api.Opts.Logger, api.loadSitemapURLs)
		if err != nil && api.Opts.Logger != nil {
			api.Opts.Logger.WarnContext(ctx, "load sitemap urls", "error", err)
		}
		dynamic = loaded
	}

	host := api.sitemapHost(r)
	if host == "" {
		httpapi.Write(r.Context(), w, http.StatusBadRequest, map[string]string{"error": "no valid sitemap host"})
		return
	}
	key := sitemapRenderKey{tenant: servicetenant.TenantIDFromContext(ctx), host: host}
	rendered, err := api.sitemapRendered.get(key, dynamic, func() ([]byte, error) {
		return api.renderSitemap(r, api.canonical().Scheme()+"://"+host, dynamic)
	})
	if err != nil {
		http.Error(w, "failed to render sitemap", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/xml; charset=utf-8")
	w.Header().Set("Cache-Control", "public, max-age=3600")
	w.Header().Add("Vary", "Accept-Encoding")
	body := rendered.raw
	if acceptsGzip(r) {
		w.Header().Set("Content-Encoding", "gzip")
		body = rendered.gz
	}
	w.Header().Set("Content-Length", strconv.Itoa(len(body)))
	_, _ = w.Write(body)
}

func (api *API) renderSitemap(r *http.Request, base string, dynamic *sitemapDynamic) ([]byte, error) {
	set := sitemapURLSet{XMLNS: "http://www.sitemaps.org/schemas/sitemap/0.9"}
	// A sitemap lists only URLs canonical on its own host: shared pages
	// canonical on the shared-content tenant's host are left to its sitemap.
	// The shared pages are resolved once for the whole render.
	canonical := api.canonical()
	host := strings.TrimPrefix(base, canonical.Scheme()+"://")
	shared := canonical.SharedPages(r)
	canonicalHere := func(path string) bool { return shared.IsCanonicalOn(host, path) }
	// The blog hub's lastmod still covers every post this host serves: its
	// /blog index lists them all.
	blog := api.sitemapBlogURLs(r)
	for _, p := range sitemapPaths {
		if !canonicalHere(p.path) {
			continue
		}
		u := sitemapURL{Location: base + p.path}
		switch p.lastMod {
		case sitemapLastModInstances:
			if dynamic != nil {
				u.LastMod = dynamic.newestInstance
			}
		case sitemapLastModBlog:
			u.LastMod = newestLastMod(blog)
		}
		set.URLs = append(set.URLs, u)
	}
	for _, u := range blog {
		if canonicalHere(u.Location) {
			set.URLs = append(set.URLs, sitemapURL{Location: base + u.Location, LastMod: u.LastMod})
		}
	}
	if dynamic != nil {
		for _, u := range dynamic.urls {
			set.URLs = append(set.URLs, sitemapURL{Location: base + u.Location, LastMod: u.LastMod})
		}
	}
	data, err := xml.Marshal(set)
	if err != nil {
		return nil, err
	}
	return append([]byte(xml.Header), data...), nil
}

// sitemapHost picks the host the sitemap's URLs use: the request's host when
// it is one of the site's canonical hosts, otherwise the first canonical
// host. Arbitrary Host headers therefore never reach the render cache key.
func (api *API) sitemapHost(r *http.Request) string {
	hosts := api.canonicalHosts(r)
	requested := api.canonical().RequestHost(r)
	if slices.Contains(hosts, requested) {
		return requested
	}
	if len(hosts) > 0 {
		return hosts[0]
	}
	return ""
}

// canonicalHosts lists the hosts the request's site is served on: the
// tenant's subdomain for a tenant, the access URL and primary domain for the
// site itself. With no tenant host, it falls back to the configured access URL.
func (api *API) canonicalHosts(r *http.Request) []string {
	primary := ""
	if api.Opts.Tenant != nil {
		primary = strings.ToLower(api.Opts.Tenant.PrimaryDomain())
	}
	var hosts []string
	if t := servicetenant.TenantFromContext(r.Context()); t != nil {
		if host := api.Opts.Tenant.TenantHost(t.Slug.String); host != "" {
			hosts = append(hosts, host)
		}
	} else {
		if api.Opts.AccessURL != nil && api.Opts.AccessURL.Host != "" {
			hosts = append(hosts, strings.ToLower(api.Opts.AccessURL.Host))
		}
		if primary != "" && !slices.Contains(hosts, primary) {
			hosts = append(hosts, primary)
		}
	}
	if len(hosts) == 0 && api.Opts.AccessURL != nil && api.Opts.AccessURL.Host != "" {
		hosts = append(hosts, strings.ToLower(api.Opts.AccessURL.Host))
	}
	return hosts
}

// acceptsGzip reports whether the request's Accept-Encoding allows gzip.
func acceptsGzip(r *http.Request) bool {
	for _, header := range r.Header.Values("Accept-Encoding") {
		for _, part := range strings.Split(header, ",") {
			coding, params, _ := strings.Cut(strings.TrimSpace(part), ";")
			coding = strings.ToLower(strings.TrimSpace(coding))
			if coding != "gzip" && coding != "*" {
				continue
			}
			if q, ok := strings.CutPrefix(strings.ReplaceAll(params, " ", ""), "q="); ok {
				if v, err := strconv.ParseFloat(q, 64); err == nil && v == 0 {
					continue
				}
			}
			return true
		}
	}
	return false
}

// sitemapBlogURLs lists the blog posts the request's site serves, by the same
// flavor rule as the blog route. Locations are paths.
func (api *API) sitemapBlogURLs(r *http.Request) []sitemapURL {
	posts := api.blogPosts(r)
	flavor := api.blogFlavorResolver(r)
	urls := make([]sitemapURL, 0, len(posts))
	for _, post := range posts {
		if post.AllowedFor(flavor) {
			urls = append(urls, sitemapURL{Location: post.Path, LastMod: post.PublishedAt})
		}
	}
	return urls
}

// blogPosts lists the posts in the blog manifest, or none when it cannot be read.
func (api *API) blogPosts(r *http.Request) []frontend.BlogPost {
	siteFS := api.sitemapBlogFS
	if siteFS == nil {
		siteFS = frontend.FS()
	}
	posts, err := frontend.BlogPosts(siteFS)
	if err != nil {
		if api.Opts.Logger != nil {
			api.Opts.Logger.WarnContext(r.Context(), "read blog manifest", "error", err)
		}
		return nil
	}
	return posts
}

// loadSitemapURLs reads the tenant's guild, character and raid pages. ctx
// carries the tenant, which RLS uses to scope every query. Locations are paths.
func (api *API) loadSitemapURLs(ctx context.Context) (*sitemapDynamic, error) {
	tenantID := uuid.NullUUID{}
	if id := servicetenant.TenantIDFromContext(ctx); id != uuid.Nil {
		tenantID = uuid.NullUUID{UUID: id, Valid: true}
	}
	db := api.Opts.Zed

	guilds, err := db.ListSitemapGuilds(ctx, database.ListSitemapGuildsParams{
		TenantID:     tenantID,
		MinInstances: sitemapGuildMinInstances,
		ResultLimit:  sitemapGuildLimit,
	})
	if err != nil {
		return nil, fmt.Errorf("list sitemap guilds: %w", err)
	}
	characters, err := db.ListSitemapCharacters(ctx, database.ListSitemapCharactersParams{
		TenantID:     tenantID,
		SeenSince:    database.Timestamptz(time.Now().Add(-sitemapCharacterRecency)),
		MinInstances: sitemapCharacterMinInstances,
		ResultLimit:  sitemapCharacterLimit,
	})
	if err != nil {
		return nil, fmt.Errorf("list sitemap characters: %w", err)
	}
	instances, err := db.ListSitemapInstances(ctx, database.ListSitemapInstancesParams{
		TenantID:    tenantID,
		MinMinutes:  sitemapInstanceMinMinutes,
		MinPlayers:  sitemapInstanceMinPlayers,
		ResultLimit: sitemapInstanceLimit,
	})
	if err != nil {
		return nil, fmt.Errorf("list sitemap instances: %w", err)
	}

	urls := make([]sitemapURL, 0, len(guilds)+len(characters)+len(instances))
	for _, g := range guilds {
		urls = append(urls, sitemapURL{Location: "/g/" + g.ID.String(), LastMod: sitemapLastMod(g.LastModified)})
	}
	for _, c := range characters {
		urls = append(urls, sitemapURL{
			Location: "/armory/" + url.PathEscape(c.RealmName) + "/" + c.ID.String(),
			LastMod:  sitemapLastMod(c.UpdatedAt),
		})
	}
	newestInstance := ""
	for _, inst := range instances {
		identifier := inst.ID.String()
		if inst.HashedSlug.Valid && inst.HashedSlug.String != "" {
			identifier = inst.HashedSlug.String
		}
		lastMod := sitemapLastMod(inst.UpdatedAt)
		newestInstance = max(newestInstance, lastMod)
		urls = append(urls, sitemapURL{Location: "/instances/" + url.PathEscape(identifier), LastMod: lastMod})
	}
	return &sitemapDynamic{urls: urls, newestInstance: newestInstance}, nil
}

// newestLastMod returns the latest lastmod among urls. Lastmods are RFC 3339
// times or dates in UTC, so they order as strings.
func newestLastMod(urls []sitemapURL) string {
	newest := ""
	for _, u := range urls {
		newest = max(newest, u.LastMod)
	}
	return newest
}

func sitemapLastMod(t pgtype.Timestamptz) string {
	if !t.Valid {
		return ""
	}
	return t.Time.UTC().Format(time.RFC3339)
}

func (api *API) requestSiteDiscoverable(r *http.Request) bool {
	if tenant := servicetenant.TenantFromContext(r.Context()); tenant != nil {
		return tenant.Discoverable
	}
	config, err := api.Opts.Zed.GetSiteConfig(r.Context())
	return err == nil && config.Discoverable
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if value != "" {
			return value
		}
	}
	return ""
}
