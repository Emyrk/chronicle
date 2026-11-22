package chronicle

import (
	"context"
	"regexp"

	"github.com/Emyrk/chronicle/combatlog/parser/forever/scouting"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/database"
	"github.com/google/uuid"
)

var foreverScoutingServerID = uuid.MustParse("2e1868f9-d491-4a64-8622-8ba4785fe5e5")

// US1/US2 PvE/PvP and US2 RPPvP have observed fixtures. Other supported
// region/cluster combinations and RP are explicitly approved inferences, not
// verified API observations. Exact server/tenant catalog lookup remains required.
// AU and beta have no inferred mapping. Accept only fully compact or consistently
// spaced forms, with positive cluster and shard numbers.
var foreverCompactRealm = regexp.MustCompile(`^CAMWOW(US|EU|KR|TW)[1-9][0-9]*Realm[1-9][0-9]*(PvE|PvP|RPPvP|RP)$`)
var foreverSpacedRealm = regexp.MustCompile(`^CAMWOW (US|EU|KR|TW)[1-9][0-9]* Realm [1-9][0-9]* (PvE|PvP|RPPvP|RP)$`)

func canonicalScoutingRealm(raw string) string {
	match := foreverCompactRealm.FindStringSubmatch(raw)
	if match == nil {
		match = foreverSpacedRealm.FindStringSubmatch(raw)
	}
	if match == nil {
		return raw
	} // Otherwise require an exact server-scoped DB name.
	var ruleset string
	switch match[2] {
	case "PvE":
		ruleset = "Normal"
	case "PvP":
		ruleset = "PvP"
	case "RPPvP":
		ruleset = "Roleplay PvP"
	case "RP":
		ruleset = "Roleplay"
	}
	return ruleset + "-" + match[1]
}

type scoutingRealmStore interface {
	GetWoWServer(context.Context, uuid.UUID) (database.WowServer, error)
	ListWoWServerRealms(context.Context, uuid.UUID) ([]database.WowServerRealm, error)
}

// Resolve all identities with two bounded queries, never one query per player.
// Untimestamped conflicting/missing source realms are not repaired using a newer
// LastSeen or a different source: their observation history cannot be assigned safely.
func resolveScoutingRealms(ctx context.Context, db scoutingRealmStore, players *scouting.Scouting, tenantID uuid.UUID) (map[guid.GUID]uuid.UUID, error) {
	catalog, err := loadForeverIdentityCatalog(ctx, db, tenantID)
	if err != nil {
		return nil, err
	}
	_, realms, _ := reconcileForeverScouting(players, nil, catalog)
	return realms, nil
}
