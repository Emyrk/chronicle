package serviceseo

import (
	"context"
	"io/fs"
	"log/slog"
	"net/http"
	"net/url"
	pathpkg "path"
	"slices"
	"strings"

	"github.com/Emyrk/chronicle/frontend"
	"github.com/Emyrk/chronicle/internal/services/servicedataset"
	"github.com/Emyrk/chronicle/internal/services/servicetenant"
)

// SharedPagePaths are pages whose content does not vary by tenant or flavor,
// so every host serves the same page. Paths match exactly: /tools is shared,
// but its child pages such as /tools/developer-panels stay canonical on the
// host serving them until they are reviewed and added here. Blog posts are
// shared too, but only when the shared-content tenant's flavor serves them.
var SharedPagePaths = []string{"/tools", "/contact", "/privacy", "/terms", "/disclaimer", "/refund-policy"}

// validHost validates hosts before they are rendered by text/template.
func validHost(host string) string {
	host = strings.ToLower(host)
	for _, ch := range host {
		if (ch < 'a' || ch > 'z') && (ch < '0' || ch > '9') && ch != '.' && ch != '-' && ch != ':' {
			return ""
		}
	}
	return host
}

// RequestHost returns the validated request host, or the configured access
// URL host when the request host is missing or malformed. It returns empty
// when neither supplies a valid host.
func (c *Canonical) RequestHost(r *http.Request) string {
	if host := validHost(r.Host); host != "" {
		return host
	}
	if c != nil {
		return c.fallbackHost
	}
	return ""
}

// CanonicalOptions are the dependencies of the canonical URL policy. Every
// field is optional: without a tenant service every page is canonical on the
// host serving it.
type CanonicalOptions struct {
	Logger *slog.Logger
	// Tenant resolves tenant hosts and the shared-content tenant.
	Tenant *servicetenant.Service
	// Dataset resolves the shared-content tenant's flavor for blog posts.
	Dataset *servicedataset.Service
	// SharedContentSlug selects the tenant canonical for shared pages and blog
	// posts it serves. Empty keeps shared content on the request host.
	SharedContentSlug string
	// AccessURL supplies the fallback host and canonical scheme; https when unset.
	AccessURL *url.URL
	// BlogFS holds blog-manifest.json; nil reads the embedded frontend.
	BlogFS fs.FS
}

// Canonical owns Chronicle's canonical URL policy: which host each page is
// canonical on. A page is canonical on the host serving it, except
//   - shared pages (SharedPagePaths and blog posts the shared-content tenant
//     serves), canonical on the shared-content tenant's host, and
//   - tenant-owned pages (instances, guilds, characters), canonical on the
//     owning tenant's host.
//
// Either exception applies only when the target tenant is discoverable, so a
// canonical never points at a host search engines are told not to index.
type Canonical struct {
	sharedContentSlug string
	fallbackHost      string
	logger            *slog.Logger
	tenant            *servicetenant.Service
	dataset           *servicedataset.Service
	scheme            string
	blogFS            fs.FS
}

// NewCanonical returns the canonical URL policy for opts.
func NewCanonical(opts CanonicalOptions) *Canonical {
	scheme := "https"
	if opts.AccessURL != nil && opts.AccessURL.Scheme != "" {
		scheme = opts.AccessURL.Scheme
	}
	fallbackHost := ""
	if opts.AccessURL != nil {
		fallbackHost = validHost(opts.AccessURL.Host)
	}
	return &Canonical{
		sharedContentSlug: opts.SharedContentSlug,
		fallbackHost:      fallbackHost,
		logger:            opts.Logger,
		tenant:            opts.Tenant,
		dataset:           opts.Dataset,
		scheme:            scheme,
		blogFS:            opts.BlogFS,
	}
}

// Scheme returns the scheme canonical URLs use.
func (c *Canonical) Scheme() string {
	if c == nil {
		return "https"
	}
	return c.scheme
}

// Origin returns the canonical scheme and the request's (validated) host.
func (c *Canonical) Origin(r *http.Request) string {
	host := c.RequestHost(r)
	if host == "" {
		return ""
	}
	return c.Scheme() + "://" + host
}

