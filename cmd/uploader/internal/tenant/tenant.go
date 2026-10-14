// Package tenant describes the Chronicle deployment the uploader talks to.
package tenant

import "strings"

// Tenant is a Chronicle deployment. The format and flavor are properties of
// the tenant, not of the uploader.
type Tenant struct {
	BaseURL string `json:"base_url"`
	// Format is the combat log format the server parses (upload-v2 "format").
	Format string `json:"format"`
	// Flavor is the comma separated upload-v2 "flavor" list.
	Flavor string `json:"flavor"`
}

// Known are the deployments the uploader knows how to talk to. The first is
// the default. Adding a tenant is a data change here.
var Known = []Tenant{
	{BaseURL: "https://forever.chronicleclassic.com", Format: "v22-cleu", Flavor: "vanilla,wow-forever"},
}

// Resolve picks the tenant to use: the saved one, or the default. A non-empty
// override replaces the base URL; a known base URL also brings its format and
// flavor.
func Resolve(saved Tenant, override string) Tenant {
	t := saved
	if t.BaseURL == "" {
		t = Known[0]
	}
	if override == "" {
		return t
	}
	override = strings.TrimRight(override, "/")
	for _, k := range Known {
		if k.BaseURL == override {
			return k
		}
	}
	t.BaseURL = override
	return t
}
