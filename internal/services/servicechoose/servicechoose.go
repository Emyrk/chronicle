// Package servicechoose serves the community chooser subdomain
// (e.g. choose.chronicleclassic.com). A link to any path on the chooser lets
// the visitor pick which tenant to open that path on, and remembers the
// choice in the browser so future chooser links redirect automatically.
package servicechoose

import (
	"bytes"
	"context"
	_ "embed"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"path"
	"sort"
	"strings"

	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/internal/services"
	"github.com/Emyrk/chronicle/internal/services/serviceaccessurl"
	"github.com/Emyrk/chronicle/internal/services/servicetenant"

	"github.com/coder/serpent"
)

var _ services.Servicer = (*Service)(nil)

//go:embed choose.html
var chooseHTML []byte

// dataPlaceholder is replaced with the page's JSON data. json.Marshal escapes
// <, > and &, so the payload cannot break out of its <script> element.
var dataPlaceholder = []byte("{{CHOOSE_DATA}}")

func Choose(broker *services.Services) *Service {
	return services.MustGet[*Service](broker)
}

func OnChoose() string {
	return (&Service{}).Name()
}

type Service struct {
	broker *services.Services

	// slug is the subdomain label that serves the chooser. Empty disables it.
	slug      string
	tenantSvc *servicetenant.Service
	accessURL url.URL
}

func New(broker *services.Services) *Service {
	return &Service{broker: broker}
}

// NewTest creates an enabled Service without a broker, for unit tests.
func NewTest(slug string, tenantSvc *servicetenant.Service, accessURL url.URL) *Service {
	return &Service{slug: slug, tenantSvc: tenantSvc, accessURL: accessURL}
}

func (s *Service) Name() string         { return services.ServiceChoose }
func (s *Service) Configures() []string { return []string{} }
func (s *Service) DependsOn() []string {
	return []string{
		servicetenant.OnTenant(),
		serviceaccessurl.OnAccessURL(),
	}
}

func (s *Service) Options() serpent.OptionSet {
	return serpent.OptionSet{
		{
			Name:        "Choose Slug",
			Description: "Subdomain label that serves the community chooser (e.g. \"choose\" serves choose.<primary-domain>). Links to any path on it let visitors pick which community to open. Empty disables the chooser.",
			Flag:        "choose-slug",
			Env:         "CHRONICLE_CHOOSE_SLUG",
			Default:     "",
			Value:       serpent.StringOf(&s.slug),
		},
	}
}

func (s *Service) Start(_ context.Context) error {
	s.slug = strings.ToLower(strings.TrimSpace(s.slug))
	if s.slug == "" {
		return nil
	}
	if strings.Contains(s.slug, ".") {
		return fmt.Errorf("choose slug %q must be a single subdomain label", s.slug)
	}

	tenantSvc := servicetenant.Tenant(s.broker)
	if tenantSvc.PrimaryDomain() == "" {
		return fmt.Errorf("choose slug %q requires --primary-domain", s.slug)
	}
	if raw := serviceaccessurl.AccessURL(s.broker); raw != "" {
		if u, err := url.Parse(raw); err == nil {
			s.accessURL = *u
		}
	}
	s.tenantSvc = tenantSvc
	return nil
}

func (s *Service) Close(_ context.Context) error { return nil }

// Enabled reports whether this deployment serves the chooser.
func (s *Service) Enabled() bool {
	return s != nil && s.slug != "" && s.tenantSvc != nil
}

// IsChooseHost reports whether host (port optional) is the chooser subdomain.
func (s *Service) IsChooseHost(host string) bool {
	return s.Enabled() && s.tenantSvc.ExtractSlug(host) == s.slug
}

// ChooseURL is the chooser's origin, e.g. https://choose.chronicleclassic.com.
// Empty when disabled.
func (s *Service) ChooseURL() string {
	if !s.Enabled() {
		return ""
	}
	return s.originFor(s.slug)
}

