package servicetenant

import (
	"net/url"
	"slices"
	"strings"

	"github.com/Emyrk/chronicle/database"
)

// CanonicalHosts lists the hosts the request's site is served on: the tenant's
// subdomain for a tenant, the access URL and primary domain for the site
// itself. tenant is the request's tenant (nil for the site itself). The result
// is empty when nothing is configured (no primary domain, no access URL).
func CanonicalHosts(tenant *database.Tenant, svc *Service, accessURL *url.URL) []string {
	primary := ""
	if svc != nil {
		primary = strings.ToLower(svc.PrimaryDomain())
	}
	var hosts []string
	if tenant != nil {
		if tenant.Slug.Valid && tenant.Slug.String != "" && primary != "" {
			hosts = append(hosts, strings.ToLower(tenant.Slug.String)+"."+primary)
		}
		return hosts
	}
	if accessURL != nil && accessURL.Host != "" {
		hosts = append(hosts, strings.ToLower(accessURL.Host))
	}
	if primary != "" && !slices.Contains(hosts, primary) {
		hosts = append(hosts, primary)
	}
	return hosts
}

// CanonicalHost picks the host that SEO URLs (canonicals, og:url) use: the
// requested host when it is one of the site's canonical hosts, otherwise the
// first canonical host. Arbitrary Host headers (a platform default domain,
// aliases) therefore never become canonical. When no canonical host is
// configured it returns requested unchanged.
func CanonicalHost(hosts []string, requested string) string {
	if len(hosts) == 0 || slices.Contains(hosts, requested) {
		return requested
	}
	return hosts[0]
}
