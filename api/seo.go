package api

import (
	"context"
	"encoding/json"
	"encoding/xml"
	"fmt"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/frontend"
	"github.com/Emyrk/chronicle/internal/services/servicetenant"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
)

const defaultSEODescription = "Chronicle provides combat log analysis for World of Warcraft communities. Upload combat logs to explore encounters, rankings, and performance insights."

var indexablePrefixes = []string{
	"/", "/recent", "/guilds", "/g", "/armory", "/instances", "/s", "/leaderboards",
	"/talents", "/wowdb", "/technical", "/census", "/speedrunning", "/tools", "/blog", "/contact",
	"/privacy", "/terms", "/disclaimer", "/supported-instances",
}

var noIndexPrefixes = []string{
	"/admin", "/account", "/settings", "/debug", "/upload", "/servers", "/login", "/apply",
}

func (api *API) brandingResolver(r *http.Request) *frontend.HTMLBranding {
	resolved := &frontend.HTMLBranding{
		CanonicalURL: canonicalRequestURL(api, r),
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
		resolved.ImageURL = absoluteAssetURL(api, r, firstNonEmpty(branding.BackgroundBanner, branding.LogoWide, branding.SquareLogo))
	} else {
		resolved.SiteName = "Chronicle"
		resolved.Description = defaultSEODescription
	}

	if !discoverable || !pathHasPrefix(r.URL.Path, indexablePrefixes) || pathHasPrefix(r.URL.Path, noIndexPrefixes) || isPrivateGuildPath(r.URL.Path) || api.isUnlistedInstancePath(r) {
		resolved.Robots = "noindex, nofollow"
	}
	if r.URL.Path == "/" {
		config, err := api.Opts.Zed.GetSiteConfig(r.Context())
		if err == nil {
			resolved.Home = &frontend.HomeConfig{
				Flavor:                api.resolvedSiteFlavor(r.Context()).Strings(),
				ForeverLandingEnabled: config.ForeverLandingEnabled,
				UploadsDisabled:       api.Opts.ClientUploadsDisabled || config.ClientUploadsDisabled || (t != nil && t.DisableClientUpload),
			}
		}
	}
	resolved.JSONLD = websiteJSONLD(resolved.SiteName, resolved.Description, resolved.CanonicalURL, resolved.ImageURL)
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

	if id, err := uuid.Parse(parts[1]); err == nil {
		instance, err := api.Zed.InstanceWithUnlisted(r.Context(), id)
		return err == nil && instance.Unlisted
	}
	instance, err := api.Zed.InstanceBySlugWithUnlisted(r.Context(), pgtype.Text{String: parts[1], Valid: true})
	return err == nil && instance.Unlisted
}

// ogHost returns a validated request host for canonical URL construction.
func ogHost(r *http.Request) string {
	host := strings.ToLower(r.Host)
	for _, ch := range host {
		if (ch < 'a' || ch > 'z') && (ch < '0' || ch > '9') && ch != '.' && ch != '-' && ch != ':' {
			return "chronicleclassic.com"
		}
	}
	if host == "" {
		return "chronicleclassic.com"
	}
	return host
}

func canonicalRequestURL(api *API, r *http.Request) string {
	path := r.URL.EscapedPath()
	if path == "" {
		path = "/"
	}
	return canonicalOrigin(api, r) + path
}

// canonicalOrigin returns the canonical scheme and host for SEO URLs.
func canonicalOrigin(api *API, r *http.Request) string {
	scheme := "https"
	if api.Opts.AccessURL != nil && api.Opts.AccessURL.Scheme != "" {
		scheme = api.Opts.AccessURL.Scheme
	}
	return scheme + "://" + ogHost(r)
}

func absoluteAssetURL(api *API, r *http.Request, raw string) string {
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
	scheme := "https"
	if api.Opts.AccessURL != nil && api.Opts.AccessURL.Scheme != "" {
		scheme = api.Opts.AccessURL.Scheme
	}
	return scheme + "://" + ogHost(r) + u.String()
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

func pathHasPrefix(path string, prefixes []string) bool {
	for _, prefix := range prefixes {
		if path == prefix || strings.HasPrefix(path, prefix+"/") {
			return true
		}
	}
	return false
}

var sitemapPaths = []string{
	"/",
	"/recent",
	"/guilds",
	"/armory",
	"/leaderboards",
	"/leaderboards/statistics",
	"/leaderboards/speedruns",
	"/talents",
	"/talents/warrior",
	"/talents/paladin",
	"/talents/hunter",
	"/talents/rogue",
	"/talents/priest",
	"/talents/shaman",
	"/talents/mage",
	"/talents/warlock",
	"/talents/druid",
	"/wowdb",
	"/technical",
	"/census",
	"/speedrunning",
	"/tools",
	"/blog",
}

func (api *API) robotsTXT(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "text/plain; charset=utf-8")
	w.Header().Set("Cache-Control", "public, max-age=3600")
	if !api.requestSiteDiscoverable(r) {
		_, _ = fmt.Fprint(w, "User-agent: *\nDisallow: /\n")
		return
	}
	_, _ = fmt.Fprintf(w, "User-agent: *\nDisallow: /api/\nDisallow: /admin/\nDisallow: /account/\nDisallow: /settings/\nDisallow: /debug/\nDisallow: /upload\nDisallow: /servers/\nSitemap: %s/sitemap.xml\n", strings.TrimSuffix(canonicalRequestURL(api, r), "/robots.txt"))
}

