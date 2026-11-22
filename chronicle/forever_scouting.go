package chronicle

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/Emyrk/chronicle/combatlog/consumers"
	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/forever/events"
	"github.com/Emyrk/chronicle/combatlog/parser/forever/scouting"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/storage"
	"github.com/google/uuid"
)

// Scouting is supplemental. Retain the original artifacts even when a future or
// malformed collection cannot be interpreted by this version of the server.
func (w *WorkerLogParse) loadForeverScouting(ctx context.Context, artifacts []database.LogGroupArtifact) (*scouting.Scouting, error) {
	var allSources []scouting.Source
	for _, artifact := range artifacts {
		if artifact.Kind != ArtifactKindForeverEvents {
			continue
		}
		contents, err := w.parent.Storage.DownloadFile(ctx, BucketRaidLogs, artifact.ObjectKey)
		if errors.Is(err, storage.ErrFileNotFound) {
			w.parent.logger.WarnContext(ctx, "Forever scouting artifact missing", "artifact_id", artifact.ID)
			continue
		}
		if err != nil {
			return nil, fmt.Errorf("download Forever scouting artifact: %w", err)
		}
		decoded, err := events.Decode(ctx, bytes.NewReader(contents))
		if err != nil {
			if ctx.Err() != nil {
				return nil, ctx.Err()
			}
			w.parent.logger.WarnContext(ctx, "skip unsupported Forever scouting artifact", "artifact_id", artifact.ID, "error", err)
			continue
		}
		sources, err := scouting.Decode(decoded)
		if err != nil {
			w.parent.logger.WarnContext(ctx, "skip invalid Forever scouting collection", "artifact_id", artifact.ID, "error", err)
			continue
		}
		allSources = append(allSources, sources...)
	}
	return scouting.New(allSources)
}

type scoutingPlayerInput struct {
	ID                 string     `json:"id"`
	RealmID            uuid.UUID  `json:"realm_id"`
	Name               string     `json:"name"`
	ObservedAt         time.Time  `json:"observed_at"`
	ScoutingLastSeenAt time.Time  `json:"scouting_last_seen_at"`
	NameObservedAt     *time.Time `json:"name_observed_at"`
	Level              *int       `json:"level"`
	LevelObservedAt    *time.Time `json:"level_observed_at"`
	GuildName          *string    `json:"guild_name"`
	GuildKnown         bool       `json:"guild_known"`
	GuildObservedAt    *time.Time `json:"guild_observed_at"`
	Race               *int       `json:"race"`
	Gender             *int       `json:"gender"`
}

func scoutingPayload(players *scouting.Scouting, realms map[guid.GUID]uuid.UUID) ([]byte, error) {
	ids := players.PlayerIDs()
	rows := make([]scoutingPlayerInput, 0, len(ids))
	timestamp := func(o *scouting.Observation) *time.Time {
		if o == nil {
			return nil
		}
		t := time.Unix(o.At, 0).UTC()
		return &t
	}
	for _, id := range ids {
		realmID, ok := realms[id]
		if !ok || realmID == uuid.Nil {
			continue
		}
		snapshot, _ := players.Latest(id)
		known := snapshot.Known
		row := scoutingPlayerInput{ID: id.String(), RealmID: realmID, Name: snapshot.Name}
		row.ObservedAt = time.Unix(snapshot.LastSeen, 0).UTC()
		row.ScoutingLastSeenAt = row.ObservedAt
		if known.Name != nil {
			row.Name = known.Name.Name
			row.NameObservedAt = timestamp(known.Name)
		}
		if known.Level != nil {
			row.Level = known.Level.Level
			row.LevelObservedAt = timestamp(known.Level)
		}
		if known.Guild != nil {
			row.GuildName = known.Guild.Guild
			row.GuildKnown = true
			row.GuildObservedAt = timestamp(known.Guild)
		}
		rows = append(rows, row)
	}
	return json.Marshal(rows)
}

// Enrich only missing fields on existing unit messages. Never synthesize party,
// affiliation, or guild membership, which could change raid ownership votes.
type scoutingAdvancer struct {
	realms   map[guid.GUID]uuid.UUID
	identity *foreverIdentity
	source   consumers.Advancer
	players  *scouting.Scouting
}

func (s *scoutingAdvancer) Advance(ctx context.Context) ([]messages.Message, error) {
	batch, err := s.source.Advance(ctx)
	for i, message := range batch {
		unit, ok := message.(*messages.Unit)
		if !ok {
			continue
		}
		if realmID, resolved := s.realms[unit.Guid]; !resolved || realmID == uuid.Nil {
			continue
		}
		sourceName, ok := s.players.IdentityName(unit.Guid)
		if !ok || (meaningfulIdentityName(unit.Name) && sourceName != unit.Name) {
			continue
		}
		if s.identity != nil {
			name, safe := uniqueIdentityName(s.identity.ObservedPlayerNames(unit.Guid))
			if !safe || (meaningfulIdentityName(unit.Name) && name != "" && name != unit.Name) {
				continue
			}
		}
		known := s.players.KnownAt(unit.Guid, unit.Date().Unix())
		copy := *unit
		if (copy.Name == "" || copy.Name == "Unknown") && known.Name != nil {
			copy.Name = known.Name.Name
		}
		if copy.Level <= 0 && known.Level != nil {
			copy.Level = int32(*known.Level.Level)
			at := time.Unix(known.Level.At, 0).UTC()
			copy.LevelObservedAt = &at
		}
		batch[i] = &copy
	}
	return batch, err
}
