package chronicle

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"sort"
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
func (w *WorkerLogParse) loadForeverScouting(ctx context.Context, artifacts []database.LogGroupArtifact) (map[guid.GUID][]scouting.Player, error) {
	players := make(map[guid.GUID][]scouting.Player)
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
		for _, source := range sources {
			// Stable iteration also makes equivalent legacy/modern identity aliases deterministic.
			keys := make([]string, 0, len(source.Players))
			for key := range source.Players {
				keys = append(keys, key)
			}
			sort.Strings(keys)
			for _, raw := range keys {
				id, err := scouting.NormalizeGUID(raw)
				if err != nil {
					return nil, err
				}
				players[id] = append(players[id], source.Players[raw])
			}
		}
	}
	return players, nil
}

// Merge known fields only after each independent source has resolved its deltas.
// Equal timestamps retain the first source, matching the DB's strict-newer guard.
func scoutingKnownAt(players []scouting.Player, at int64) scouting.KnownFields {
	var known scouting.KnownFields
	newer := func(old, next *scouting.Observation) *scouting.Observation {
		if next != nil && (old == nil || next.At > old.At) {
			return next
		}
		return old
	}
	for _, player := range players {
		next := player.KnownAt(at)
		known.Name = newer(known.Name, next.Name)
		known.Level = newer(known.Level, next.Level)
		known.Guild = newer(known.Guild, next.Guild)
		known.Party = newer(known.Party, next.Party)
	}
	return known
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

func scoutingPayload(players map[guid.GUID][]scouting.Player, realmID uuid.UUID) ([]byte, error) {
	ids := make([]guid.GUID, 0, len(players))
	for id := range players {
		ids = append(ids, id)
	}
	sort.Slice(ids, func(i, j int) bool { return ids[i] < ids[j] })
	rows := make([]scoutingPlayerInput, 0, len(ids))
	timestamp := func(o *scouting.Observation) *time.Time {
		if o == nil {
			return nil
		}
		t := time.Unix(o.At, 0).UTC()
		return &t
	}
	for _, id := range ids {
		sources := players[id]
		known := scoutingKnownAt(sources, math.MaxInt64)
		row := scoutingPlayerInput{ID: id.String(), RealmID: realmID}
		var lastSeen int64
		for _, source := range sources {
			if source.LastSeen > lastSeen {
				lastSeen = source.LastSeen
			}
			for _, observation := range source.Observations {
				if observation.At > lastSeen {
					lastSeen = observation.At
				}
			}
		}
		row.ObservedAt = time.Unix(lastSeen, 0).UTC()
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
		// A required name can be present even on a sighting with no At rows. It is an
		// insert identity label, not a newly observed field on an existing armory.
		if row.Name == "" {
			for _, source := range sources {
				if source.Name != "" {
					row.Name = source.Name
					break
				}
			}
		}
		rows = append(rows, row)
	}
	return json.Marshal(rows)
}

// Enrich only missing fields on existing unit messages. Never synthesize party,
// affiliation, or guild membership, which could change raid ownership votes.
type scoutingAdvancer struct {
	source  consumers.Advancer
	players map[guid.GUID][]scouting.Player
}

func (s *scoutingAdvancer) Advance(ctx context.Context) ([]messages.Message, error) {
	batch, err := s.source.Advance(ctx)
	for i, message := range batch {
		unit, ok := message.(*messages.Unit)
		if !ok {
			continue
		}
		known := scoutingKnownAt(s.players[unit.Guid], unit.Date().Unix())
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