// URL returns the request's canonical URL: the shared-content tenant's host
// for shared pages, otherwise the request host.
func (c *Canonical) URL(r *http.Request) string {
	path := r.URL.EscapedPath()
	if path == "" {
		path = "/"
	}
	shared := c.shared(r, strings.HasPrefix(r.URL.Path, "/blog/"))
	if host := shared.Host(r.URL.Path); host != "" {
		return c.Scheme() + "://" + host + path
	}
	if origin := c.Origin(r); origin != "" {
		return origin + path
	}
	return ""
}

// SharedPages resolves the shared-content tenant and the blog posts it serves
// once, for callers that check many paths (the sitemap).
func (c *Canonical) SharedPages(r *http.Request) SharedPages {
	return c.shared(r, true)
}

// OwnerHost returns the host canonical for a page owned by the tenant with
// slug: that tenant's host, or fallback (the request host) when slug is empty
// (the root site owns the page), no primary domain is configured, or the
// owner is not discoverable. A slug the tenant cache does not know keeps the
// owner's host.
func (c *Canonical) OwnerHost(ctx context.Context, slug, fallback string) string {
	if c == nil || slug == "" {
		return fallback
	}
	host := c.tenant.TenantHost(slug)
	if host == "" {
		return fallback
	}
	if t, ok := c.tenant.GetTenantBySlug(slug); ok && !t.Discoverable {
		c.debug(ctx, "canonical owner is not discoverable, keeping the request host", "owner", slug, "host", fallback)
		return fallback
	}
	return host
}

// SharedPages is the shared-content policy resolved for one request.
type SharedPages struct {
	// host is the shared-content tenant's host, or "" when there is none.
	host string
	// posts are the blog post paths the shared-content tenant serves.
	posts map[string]struct{}
}

// Host returns the shared-content tenant's host when path is a shared page,
// or "" when path is canonical on the host serving it.
func (s SharedPages) Host(path string) string {
	if s.host == "" {
		return ""
	}
	if slices.Contains(SharedPagePaths, path) {
		return s.host
	}
	if strings.HasPrefix(path, "/blog/") {
		if _, ok := s.posts[pathpkg.Clean(path)]; ok {
			return s.host
		}
	}
	return ""
}

// IsCanonicalOn reports whether path is canonical on host.
func (s SharedPages) IsCanonicalOn(host, path string) bool {
	shared := s.Host(path)
	return shared == "" || shared == host
}

// shared resolves the shared-content tenant and, when withBlog is set, the
// blog posts its flavor serves (by the same rule as the blog route).
func (c *Canonical) shared(r *http.Request, withBlog bool) SharedPages {
	if c == nil || c.tenant == nil || c.sharedContentSlug == "" {
		return SharedPages{}
	}
	home, ok := c.tenant.GetTenantBySlug(c.sharedContentSlug)
	host := c.tenant.TenantHost(home.Slug.String)
	if !ok || !home.Discoverable || host == "" {
		c.debug(r.Context(), "no discoverable shared-content tenant host, shared pages stay on the request host", "slug", c.sharedContentSlug)
		return SharedPages{}
	}
	pages := SharedPages{host: host}
	if !withBlog {
		return pages
	}
	siteFS := c.blogFS
	if siteFS == nil {
		siteFS = frontend.FS()
	}
	posts, err := frontend.BlogPosts(siteFS)
	if err != nil {
		if c.logger != nil {
			c.logger.WarnContext(r.Context(), "read blog manifest", "error", err)
		}
		return pages
	}
	homeFlavor := c.dataset.SiteFlavor(servicetenant.WithTenant(r.Context(), home)).Strings()
	pages.posts = make(map[string]struct{}, len(posts))
	for _, post := range posts {
		if post.AllowedFor(homeFlavor) {
			pages.posts[post.Path] = struct{}{}
		}
	}
	return pages
}

func (c *Canonical) debug(ctx context.Context, msg string, args ...any) {
	if c.logger != nil {
		c.logger.DebugContext(ctx, msg, args...)
	}
}
