package instances

import (
	"context"
	"fmt"
	"log/slog"
	"strings"

	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/types"
	"github.com/Emyrk/chronicle/combatlog/parser/types/realm"
	"github.com/Emyrk/chronicle/combatlog/parser/types/zone"
	"github.com/Emyrk/chronicle/combatlog/parser/vanilla"
	"github.com/Emyrk/chronicle/combatlog/parser/vanilla/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/vanilla/state/encounters/character"
	"github.com/Emyrk/chronicle/combatlog/parser/vanilla/state/encounters/encounterevents"
	"github.com/Emyrk/chronicle/combatlog/parser/vanilla/state/encounters/period"
	"github.com/Emyrk/chronicle/combatlog/parser/vanilla/state/guild"
	"github.com/Emyrk/chronicle/combatlog/parser/vanilla/state/unitdb"
	"github.com/google/uuid"
)

var _ Instance = (*Common)(nil)

// Common is used for instances that have no custom mechanics beyond character
// mechanics.
type Common struct {
	name          string
	zoneNameMatch string

	logger *slog.Logger
	db     *unitdb.Units

	CurrentZone zone.Zone
	Characters  *character.Characters
	*Identifier

	// Live fight tracking
	currentFight    *OngoingFight
	completedFights []Fight
	events          *encounterevents.Events
	seen            map[guid.GUID]struct{}
	realm           *realm.Info

	// General summaries
	Guild *guild.Tracker
}

type FinalizedInstance struct {
	Realm      *realm.Info
	Encounters []Encounter
	Guilds     *guild.Tracker
}

func (c *Common) Finalize(ctx context.Context) (*FinalizedInstance, error) {
	if false && c.currentFight != nil {
		// TODO: We need to end any ongoing fight with what timestamp?
		// Finalize any current fight that hasn't been completed yet
		err := c.finalizeFight()
		if err != nil {
			return nil, fmt.Errorf("finalizing ongoing fight: %w", err)
		}
	}

	encounters := make([]Encounter, 0, len(c.completedFights))
	for _, fight := range c.completedFights {
		if ctx.Err() != nil {
			return nil, ctx.Err()
		}
		encounterName := ""
		encounterType := types.EncounterTypeTRASH
		isBossFight := false
		// TODO: Fix to boss count, as there can be 2 bosses
		aBossRemains := false
		for hid, h := range fight.Hostiles {
			if ctx.Err() != nil {
				return nil, ctx.Err()
			}
			if hid != h.ID {
				panic("inconsistent hostile ID mapping")
			}

			id := c.IdentifyUnit(h.ID)
			if !id.Hostile {
				continue
			}
			if id.Boss {
				isBossFight = true
				// Check if this boss was slain
				lastPeriod := h.Activity[len(h.Activity)-1]
				aBossRemains = aBossRemains || !lastPeriod.Slain
			}

			// Always take the encounter name if set
			if id.EncounterName != "" {
				encounterName = id.EncounterName
				encounterType = types.EncounterTypeBOSS
			}

			if encounterName == "" {
				info, hasInfo := c.db.Get(h.ID)
				if hasInfo {
					encounterName = info.Name
				}
			}
		}

		remaining := fight.Remaining()

		// Determine kill type based on remaining enemies and boss status
		var killType KillType
		if len(remaining) == 0 {
			killType = KillTypeClean
		} else if isBossFight && !aBossRemains {
			// No bosses remain, but it was a boss fight.
			// An add probably lived
			killType = KillTypePartial
		} else {
			killType = KillTypeWipe
		}

		encounters = append(encounters, Encounter{
			Name:      encounterName,
			Type:      encounterType,
			Combat:    fight,
			KillType:  killType,
			Remaining: remaining,
			Boss:      isBossFight,
		})
	}

	return &FinalizedInstance{
		Realm:      c.realm,
		Encounters: encounters,
		Guilds:     c.Guild,
	}, nil
}

type CommonFactory struct {
	Name     string
	ZoneName string
	Hostiles func() *Identifier
}

func (f *CommonFactory) New(logger *slog.Logger, db *unitdb.Units, z zone.Zone) *Common {
	characters := character.NewCharacters(db)
	c := &Common{
		name:          f.Name,
		zoneNameMatch: f.ZoneName,
		logger:        logger,
		db:            db,
		CurrentZone:   z,
		Characters:    characters,
		Identifier:    f.Hostiles(),
		events:        encounterevents.NewEvents(),
		seen:          make(map[guid.GUID]struct{}),
		Guild:         guild.New(),
	}

	return c
}

func (c *Common) Zone() zone.Zone {
	return c.CurrentZone
}

func (c *Common) CharactersList() map[guid.GUID]character.Character {
	return c.Characters.All.Map()
}

func (c *Common) Name() string {
	return c.name
}