// originFor builds the origin of a subdomain, reusing the access URL's scheme
// and port so local development (http://*.localhost:4000) works.
func (s *Service) originFor(slug string) string {
	scheme := s.accessURL.Scheme
	if scheme == "" {
		scheme = "https"
	}
	host := slug + "." + s.tenantSvc.PrimaryDomain()
	if port := s.accessURL.Port(); port != "" {
		host += ":" + port
	}
	return scheme + "://" + host
}

// Middleware serves the chooser page on the chooser subdomain. Other requests
// on that subdomain (assets such as favicons and logos) go to untenanted,
// since the chooser is not a tenant. Requests on any other host go to
// tenanted.
func (s *Service) Middleware(untenanted, tenanted http.Handler) http.Handler {
	if !s.Enabled() {
		return tenanted
	}
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !s.IsChooseHost(r.Host) {
			tenanted.ServeHTTP(w, r)
			return
		}
		if isPageRequest(r) {
			s.servePage(w, r)
			return
		}
		untenanted.ServeHTTP(w, r)
	})
}

// isPageRequest reports whether r is a browser navigation the chooser should
// answer, as opposed to an API call or a static asset.
func isPageRequest(r *http.Request) bool {
	if r.Method != http.MethodGet && r.Method != http.MethodHead {
		return false
	}
	if strings.HasPrefix(r.URL.Path, "/api/") {
		return false
	}
	return path.Ext(r.URL.Path) == "" || strings.Contains(r.Header.Get("Accept"), "text/html")
}

// Destination is one place the visitor can choose to open the link.
type Destination struct {
	// Key identifies the destination in the visitor's saved choice.
	Key     string `json:"key"`
	Name    string `json:"name"`
	Tagline string `json:"tagline,omitempty"`
	Logo    string `json:"logo,omitempty"`
	Origin  string `json:"origin"`
}

type pageData struct {
	ChooseHost   string        `json:"choose_host"`
	Destinations []Destination `json:"destinations"`
}

// mainSiteKey is the saved-choice key for the access URL (the main site).
const mainSiteKey = "@main"

// Destinations lists every discoverable tenant sorted by name, followed by
// the main site.
func (s *Service) Destinations() []Destination {
	tenants := s.tenantSvc.CachedTenants()
	out := make([]Destination, 0, len(tenants)+1)
	for _, t := range tenants {
		if !t.Discoverable || !t.Slug.Valid || t.Slug.String == "" || t.Slug.String == s.slug {
			continue
		}
		out = append(out, s.tenantDestination(t))
	}
	sort.Slice(out, func(i, j int) bool {
		return strings.ToLower(out[i].Name) < strings.ToLower(out[j].Name)
	})

	if s.accessURL.Host != "" {
		out = append(out, Destination{
			Key:     mainSiteKey,
			Name:    "Main site",
			Tagline: "Every server Chronicle supports",
			Origin:  s.accessURL.Scheme + "://" + s.accessURL.Host,
		})
	}
	return out
}

func (s *Service) tenantDestination(t database.Tenant) Destination {
	d := Destination{
		Key:    t.Slug.String,
		Name:   t.Name,
		Origin: s.originFor(t.Slug.String),
	}
	var branding struct {
		SquareLogo  string `json:"square_logo"`
		DisplayName string `json:"display_name"`
		Tagline     string `json:"tagline"`
	}
	if len(t.Branding) > 0 && json.Unmarshal(t.Branding, &branding) == nil {
		if branding.DisplayName != "" {
			d.Name = branding.DisplayName
		}
		d.Tagline = branding.Tagline
		d.Logo = branding.SquareLogo
	}
	return d
}

func (s *Service) servePage(w http.ResponseWriter, r *http.Request) {
	data, err := json.Marshal(pageData{
		ChooseHost:   r.Host,
		Destinations: s.Destinations(),
	})
	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		return
	}
	body := bytes.Replace(chooseHTML, dataPlaceholder, data, 1)

	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("X-Robots-Tag", "noindex")
	w.WriteHeader(http.StatusOK)
	if r.Method == http.MethodHead {
		return
	}
	_, _ = w.Write(body)
}
