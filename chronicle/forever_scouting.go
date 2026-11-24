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
	"github.com/Emyrk/chronicle/combatlog/parser/types"
	"github.com/Emyrk/chronicle/combatlog/parser/types/combatant"
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
	Race               *string    `json:"race"`
	Gender             *string    `json:"gender"`
	RaceObservedAt     *time.Time `json:"race_observed_at"`
	GenderObservedAt   *time.Time `json:"gender_observed_at"`
}

func scoutingPayload(players *scouting.Scouting, realms map[guid.GUID]uuid.UUID, reference time.Time) ([]byte, error) {
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
		known := players.FreshKnownAt(id, reference)
		// A reconciled source identity labels new scouting-only/static profiles.
		// It is not a fresh name observation and cannot rename existing profiles.
		// Do not use Latest's potentially expired or future observation name.
		name, _ := players.IdentityName(id)
		row := scoutingPlayerInput{ID: id.String(), RealmID: realmID, Name: name}
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
		// Static attributes apply at all event times. LastSeen is only their
		// persistence revision clock, not the beginning of their validity.
		race, gender := players.StaticAttributes(id)
		if race != types.HeroRacesUnknown {
			value := race.String()
			row.Race = &value
			row.RaceObservedAt = &row.ObservedAt
		}
		if gender != types.HeroGenderUnknown {
			value := gender.String()
			row.Gender = &value
			row.GenderObservedAt = &row.ObservedAt
		}
		rows = append(rows, row)
	}
	return json.Marshal(rows)
}

// Enrich only missing fields on existing unit and combatant messages. Static
// race/gender apply even before the first scouting observation; name and level
// and guild remain event-time evidence. Supplemental guilds are display-only;
// provenance excludes them from combat-derived armory writes and ownership votes.
// Never synthesize party or affiliation.
type scoutingAdvancer struct {
	realms     map[guid.GUID]uuid.UUID
	identity   *foreverIdentity
	source     consumers.Advancer
	players    *scouting.Scouting
	catalog    *participantRealmCatalog
	reconciled map[guid.GUID]scoutingReconciliation
	// end is the maximum parsed log timestamp, never scouting LastSeen or wall time.
	end time.Time
}

func (s *scoutingAdvancer) Advance(ctx context.Context) ([]messages.Message, error) {
	batch, err := s.source.Advance(ctx)
	for _, message := range batch {
		if message.Date().After(s.end) {
			s.end = message.Date()
		}
	}
	if s.catalog != nil && s.identity != nil {
		raw := s.identity.combat.(*combatIdentity)
		for _, message := range batch {
			switch m := message.(type) {
			case *messages.Unit:
				raw.observe(m.Guid, m.Name, m.RawRealm)
			case *messages.Combatant:
				raw.observe(m.Guid, m.Name, m.RawRealm)
			case *messages.CombatantTalents:
				raw.observe(m.Guid, m.PlayerName, "")
			}
		}
	}
	for i, message := range batch {
		var id guid.GUID
		var unitName string
		switch m := message.(type) {
		case *messages.Unit:
			id, unitName = m.Guid, m.Name
		case *messages.Combatant:
			id, unitName = m.Guid, m.Name
		default:
			continue
		}
		players, realms := s.currentScouting(id)
		if !s.safeIdentity(players, realms, id, unitName) {
			continue
		}
		if message, ok := message.(*messages.Combatant); ok {
			copy := *message
			race, gender := players.StaticAttributes(id)
			if copy.Race == "" || copy.Race == types.HeroRacesUnknown {
				copy.Race = race
				copy.ScoutingRace = race != types.HeroRacesUnknown
			}
			if copy.Gender <= types.HeroGenderUnknown {
				copy.Gender = gender
				copy.ScoutingGender = gender != types.HeroGenderUnknown
			}
			if copy.Guild == nil {
				known := players.FreshKnownAt(id, message.Date())
				if known.Guild != nil {
					// Empty means explicitly guildless; nil means unknown. Do
					// not overwrite either genuine combat membership or guildlessness.
					copy.Guild = &combatant.Guild{Name: *known.Guild.Guild}
					copy.ScoutingGuild = true
				}
			}
			batch[i] = &copy
			continue
		}
		unit := message.(*messages.Unit)
		known := players.FreshKnownAt(unit.Guid, unit.Date())
		copy := *unit
		if (copy.Name == "" || copy.Name == "Unknown") && known.Name != nil {
			copy.Name = known.Name.Name
			copy.ScoutingName = true
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

// The same realm/name reconciliation gates both temporal and static enrichment.
func (s *scoutingAdvancer) safeIdentity(players *scouting.Scouting, realms map[guid.GUID]uuid.UUID, id guid.GUID, unitName string) bool {
	if realmID, resolved := realms[id]; !resolved || realmID == uuid.Nil {
		return false
	}
	sourceName, ok := players.IdentityName(id)
	if !ok || (meaningfulIdentityName(unitName) && sourceName != unitName) {
		return false
	}
	if s.identity != nil {
		name, safe := uniqueIdentityName(s.identity.ObservedPlayerNames(id))
		if !safe || (name != "" && name != sourceName) || (meaningfulIdentityName(unitName) && name != "" && name != unitName) {
			return false
		}
	}
	return true
}

// Cache only while the raw name/realm evidence is unchanged. This permits late
// combat evidence to discard incompatible sources BEFORE merging their deltas.
type scoutingReconciliation struct {
	name, realm      string
	safe, realmKnown bool
	players          *scouting.Scouting
	realms           map[guid.GUID]uuid.UUID
}

func (s *scoutingAdvancer) currentScouting(id guid.GUID) (*scouting.Scouting, map[guid.GUID]uuid.UUID) {
	if s.catalog == nil || s.identity == nil {
		return s.players, s.realms
	}
	evidence := s.identity.combat
	name, safe := uniqueIdentityName(evidence.ObservedPlayerNames(id))
	realm, known := evidence.LookupPlayerRealm(id, name)
	cached, ok := s.reconciled[id]
	if ok && cached.name == name && cached.safe == safe && cached.realm == realm && cached.realmKnown == known {
		return cached.players, cached.realms
	}
	players, realms, identity := reconcileForeverScouting(s.players.ForPlayer(id), evidence, s.catalog)
	delete(s.identity.inferred, id)
	if value, ok := identity.inferred[id]; ok {
		s.identity.inferred[id] = value
	}
	if s.reconciled == nil {
		s.reconciled = make(map[guid.GUID]scoutingReconciliation)
	}
	s.reconciled[id] = scoutingReconciliation{name: name, realm: realm, safe: safe, realmKnown: known, players: players, realms: realms}
	return players, realms
}
