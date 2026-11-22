package armory

import (
	"context"
	"fmt"
	"slices"
	"strings"
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/common/unitdb"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/types/combatant"
	"github.com/Emyrk/chronicle/database"
	"github.com/google/uuid"
)

// PlayerRealmResolver is supplied only for Forever. An invalid result forbids
// every player-owned write; nil preserves the legacy instance-realm policy.
type PlayerRealmResolver func(combatant.Combatant) uuid.NullUUID

type guildKey struct {
	realm uuid.UUID
	name  string
}

func (g *Tracker) eligiblePlayers(units *unitdb.Units, resolve PlayerRealmResolver) (*Tracker, map[guid.GUID]uuid.UUID) {
	view := *g
	view.Players = make(map[guid.GUID]combatant.Combatant)
	view.Participant = make(map[guid.GUID]struct{})
	view.Guilds = make(map[string]map[guid.GUID]struct{})
	realms := make(map[guid.GUID]uuid.UUID)
	for id, player := range g.Players {
		units.ObservePlayerName(id, player.Name)
		if units.PlayerIdentityAmbiguous(id) {
			continue
		}
		realm := resolve(player)
		if !realm.Valid || realm.UUID == uuid.Nil {
			continue
		}
		view.Players[id] = player
		realms[id] = realm.UUID
		if _, ok := g.Participant[id]; ok {
			view.Participant[id] = struct{}{}
		}
	}
	for name, members := range g.Guilds {
		for id := range members {
			if _, ok := realms[id]; !ok {
				continue
			}
			if view.Guilds[name] == nil {
				view.Guilds[name] = make(map[guid.GUID]struct{})
			}
			view.Guilds[name][id] = struct{}{}
		}
	}
	return &view, realms
}

func (g *Tracker) insertPlayerRealmGuilds(ctx context.Context, instanceRealm uuid.UUID, realms map[guid.GUID]uuid.UUID, tx database.Store) (map[guildKey]uuid.UUID, *database.Guild, error) {
	// Preserve the existing majority/tie algorithm, but both its votes and its
	// participant denominator are restricted to armory-eligible players.
	majority, most := "", 0
	for _, name := range sortedGuildNames(g.Guilds) {
		if count := len(g.Guilds[name]); count > most {
			majority, most = name, count
		}
	}
	if most <= len(g.Participant)/2 {
		majority = ""
	}
	keys := make(map[guildKey]struct{})
	for id, player := range g.Players {
		if player.Guild != nil && player.Guild.Name != "" {
			keys[guildKey{realms[id], player.Guild.Name}] = struct{}{}
		}
	}
	if majority != "" {
		keys[guildKey{instanceRealm, majority}] = struct{}{}
	}
	ordered := make([]guildKey, 0, len(keys))
	for key := range keys {
		ordered = append(ordered, key)
	}
	slices.SortFunc(ordered, func(a, b guildKey) int {
		if n := strings.Compare(a.realm.String(), b.realm.String()); n != 0 {
			return n
		}
		return strings.Compare(a.name, b.name)
	})
	ids := make(map[guildKey]uuid.UUID, len(keys))
	var raidGuild *database.Guild
	for _, key := range ordered {
		guild, err := tx.UpsertGuild(ctx, database.UpsertGuildParams{RealmID: key.realm, Name: key.name, CreatedAt: database.Timestamptz(time.Now())})
		if err != nil {
			return nil, nil, fmt.Errorf("upsert player realm guild: %w", err)
		}
		ids[key] = guild.ID
		if key.realm == instanceRealm && key.name == majority {
			raidGuild = &guild
		}
	}
	return ids, raidGuild, nil
}
