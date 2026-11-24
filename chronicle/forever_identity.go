package chronicle

import (
	"context"
	"errors"
	"slices"
	"strings"

	"github.com/Emyrk/chronicle/combatlog/parser/common/unitdb"
	"github.com/Emyrk/chronicle/combatlog/parser/forever/scouting"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/database"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

// inferredRealm is untimestamped source provenance, never an observation clock.
// It is internal parse metadata only; it does not create catalog or API records.
type inferredRealm struct{ name, raw string }
type foreverIdentity struct {
	combat    playerIdentityEvidence
	inferred  map[guid.GUID]inferredRealm
	finalized bool
}

func (i *foreverIdentity) LookupPlayerRealm(id guid.GUID, name string) (string, bool) {
	if raw, ok := i.combat.LookupPlayerRealm(id, name); ok {
		return raw, true
	}
	value, ok := i.inferred[id]
	if ok && value.name == name {
		return value.raw, true
	}
	return "", i.finalized
}
func (i *foreverIdentity) ObservedPlayerNames(id guid.GUID) []string {
	return i.combat.ObservedPlayerNames(id)
}

// combatIdentity retains raw evidence during the normal parse, before scouting
// enrichment. Supplementary names must never manufacture a combat collision.
type playerIdentityEvidence interface {
	unitdb.PlayerRealmLookup
	ObservedPlayerNames(guid.GUID) []string
}
type combatIdentity struct {
	live   playerIdentityEvidence
	names  map[guid.GUID]map[string]struct{}
	realms map[guid.GUID]map[string]string
}

func (i *combatIdentity) LookupPlayerRealm(id guid.GUID, name string) (string, bool) {
	if i.live != nil {
		if raw, ok := i.live.LookupPlayerRealm(id, name); ok {
			return raw, true
		}
	}
	raw, ok := i.realms[id][name]
	return raw, ok
}
func (i *combatIdentity) ObservedPlayerNames(id guid.GUID) []string {
	var names []string
	if i.live != nil {
		names = i.live.ObservedPlayerNames(id)
	}
	for name := range i.names[id] {
		names = append(names, name)
	}
	return names
}
func (i *combatIdentity) observe(id guid.GUID, name, rawRealm string) {
	if !id.IsPlayer() || id.IsZero() || !meaningfulIdentityName(name) {
		return
	}
	if i.names == nil {
		i.names = make(map[guid.GUID]map[string]struct{})
	}
	if i.names[id] == nil {
		i.names[id] = make(map[string]struct{})
	}
	i.names[id][name] = struct{}{}
	if rawRealm != "" {
		if i.realms == nil {
			i.realms = make(map[guid.GUID]map[string]string)
		}
		if i.realms[id] == nil {
			i.realms[id] = make(map[string]string)
		}
		if _, known := i.realms[id][name]; !known {
			i.realms[id][name] = rawRealm
		}
	}
}

func meaningfulIdentityName(name string) bool {
	switch strings.ToLower(strings.TrimSpace(name)) {
	case "", "unknown", "nil":
		return false
	}
	return true
}
func uniqueIdentityName(names []string) (string, bool) {
	first := ""
	for _, name := range names {
		if !meaningfulIdentityName(name) {
			continue
		}
		if first != "" && first != name {
			return "", false
		}
		first = name
	}
	return first, true
}

func loadForeverIdentityCatalog(ctx context.Context, db scoutingRealmStore, tenant uuid.UUID) (*participantRealmCatalog, error) {
	if tenant == uuid.Nil {
		return nil, nil
	}
	server, err := db.GetWoWServer(ctx, foreverScoutingServerID)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	if server.ID != foreverScoutingServerID || !server.TenantID.Valid || server.TenantID.UUID != tenant {
		return nil, nil
	}
	realms, err := db.ListWoWServerRealms(ctx, server.ID)
	if err != nil {
		return nil, err
	}
	// Preserve scouting's rejection of placeholder catalog records; no missing
	// identity may become the database's "Unknown" realm.
	realms = slices.DeleteFunc(realms, func(realm database.WowServerRealm) bool {
		return !meaningfulIdentityName(realm.Name)
	})
	return newParticipantRealmCatalog(server.ID, realms), nil
}

// reconcileForeverScouting discards incompatible sources BEFORE merging deltas.
// Combat identity controls names and realms. Scouting-only GUIDs must have one
// meaningful name and unanimous, catalog-resolved source realms.
func reconcileForeverScouting(players *scouting.Scouting, combat playerIdentityEvidence, catalog *participantRealmCatalog) (*scouting.Scouting, map[guid.GUID]uuid.UUID, *foreverIdentity) {
	if combat == nil {
		combat = &combatIdentity{}
	}
	identity := &foreverIdentity{combat: combat, inferred: make(map[guid.GUID]inferredRealm)}
	filtered := players.FilterSources(func(id guid.GUID, player scouting.Player) (scouting.Player, bool) {
		// Scouting stores the character name separately from Realm. Hyphens
		// separate character-name components here, not a CLEU realm suffix.
		// Realm stripping would turn First-Last into First and reject its guild.
		player.Name = strings.ReplaceAll(player.Name, "-", " ")
		for j := range player.Observations {
			player.Observations[j].Name = strings.ReplaceAll(player.Observations[j].Name, "-", " ")
		}
		combatName, safe := uniqueIdentityName(combat.ObservedPlayerNames(id))
		if !safe || !meaningfulIdentityName(player.Name) || (combatName != "" && combatName != player.Name) {
			return player, false
		}
		if raw, known := combat.LookupPlayerRealm(id, player.Name); known {
			resolved := catalog.resolve(raw)
			if !resolved.Valid {
				return player, false
			} // authoritative but unmapped: no scouting fallback
			sourceRealm := catalog.resolve(canonicalScoutingRealm(player.Realm))
			// Do not copy another realm's same-name history into this profile. Unknown
			// scalar metadata is usable only because the combat identity is authoritative.
			if sourceRealm.Valid && sourceRealm.UUID != resolved.UUID {
				return player, false
			}
		}
		return player, true
	})
	realms := make(map[guid.GUID]uuid.UUID)
	for _, id := range filtered.PlayerIDs() {
		name, safe := uniqueIdentityName(filtered.SourceNames(id))
		if !safe || name == "" {
			continue
		}
		if raw, known := combat.LookupPlayerRealm(id, name); known {
			if resolved := catalog.resolve(raw); resolved.Valid {
				realms[id] = resolved.UUID
			}
			continue
		}
		snapshot, _ := filtered.Latest(id)
		var candidate uuid.NullUUID
		for _, raw := range snapshot.RealmCandidates {
			resolved := catalog.resolve(canonicalScoutingRealm(raw))
			if !resolved.Valid || (candidate.Valid && candidate.UUID != resolved.UUID) {
				safe = false
				break
			}
			candidate = resolved
		}
		if safe && candidate.Valid {
			realms[id] = candidate.UUID
			// Store a catalog-resolvable label, not a guessed time or a realm creation.
			identity.inferred[id] = inferredRealm{name: name, raw: canonicalScoutingRealm(snapshot.RealmCandidates[0])}
		}
	}
	filtered = filtered.FilterSources(func(id guid.GUID, player scouting.Player) (scouting.Player, bool) {
		_, ok := realms[id]
		return player, ok
	})
	return filtered, realms, identity
}

// UnitDB can learn additional names from raw unit/combatant metadata. Recheck
// after consumption, before the direct scouting transaction is even built.
func finalizeScoutingRealms(units *unitdb.Units, realms map[guid.GUID]uuid.UUID) {
	for id := range realms {
		if units.PlayerIdentityAmbiguous(id) {
			delete(realms, id)
		}
	}
}

// Finalization revokes tentative inferred realms before any armory write. A
// revoked inference must not survive through UnitDB's cached RawRealm fallback.
func finalizeForeverScouting(players *scouting.Scouting, identity *foreverIdentity, catalog *participantRealmCatalog) (*scouting.Scouting, map[guid.GUID]uuid.UUID) {
	filtered, realms, finalIdentity := reconcileForeverScouting(players, identity.combat, catalog)
	identity.inferred = finalIdentity.inferred
	identity.finalized = true
	return filtered, realms
}
