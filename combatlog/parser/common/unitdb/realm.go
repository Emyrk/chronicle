package unitdb

import (
	"strings"

	"github.com/Emyrk/chronicle/combatlog/parser/guid"
)

// PlayerRealmLookup supplies raw parse-wide evidence, keyed by GUID AND name.
// A provider must not substitute another name's realm when an exact match is absent.
type PlayerRealmLookup interface {
	LookupPlayerRealm(guid.GUID, string) (string, bool)
}

// SetPlayerRealmLookup installs an optional parse-local dependency before consumption.
// Like the mutable unit catalog, the provider is used on the parser goroutine.
func (us *Units) SetPlayerRealmLookup(lookup PlayerRealmLookup) {
	us.playerRealmLookup = lookup
}

// PlayerRawRealm enriches metadata for this exact name, retaining a known value
// when no evidence is available. A known empty result explicitly revokes a
// tentative inferred realm. Callers must not pass another name's fallback.
func (us *Units) PlayerRawRealm(id guid.GUID, name, known string) string {
	if us.playerRealmLookup != nil && id.IsPlayer() && name != "" {
		if raw, ok := us.playerRealmLookup.LookupPlayerRealm(id, name); ok {
			return raw
		}
	}
	return known
}

// RefreshPlayerRealms attaches late evidence before finalization/persistence
// reads the public compatibility maps. It cannot correct already emitted event
// snapshots and does not make GUID-only gear history realm-qualified.
func (us *Units) RefreshPlayerRealms() {
	if us.playerRealmLookup == nil {
		return
	}
	for id := range us.Info {
		us.Get(id)
	}
	for id := range us.Players {
		us.GetPlayer(id)
	}
}

// ObservePlayerName retains identity evidence before GUID-only merges or early
// returns discard it. It does not alter combat attribution or merged snapshots.
func (us *Units) ObservePlayerName(id guid.GUID, name string) {
	if !id.IsPlayer() || id.IsZero() || !meaningfulPlayerName(name) {
		return
	}
	if us.playerNames == nil {
		us.playerNames = make(map[guid.GUID]map[string]struct{})
	}
	if us.playerNames[id] == nil {
		us.playerNames[id] = make(map[string]struct{})
	}
	us.playerNames[id][name] = struct{}{}
}

func meaningfulPlayerName(name string) bool {
	switch strings.ToLower(strings.TrimSpace(name)) {
	case "", "unknown", "nil":
		return false
	default:
		return true
	}
}

// PlayerIdentityAmbiguous is monotonic across the entire parse, including
// parser names that were never attached to a UNIT_INFO/COMBATANT_INFO record.
// Call after parsing finishes when deciding whether armory writes are safe.
func (us *Units) PlayerIdentityAmbiguous(id guid.GUID) bool {
	if source, ok := us.playerRealmLookup.(interface{ ObservedPlayerNames(guid.GUID) []string }); ok {
		for _, name := range source.ObservedPlayerNames(id) {
			us.ObservePlayerName(id, name)
		}
	}
	return len(us.playerNames[id]) > 1
}
