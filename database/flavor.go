package database

import (
	"sort"
	"strings"
)

// WoWFlavor is the server-mechanics axis split out of LogType (format vs flavor
// vs dataset). A flavor is a *set of capability tags*, not a scalar: servers
// overlap and split on the edges (e.g. Turtle/Kronos/VanillaPlus share most
// behavior but differ at the margins), so mechanics are gated by tag membership
// (flavor.Has(tag)) rather than an inheritance hierarchy. See TODO_DATASETS.md
// "Log Format / Flavor Split".
//
// Tags are matched by membership only; there are no boolean expressions. A
// mechanic is tagged with the broadest tag it needs (FlavorWrath for shared
// WotLK behavior; FlavorAzerothcore for an AzerothCore-specific quirk), and
// overrides are handled in code at the mechanic site by checking the more
// specific (edge) tag before the base tag.
type WoWFlavor []FlavorTag

// FlavorTag is a single behavior characteristic a server may satisfy.
type FlavorTag string

const (
	// FlavorVanilla is 1.12-era behavior (Turtle, Kronos, VanillaPlus, ...).
	FlavorVanilla FlavorTag = "vanilla"
	// FlavorTBC is (TBC)-era behavior.
	FlavorTBC FlavorTag = "tbc"
	// FlavorWrath is 3.3.5a (WotLK)-era behavior (Warmane, Epoch, AzerothCore).
	FlavorWrath FlavorTag = "wrath"
	// FlavorTurtle is Turtle WoW-specific behavior.
	FlavorTurtle FlavorTag = "turtle"
	// FlavorKronos is Kronos-specific behavior.
	FlavorKronos FlavorTag = "kronos"
	// FlavorEpoch is Project Epoch-specific behavior.
	FlavorEpoch FlavorTag = "epoch"
	// FlavorAzerothcore is AzerothCore-specific behavior (server-side or
	// client-side; distinguish the two via LogFormat, not this tag).
	FlavorAzerothcore FlavorTag = "azerothcore"
	// FlavorAzerothcoreProgression enables progression-server behavior where
	// multiple expansion versions of the same instance can coexist.
	FlavorAzerothcoreProgression FlavorTag = "azerothcore-progression"
	// FlavorVanillaPlus is VanillaPlus-specific behavior.
	FlavorVanillaPlus FlavorTag = "vanillaplus"
	// FlavorOctoWoW is OctoWoW-specific behavior.
	FlavorOctoWoW FlavorTag = "octowow"
	// FlavorAscension is Ascension-specific behavior.
	FlavorAscension FlavorTag = "ascension"
	// FlavorNightmareOfUrsol is the "Nightmare of Ursol" custom content shared
	// by Turtle and OctoWoW.
	FlavorNightmareOfUrsol FlavorTag = "nightmare-of-ursol"
)

// AllFlavorTagValues returns every known FlavorTag. Keep in sync with the
// constants above.
func AllFlavorTagValues() []FlavorTag {
	return []FlavorTag{
		FlavorVanilla,
		FlavorTBC,
		FlavorWrath,
		FlavorTurtle,
		FlavorKronos,
		FlavorEpoch,
		FlavorAzerothcore,
		FlavorAzerothcoreProgression,
		FlavorVanillaPlus,
		FlavorOctoWoW,
		FlavorAscension,
		FlavorNightmareOfUrsol,
	}
}

// serverFlavors holds explicit tag sets for servers whose flavor is more than
// {base, serverTag} — e.g. servers that share custom content with another
// server. Keyed by services.ServerName; string literals are used here because
// the database package can't import services (import cycle). Keep these keys in
// sync with the services.ServerIdentity* constants.
var serverFlavors = map[string]WoWFlavor{
	"turtle":  {FlavorVanilla, FlavorNightmareOfUrsol, FlavorTurtle},
	"octowow": {FlavorVanilla, FlavorNightmareOfUrsol, FlavorOctoWoW},
}

