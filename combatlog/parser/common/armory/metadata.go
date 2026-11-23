package armory

import (
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/types"
	"github.com/Emyrk/chronicle/combatlog/parser/types/combatant"
	"github.com/Emyrk/chronicle/database"
	"github.com/jackc/pgx/v5/pgtype"
)

// These clocks belong to raw known observations, not the merged snapshot's Seen.
// In particular, missing metadata must not refresh a previously known value.
type metadataObservations struct {
	Name, Class, Race, Gender, Faction, Level, Guild pgtype.Timestamptz
}

func observeMetadata[T any](clock *pgtype.Timestamptz, seen time.Time, known bool, incoming, previous T) T {
	if !known || (clock.Valid && seen.Before(clock.Time)) {
		return previous
	}
	*clock = database.Timestamptz(seen)
	return incoming
}

func (o *metadataObservations) merge(dst *combatant.Combatant, raw, previous combatant.Combatant) {
	dst.Name = observeMetadata(&o.Name, raw.Seen, raw.Name != "" && raw.Name != "Unknown", raw.Name, previous.Name)
	dst.HeroClass = observeMetadata(&o.Class, raw.Seen, raw.HeroClass != "" && raw.HeroClass != types.HeroClassesUNKNOWN, raw.HeroClass, previous.HeroClass)
	dst.Race = observeMetadata(&o.Race, raw.Seen, raw.Race != "" && raw.Race != types.HeroRacesUnknown, raw.Race, previous.Race)
	dst.Gender = observeMetadata(&o.Gender, raw.Seen, raw.Gender > types.HeroGenderUnknown, raw.Gender, previous.Gender)
	dst.Faction = observeMetadata(&o.Faction, raw.Seen, raw.Faction != nil && raw.Faction.IsValid(), raw.Faction, previous.Faction)
	dst.Level = observeMetadata(&o.Level, raw.Seen, raw.Level != nil && *raw.Level > 0, raw.Level, previous.Level)
	dst.Guild = observeMetadata(&o.Guild, raw.Seen, raw.Guild != nil, raw.Guild, previous.Guild)
}

func (g *Tracker) setPlayerObservations(id guid.GUID, observed metadataObservations) {
	if g.metadataObserved == nil {
		g.metadataObserved = make(map[guid.GUID]metadataObservations)
	}
	g.metadataObserved[id] = observed
}

func (g *Tracker) playerObservations(player combatant.Combatant) metadataObservations {
	if observed, ok := g.metadataObserved[player.Guid]; ok {
		return observed
	}
	// Legacy callers may populate Players directly instead of passing raw messages.
	var observed metadataObservations
	var dst combatant.Combatant
	observed.merge(&dst, player, combatant.Combatant{})
	return observed
}
