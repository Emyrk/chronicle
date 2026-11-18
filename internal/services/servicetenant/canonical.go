package servicetenant

import (
	"slices"
	"strings"

	"github.com/Emyrk/chronicle/database"
)

// SharedContentSlug is the tenant whose host is canonical for pages that are
// identical on every host (SharedPagePaths and blog posts it serves).
// Tenant-owned pages (instances, guilds, characters) are canonical on their
// owning tenant's host instead.
const SharedContentSlug = "forever"

// SharedPagePaths are pages whose content does not vary by tenant or flavor,
// so every host serves the same page. Blog posts are shared too, but only when
// the shared-content tenant's flavor serves them; callers check that.
var SharedPagePaths = []string{"/tools", "/contact", "/privacy", "/terms", "/disclaimer", "/refund-policy"}

// TenantHost returns the host a tenant's pages are served on, or "" when the
// slug is empty or no primary domain is configured.
func (s *Service) TenantHost(slug string) string {
	if s == nil || s.primaryDomain == "" || slug == "" {
		return ""
	}
	return strings.ToLower(slug) + "." + strings.ToLower(s.primaryDomain)
}

// SharedContentTenant returns the tenant whose host is canonical for shared
// pages, and that host. ok is false when the tenant is unknown or not
// discoverable, so shared pages stay self-canonical rather than point at a
// host search engines will not index.
func (s *Service) SharedContentTenant() (tenant database.Tenant, host string, ok bool) {
	if s == nil {
		return database.Tenant{}, "", false
	}
	t, ok := s.GetTenantBySlug(SharedContentSlug)
	if !ok || !t.Discoverable {
		return database.Tenant{}, "", false
	}
	host = s.TenantHost(t.Slug.String)
	if host == "" {
		return database.Tenant{}, "", false
	}
	return t, host, true
}

// SharedPageHost returns the shared-content tenant's host when path is one of
// SharedPagePaths, or "" when the page is not shared or there is no such host.
func (s *Service) SharedPageHost(path string) string {
	if !slices.Contains(SharedPagePaths, path) {
		return ""
	}
	_, host, _ := s.SharedContentTenant()
	return host
}