// ServerFlavor builds the default flavor tag set for a server build. base is
// the era tag the build belongs to (FlavorVanilla for 1.12, FlavorWrath for
// 3.3.5a); serverName is services.ServerName, whose value doubles as the
// server-specific tag (e.g. "turtle", "epoch").
//
// Servers with shared/custom content are listed explicitly in serverFlavors;
// everything else falls back to the generic {base, serverTag}.
//
// This is the build-tag-derived default used to stamp new log groups and to
// backfill existing rows. It is a bootstrap: flavor's permanent source of truth
// is per-tenant runtime config (server > tenant), like datasets. Because flavor
// is stored as a plain text[] (FlavorTag is the vocabulary), the tag set can be
// revised without a schema change.
func ServerFlavor(serverName string, base FlavorTag) WoWFlavor {
	if f, ok := serverFlavors[serverName]; ok {
		return f
	}
	tag := FlavorTag(serverName)
	if tag == base {
		// Avoid duplicating the base tag (defensive; server names differ today).
		return WoWFlavor{base}
	}
	return WoWFlavor{base, tag}
}

// Strings renders the flavor as a []string for storage in a text[] column.
func (f WoWFlavor) Strings() []string {
	if f == nil {
		return nil
	}
	out := make([]string, len(f))
	for i, t := range f {
		out[i] = string(t)
	}
	return out
}

// FlavorFromStrings reconstructs a WoWFlavor from a text[] column value.
func FlavorFromStrings(s []string) WoWFlavor {
	if s == nil {
		return nil
	}
	out := make(WoWFlavor, len(s))
	for i, v := range s {
		out[i] = FlavorTag(v)
	}
	return out
}

// Has reports whether the flavor includes tag.
func (f WoWFlavor) Has(tags ...FlavorTag) bool {
	for _, tag := range tags {
		for _, t := range f {
			if t == tag {
				return true
			}
		}
	}

	return false
}

// Merge returns a deduplicated flavor containing f followed by tags from
// additional that are not already present. Neither input slice is modified.
func (f WoWFlavor) Merge(additional WoWFlavor) WoWFlavor {
	merged := make(WoWFlavor, 0, len(f)+len(additional))
	for _, tag := range append(append(WoWFlavor(nil), f...), additional...) {
		if !merged.Has(tag) {
			merged = append(merged, tag)
		}
	}
	return merged
}

// CanonicalKey returns a stable string key for a flavor set by sorting and
// deduplicating tags. Two flavors with the same tags in any order produce the
// same key. Used as a map key for caching per-flavor resources.
func (f WoWFlavor) CanonicalKey() string {
	if len(f) == 0 {
		return ""
	}
	seen := make(map[FlavorTag]struct{}, len(f))
	tags := make([]string, 0, len(f))
	for _, t := range f {
		if _, ok := seen[t]; ok {
			continue
		}
		seen[t] = struct{}{}
		tags = append(tags, string(t))
	}
	sort.Strings(tags)
	return strings.Join(tags, ",")
}

// Flavor returns the bootstrap flavor tag set for a LogType.
//
// NOTE: this derivation is a temporary bridge. Flavor's permanent source of
// truth is per-tenant runtime configuration (resolved server > tenant, like
// datasets); until that exists, the parser derives a sensible default flavor
// from the already-known LogType so mechanics can be gated on tags today.
// Because there is no persisted flavor column yet, changing these tag sets is a
// pure code edit.
//
// An unknown LogType returns nil (Has is always false).
func (e LogType) Flavor() WoWFlavor {
	switch e {
	case LogTypeV1:
		return WoWFlavor{FlavorVanilla, FlavorTurtle}
	case LogTypeV2:
		return WoWFlavor{FlavorVanilla}
	case LogTypeKronos:
		return WoWFlavor{FlavorVanilla, FlavorKronos}
	case LogTypeWarmane:
		return WoWFlavor{FlavorWrath}
	case LogTypeEpoch:
		return WoWFlavor{FlavorWrath, FlavorEpoch}
	case LogTypeAzerothcoreClientside, LogTypeAzerothcore:
		return WoWFlavor{FlavorWrath, FlavorAzerothcore}
	}
	return nil
}
