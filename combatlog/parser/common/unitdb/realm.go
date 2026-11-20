package unitdb

import "github.com/Emyrk/chronicle/combatlog/parser/guid"

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
// when no evidence is available. Callers must not pass another name's fallback.
func (us *Units) PlayerRawRealm(id guid.GUID, name, known string) string {
	if us.playerRealmLookup != nil && id.IsPlayer() && name != "" {
		if raw, ok := us.playerRealmLookup.LookupPlayerRealm(id, name); ok && raw != "" {
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
