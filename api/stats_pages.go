package api

import (
	"context"
	"net/http"

	"github.com/go-chi/chi/v5"

	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/internal/services/servicestats"
	"github.com/Emyrk/chronicle/internal/services/servicetenant"
)

// statsSiteFacts are the per-tenant facts a /stats page needs, cached so a
// page hit runs no query beyond its snapshot read.
type statsSiteFacts struct {
	name            string
	turtleFork      bool
	discoverable    bool
	uploadsDisabled bool
}

// mountStats routes the server-rendered /stats answer pages, ahead of the SPA
// fallback. Without a stats service, /stats falls through to the SPA.
func (api *API) mountStats(r chi.Router) {
	if api.Opts.Stats == nil {
		return
	}
	stats := api.Opts.Stats.Handler(api.statsSiteResolver)
	indexNowKey := api.Opts.Stats.IndexNowKeyHandler()
	// chi answers HEAD with 405 unless it is registered; crawlers use it.
	for _, method := range []string{http.MethodGet, http.MethodHead} {
		r.Method(method, "/stats", stats)
		r.Method(method, "/stats/*", stats)
		r.Method(method, servicestats.IndexNowKeyPath, indexNowKey)
	}
}

// statsSiteResolver resolves the Site for a /stats request.
func (api *API) statsSiteResolver(r *http.Request) (servicestats.Site, error) {
	facts, err := api.statsSite.Load(r.Context(), api.Opts.Logger, api.loadStatsSiteFacts)
	if err != nil {
		return servicestats.Site{}, err
	}
	return servicestats.Site{
		Name:            facts.name,
		TurtleFork:      facts.turtleFork,
		Origin:          canonicalScheme(api) + "://" + api.canonicalHosts(r)[0],
		Discoverable:    facts.discoverable,
		UploadsDisabled: facts.uploadsDisabled,
	}, nil
}

// loadStatsSiteFacts reads the name, flavor, discoverability and upload setting of the
// tenant in ctx (the root site when there is none).
func (api *API) loadStatsSiteFacts(ctx context.Context) (statsSiteFacts, error) {
	config, err := api.Opts.Zed.GetSiteConfig(ctx)
	if err != nil {
		return statsSiteFacts{}, err
	}
	t := servicetenant.TenantFromContext(ctx)
	var facts statsSiteFacts
	if t != nil {
		if branding := chroniclesdk.TenantFromDB(*t).Branding; branding != nil {
			facts.name = branding.DisplayName
		}
		facts.name = firstNonEmpty(facts.name, t.Name)
		facts.discoverable = t.Discoverable
	} else {
		if branding := unmarshalBranding(config.Branding); branding != nil {
			facts.name = branding.DisplayName
		}
		facts.discoverable = config.Discoverable
	}
	facts.name = firstNonEmpty(facts.name, "Chronicle")
	facts.turtleFork = isTurtleFork(api.resolvedSiteFlavor(ctx))
	// The same rule the SPA's upload page uses.
	facts.uploadsDisabled = api.Opts.ClientUploadsDisabled || siteUploadRequestsDisabled(config, t)
	return facts, nil
}

// isTurtleFork reports whether a site runs Turtle WoW content: the Turtle
// tag itself, or the Turtle custom content (Nightmare of Ursol) that forks
// such as OctoWoW share.
func isTurtleFork(flavor database.WoWFlavor) bool {
	return flavor.Has(database.FlavorTurtle, database.FlavorNightmareOfUrsol)
}
