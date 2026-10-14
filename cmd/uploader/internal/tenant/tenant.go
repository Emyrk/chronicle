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
	// Layout is what the installed client looks like on disk and in the
	// process table.
	Layout Layout `json:"layout"`
}

// Layout describes a WoW client for the uploader: where its logs live, how its
// flavor folders are recognised and what its processes are called. Supporting
// another WoW version is a new Layout value, not new code.
type Layout struct {
	// LogDir is the combat log directory relative to a flavor folder.
	LogDir string `json:"log_dir"`
	// FlavorMarker is the file the client writes into every flavor folder.
	FlavorMarker string `json:"flavor_marker"`
	// FlavorAffix must start and end a flavor folder's name ("_classic_").
	FlavorAffix string `json:"flavor_affix"`
	// ProcessNames are client executable names, case-insensitive. Helpers such
	// as WoWUp are deliberately absent.
	ProcessNames []string `json:"process_names"`
	// ProcessPrefixes match clients whose name carries a suffix (the macOS
	// app reports "World of Warcraft" plus an edition).
	ProcessPrefixes []string `json:"process_prefixes"`
}

// DefaultLayout is the layout of the Blizzard client family WoW Forever uses.
var DefaultLayout = Layout{
	LogDir:       "Logs",
	FlavorMarker: ".flavor.info",
	FlavorAffix:  "_",
	ProcessNames: []string{
		"wow.exe", "wow-64.exe", "wowb.exe", "wowt.exe",
		"wowclassic.exe", "wowclassicb.exe", "wowclassict.exe",
	},
	ProcessPrefixes: []string{"world of warcraft"},
}

// Known are the deployments the uploader knows how to talk to. The first is
// the default. Adding a tenant is a data change here.
var Known = []Tenant{
	{BaseURL: "https://forever.chronicleclassic.com", Format: "v22-cleu", Flavor: "vanilla,wow-forever", Layout: DefaultLayout},
}

// Resolve picks the tenant to use: the saved one, or the default. A non-empty
// override replaces the base URL; a known base URL also brings its format,
// flavor and layout. A saved tenant from before layouts existed gets the
// default one.
func Resolve(saved Tenant, override string) Tenant {
	t := saved
	if t.BaseURL == "" {
		t = Known[0]
	}
	if t.Layout.LogDir == "" {
		t.Layout = DefaultLayout
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
