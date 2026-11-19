package chronicle

import (
	"context"
	"errors"
	"regexp"

	"github.com/Emyrk/chronicle/combatlog/parser/forever/scouting"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/database"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

var foreverScoutingServerID = uuid.MustParse("2e1868f9-d491-4a64-8622-8ba4785fe5e5")

// These clusters/rulesets are confirmed Forever API forms. Shard numbers are
// positive integers, not realm identities. Do not infer unobserved regions or
// rulesets, or fold AU into US merely because the catalog has no AU realm.
var foreverNormalUSRealm = regexp.MustCompile(`^(CAMWOWUS[12]Realm[1-9][0-9]*PvE|CAMWOW US2 Realm [1-9][0-9]* PvE)$`)
var foreverPvPUSRealm = regexp.MustCompile(`^CAMWOWUS[12]Realm[1-9][0-9]*PvP$`)
var foreverRoleplayPvPUSRealm = regexp.MustCompile(`^CAMWOWUS2Realm[1-9][0-9]*RPPvP$`)

func canonicalScoutingRealm(raw string) string {
	switch {
	case foreverNormalUSRealm.MatchString(raw):
		return "Normal-US"
	case foreverPvPUSRealm.MatchString(raw):
		return "PvP-US"
	case foreverRoleplayPvPUSRealm.MatchString(raw):
		return "Roleplay PvP-US"
	}
	return raw // Only an exact server-scoped DB name can match anything else.
}

type scoutingRealmStore interface {
	GetWoWServer(context.Context, uuid.UUID) (database.WowServer, error)
	ListWoWServerRealms(context.Context, uuid.UUID) ([]database.WowServerRealm, error)
}

// Resolve all identities with two bounded queries, never one query per player.
// Untimestamped conflicting/missing source realms are not repaired using a newer
// LastSeen or a different source: their observation history cannot be assigned safely.
func resolveScoutingRealms(ctx context.Context, db scoutingRealmStore, players *scouting.Scouting, tenantID uuid.UUID) (map[guid.GUID]uuid.UUID, error) {
	resolved := make(map[guid.GUID]uuid.UUID)
	if players.Len() == 0 || tenantID == uuid.Nil {
		return resolved, nil
	}
	server, err := db.GetWoWServer(ctx, foreverScoutingServerID)
	if errors.Is(err, pgx.ErrNoRows) {
		return resolved, nil
	}
	if err != nil {
		return nil, err
	}
	if server.ID != foreverScoutingServerID || !server.TenantID.Valid || server.TenantID.UUID != tenantID {
		return resolved, nil
	}
	realms, err := db.ListWoWServerRealms(ctx, server.ID)
	if err != nil {
		return nil, err
	}
	byName := make(map[string]uuid.UUID)
	for _, realm := range realms {
		if realm.ServerID != server.ID || realm.ID == uuid.Nil || realm.Name == "" || realm.Name == "Unknown" {
			continue
		}
		if previous, ok := byName[realm.Name]; ok && previous != realm.ID {
			byName[realm.Name] = uuid.Nil
			continue
		}
		byName[realm.Name] = realm.ID
	}
	for _, id := range players.PlayerIDs() {
		snapshot, _ := players.Latest(id)
		var candidate uuid.UUID
		valid := len(snapshot.RealmCandidates) > 0
		for _, raw := range snapshot.RealmCandidates {
			realmID, ok := byName[canonicalScoutingRealm(raw)]
			if raw == "" || !ok || realmID == uuid.Nil || (candidate != uuid.Nil && candidate != realmID) {
				valid = false
				break
			}
			candidate = realmID
		}
		if valid && candidate != uuid.Nil {
			resolved[id] = candidate
		}
	}
	return resolved, nil
}