// Caps on the sitemap's database-backed URLs, newest first. With the static
// paths and the blog they stay well under the 50,000 URLs (and 50 MB) one
// sitemap file may hold, so /sitemap.xml needs no sitemap index.
const (
	sitemapGuildLimit     = 5000
	sitemapCharacterLimit = 10000
	sitemapInstanceLimit  = 10000
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

func (api *API) sitemapXML(w http.ResponseWriter, r *http.Request) {
	if !api.requestSiteDiscoverable(r) {
		http.NotFound(w, r)
		return
	}
	ctx := r.Context()
	base := strings.TrimSuffix(canonicalRequestURL(api, r), "/sitemap.xml")
	set := sitemapURLSet{XMLNS: "http://www.sitemaps.org/schemas/sitemap/0.9"}
	for _, path := range sitemapPaths {
		set.URLs = append(set.URLs, sitemapURL{Location: base + path})
	}
	for _, u := range api.sitemapBlogURLs(r) {
		set.URLs = append(set.URLs, sitemapURL{Location: base + u.Location, LastMod: u.LastMod})
	}
	if api.Opts.Zed != nil {
		// Cached per tenant, so crawlers re-reading the sitemap never reach the
		// database more than once an hour per tenant.
		dynamic, err := api.sitemapCache.Load(ctx, api.Opts.Logger, api.loadSitemapURLs)
		if err != nil && api.Opts.Logger != nil {
			api.Opts.Logger.WarnContext(ctx, "load sitemap urls", "error", err)
		}
		for _, u := range dynamic {
			set.URLs = append(set.URLs, sitemapURL{Location: base + u.Location, LastMod: u.LastMod})
		}
	}
	data, err := xml.Marshal(set)
	if err != nil {
		http.Error(w, "failed to render sitemap", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/xml; charset=utf-8")
	w.Header().Set("Cache-Control", "public, max-age=3600")
	_, _ = w.Write(append([]byte(xml.Header), data...))
}

// sitemapBlogURLs lists the blog posts the request's site serves, by the same
// flavor rule as the blog route. Locations are paths.
func (api *API) sitemapBlogURLs(r *http.Request) []sitemapURL {
	siteFS := api.sitemapBlogFS
	if siteFS == nil {
		siteFS = frontend.FS()
	}
	posts, err := frontend.BlogPosts(siteFS)
	if err != nil {
		if api.Opts.Logger != nil {
			api.Opts.Logger.WarnContext(r.Context(), "read blog manifest for sitemap", "error", err)
		}
		return nil
	}
	flavor := api.blogFlavorResolver(r)
	urls := make([]sitemapURL, 0, len(posts))
	for _, post := range posts {
		if post.AllowedFor(flavor) {
			urls = append(urls, sitemapURL{Location: post.Path, LastMod: post.PublishedAt})
		}
	}
	return urls
}

// loadSitemapURLs reads the tenant's guild, character and raid pages. ctx
// carries the tenant, which RLS uses to scope every query. Locations are paths.
func (api *API) loadSitemapURLs(ctx context.Context) ([]sitemapURL, error) {
	tenantID := uuid.NullUUID{}
	if id := servicetenant.TenantIDFromContext(ctx); id != uuid.Nil {
		tenantID = uuid.NullUUID{UUID: id, Valid: true}
	}
	db := api.Opts.Zed

	guilds, err := db.ListSitemapGuilds(ctx, database.ListSitemapGuildsParams{TenantID: tenantID, ResultLimit: sitemapGuildLimit})
	if err != nil {
		return nil, fmt.Errorf("list sitemap guilds: %w", err)
	}
	characters, err := db.ListSitemapCharacters(ctx, database.ListSitemapCharactersParams{TenantID: tenantID, ResultLimit: sitemapCharacterLimit})
	if err != nil {
		return nil, fmt.Errorf("list sitemap characters: %w", err)
	}
	instances, err := db.ListSitemapInstances(ctx, database.ListSitemapInstancesParams{TenantID: tenantID, ResultLimit: sitemapInstanceLimit})
	if err != nil {
		return nil, fmt.Errorf("list sitemap instances: %w", err)
	}

	urls := make([]sitemapURL, 0, len(guilds)+len(characters)+len(instances))
	for _, g := range guilds {
		urls = append(urls, sitemapURL{Location: "/g/" + g.ID.String(), LastMod: sitemapLastMod(g.PageUpdatedAt)})
	}
	for _, c := range characters {
		urls = append(urls, sitemapURL{
			Location: "/armory/" + url.PathEscape(c.RealmName) + "/" + c.ID.String(),
			LastMod:  sitemapLastMod(c.UpdatedAt),
		})
	}
	for _, inst := range instances {
		identifier := inst.ID.String()
		if inst.HashedSlug.Valid && inst.HashedSlug.String != "" {
			identifier = inst.HashedSlug.String
		}
		urls = append(urls, sitemapURL{Location: "/instances/" + url.PathEscape(identifier), LastMod: sitemapLastMod(inst.UpdatedAt)})
	}
	return urls, nil
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
