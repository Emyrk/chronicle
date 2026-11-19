package chronicle

import (
	"context"
	"fmt"
	"slices"
	"time"

	"github.com/Emyrk/chronicle/chronicle/parseresult"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/internal/guildrenames"
	"github.com/google/uuid"
)

// InsertParsedGuilds writes only guild observations, not players, gear or
// talents. It refuses a populated player payload rather than silently dropping
// those upserts. The caller owns the parse-generation fence and transaction,
// and must pass the resolved realm name and instance start time (zero if no
// encounters supplied a start). Use an authz-backed store for production writes.
func InsertParsedGuilds(ctx context.Context, store database.Store, realmID uuid.UUID, realmName string, instanceStart time.Time, observation parseresult.ArmoryObservation) (*database.Guild, error) {
	if len(observation.Players) != 0 {
		return nil, fmt.Errorf("guild-only ingest cannot persist %d player observations", len(observation.Players))
	}
	_, majority, err := insertParsedGuildsWithIDs(ctx, store, realmID, realmName, instanceStart, observation)
	return majority, err
}

func insertParsedGuildsWithIDs(ctx context.Context, store database.Store, realmID uuid.UUID, realmName string, instanceStart time.Time, observation parseresult.ArmoryObservation) (map[string]uuid.UUID, *database.Guild, error) {
	if observation.ParticipantCount < 0 {
		return nil, nil, fmt.Errorf("negative participant count")
	}

	// Validate and merge before writing: RenameGuilds merges member sets when
	// multiple old names resolve to one canonical guild.
	members := make(map[string]map[guid.GUID]struct{}, len(observation.Guilds))
	for _, guild := range observation.Guilds {
		name := guild.Name
		if !instanceStart.IsZero() {
			name = guildrenames.Resolve(realmName, instanceStart, name)
		}
		set := members[name]
		if set == nil {
			set = make(map[guid.GUID]struct{}, len(guild.Members))
			members[name] = set
		}
		for _, member := range guild.Members {
			id, err := guid.FromString(member)
			if err != nil {
				return nil, nil, fmt.Errorf("guild %q member %q: %w", guild.Name, member, err)
			}
			if id.IsZero() || !id.IsPlayer() {
				return nil, nil, fmt.Errorf("guild %q has non-player member %s", guild.Name, member)
			}
			set[id] = struct{}{}
		}
	}
	names := make([]string, 0, len(members))
	for name := range members {
		names = append(names, name)
	}
	slices.Sort(names)

	var majority *database.Guild
	guildIDs := make(map[string]uuid.UUID, len(names))
	mostGuildPlayers := 0
	for _, name := range names {
		inserted, err := store.UpsertGuild(ctx, database.UpsertGuildParams{
			RealmID: realmID, Name: name, CreatedAt: database.Timestamptz(time.Now()),
		})
		if err != nil {
			return nil, nil, fmt.Errorf("upsert guild: %w", err)
		}
		if inserted.RealmID == realmID {
			guildIDs[name] = inserted.ID
		}
		if len(members[name]) > mostGuildPlayers {
			mostGuildPlayers = len(members[name])
			majority = &inserted
		}
	}
	if mostGuildPlayers <= observation.ParticipantCount/2 {
		majority = nil
	}
	return guildIDs, majority, nil
}