func (c *Common) MatchesZone(z zone.Zone) bool {
	return strings.ToLower(z.Name) == c.zoneNameMatch
}

func (c *Common) Process(m messages.Message) error {
	switch msg := m.(type) {
	case *messages.Realm:
		if c.realm != nil {
			if c.realm.RealmName != msg.RealmName {
				return vanilla.AsFatalError(fmt.Errorf("realm name changed from %q to %q during instance", c.realm.RealmName, msg.RealmName))
			}
		}
		c.realm = &msg.Info
	case *messages.Combatant:
		// Combatants do not count as "seen", since the addon tracks them async
	default:
		for _, id := range m.Affects() {
			c.seen[id] = struct{}{}
		}
	}

	actChange, err := c.Characters.Process(m)
	if err != nil {
		return fmt.Errorf("processing characters: %w", err)
	}

	if c.currentFight != nil && c.currentFight.Start != nil {
		err = c.currentFight.Events.Process(m)
		if err != nil {
			return fmt.Errorf("processing encounter messages: %w", err)
		}
	}

	if actChange {
		err = c.CharacterActivityChange()
		if err != nil {
			return fmt.Errorf("processing fight: %w", err)
		}
	}

	err = c.Guild.Process(m)
	if err != nil {
		return fmt.Errorf("processing guild info: %w", err)
	}

	return nil
}

func (c *Common) Seen() map[guid.GUID]struct{} {
	return c.seen
}

func (c *Common) Events() *encounterevents.Events {
	return c.events
}

// Fights returns all completed fights minus the current fight in progress.
func (c *Common) Fights() []Fight {
	fights := make([]Fight, len(c.completedFights))
	copy(fights, c.completedFights)
	return fights
}

// CharacterActivityChange updates live fight state based on character activity changes.
// Call this after Characters.Process returns true (activity changed).
func (c *Common) CharacterActivityChange() error {
	if c.currentFight == nil {
		c.currentFight = &OngoingFight{
			EncounterID:    uuid.New(),
			ActiveHostiles: make(map[guid.GUID]struct{}),
			Events:         encounterevents.New(),
			Start:          nil,
			End:            nil,
		}
	}

	// First handle the start time
	activeTotal := 0
	var latestEnd *period.Moment
	for _, char := range c.Characters.All.Map() {
		if info := c.IdentifyUnit(char.ID()); !info.Hostile {
			// Only consider hostile characters for fights
			continue
		}

		pd, ok := char.CurrentPeriod()
		if !ok {
			continue
		}

		if pd.IsActive() {
			// If the character is active, update the fight start time if needed.
			activeTotal++
			c.currentFight.ActiveHostiles[char.ID()] = struct{}{}

			if c.currentFight.Start == nil {
				c.currentFight.Start = pd.Start
			} else if c.currentFight.Start.Timestamp.Date().After(pd.Start.Timestamp.Date()) {
				c.currentFight.Start = pd.Start
			}
		}

		if !pd.IsActive() {
			// If the character is no longer active, check if they were part of the fight
			if _, inFight := c.currentFight.ActiveHostiles[char.ID()]; !inFight {
				// If the character is not part of the fight, then skip
				continue
			}

			// If the latestEnd is not yet set, we still are trying to find it.
			if latestEnd == nil {
				latestEnd = pd.End
			} else if pd.End != nil && latestEnd.Timestamp.Date().Before(pd.End.Timestamp.Date()) {
				latestEnd = pd.End
			}
		}
	}

	if c.currentFight.Start == nil {
		// No active characters in the fight
		return nil
	}

	// Now handle the end time
	if activeTotal == 0 {
		c.currentFight.End = latestEnd
		err := c.finalizeFight()
		if err != nil {
			return fmt.Errorf("finalizing fight: %w", err)
		}
	}
	return nil
}

func (c *Common) finalizeFight() error {
	fight := Fight{
		Hostiles:    map[guid.GUID]CharacterFight{},
		Start:       c.currentFight.Start.Timestamp.Date(),
		End:         c.currentFight.End.Timestamp.Date(),
		Events:      nil,
		EncounterID: c.currentFight.EncounterID,
	}

	for id := range c.currentFight.ActiveHostiles {
		char, ok := c.Characters.Get(id)
		if !ok {
			return fmt.Errorf("could not find character for hostile %s", id)
		}

		during, err := period.PeriodsDuring(char.Periods(), fight.Start, fight.End)
		if err != nil {
			return fmt.Errorf("getting periods during fight for character %s: %w", id, err)
		}

		fight.Hostiles[id] = CharacterFight{
			ID:       id,
			Activity: during,
		}
	}

	err := c.currentFight.Events.Finalize(c.events, fight.EncounterID)
	if err != nil {
		return fmt.Errorf("finalizing encounter messages: %w", err)
	}

	c.currentFight = nil
	// End the fight
	c.completedFights = append(c.completedFights, fight)
	return nil
}
