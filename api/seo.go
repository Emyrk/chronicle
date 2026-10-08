package api

import (
	"encoding/json"
	"encoding/xml"
	"fmt"
	"net/http"
	"net/url"
	"strings"

	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/frontend"
	"github.com/Emyrk/chronicle/internal/services/servicetenant"
)

const defaultSEODescription = "Chronicle provides combat log analysis for World of Warcraft communities. Upload combat logs to explore encounters, rankings, and performance insights."

var indexablePrefixes = []string{
	"/", "/recent", "/guilds", "/g", "/armory", "/instances", "/s", "/leaderboards",
	"/talents", "/wowdb", "/technical", "/census", "/speedrunning", "/tools", "/contact",
	"/privacy", "/terms", "/disclaimer", "/supported-instances",
}

var noIndexPrefixes = []string{
	"/admin", "/account", "/settings", "/debug", "/upload", "/servers", "/login", "/apply",
}

func (api *API) brandingResolver(r *http.Request) *frontend.HTMLBranding {
	resolved := &frontend.HTMLBranding{
		CanonicalURL: canonicalRequestURL(api, r),
	}
	t := servicetenant.TenantFromContext(r.Context())
	if tenantAdsEnabled(api.adsDeploymentEnabled(), t) {
		resolved.AdSenseClientID = api.Opts.AdSenseClientID
	}

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
		resolved.Description = defaultSEODescription
		resolved.Favicon = branding.Favicon
		resolved.ThemeCSS = buildThemeCSS(branding)
		resolved.ImageURL = absoluteAssetURL(api, r, firstNonEmpty(branding.BackgroundBanner, branding.LogoWide, branding.SquareLogo))
	} else {
		resolved.SiteName = "Chronicle"
		resolved.Description = defaultSEODescription
	}

	if !discoverable || !pathHasPrefix(r.URL.Path, indexablePrefixes) || pathHasPrefix(r.URL.Path, noIndexPrefixes) || isPrivateGuildPath(r.URL.Path) {
		resolved.Robots = "noindex, nofollow"
	}
	resolved.JSONLD = websiteJSONLD(resolved.SiteName, resolved.Description, resolved.CanonicalURL, resolved.ImageURL)
	return resolved
}

func canonicalRequestURL(api *API, r *http.Request) string {
	scheme := "https"
	if api.Opts.AccessURL != nil && api.Opts.AccessURL.Scheme != "" {
		scheme = api.Opts.AccessURL.Scheme
	}
	path := r.URL.EscapedPath()
	if path == "" {
		path = "/"
	}
	return scheme + "://" + ogHost(r) + path
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
	"/leaderboards/statistics",
	"/leaderboards/speedruns",
	"/talents",
	"/wowdb",
	"/technical",
	"/census",
	"/speedrunning",
	"/tools",
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

type sitemapURLSet struct {
	XMLName xml.Name     `xml:"urlset"`
	XMLNS   string       `xml:"xmlns,attr"`
	URLs    []sitemapURL `xml:"url"`
}

type sitemapURL struct {
	Location string `xml:"loc"`
}

func (api *API) sitemapXML(w http.ResponseWriter, r *http.Request) {
	if !api.requestSiteDiscoverable(r) {
		http.NotFound(w, r)
		return
	}
	base := strings.TrimSuffix(canonicalRequestURL(api, r), "/sitemap.xml")
	set := sitemapURLSet{XMLNS: "http://www.sitemaps.org/schemas/sitemap/0.9"}
	for _, path := range sitemapPaths {
		set.URLs = append(set.URLs, sitemapURL{Location: base + path})
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
