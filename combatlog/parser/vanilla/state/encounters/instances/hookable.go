package instances

import (
	"context"
	"fmt"
	"log/slog"
	"time"

	"github.com/Emyrk/chronicle/combatlog/parseoptions"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/types"
	"github.com/Emyrk/chronicle/combatlog/parser/types/realm"
	"github.com/Emyrk/chronicle/combatlog/parser/types/zone"
	"github.com/Emyrk/chronicle/combatlog/parser/vanilla/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/vanilla/parseerrors"
	"github.com/Emyrk/chronicle/combatlog/parser/vanilla/state/armory"
	"github.com/Emyrk/chronicle/combatlog/parser/vanilla/state/encounters/character"
	"github.com/Emyrk/chronicle/combatlog/parser/vanilla/state/encounters/encounterevents"
	"github.com/Emyrk/chronicle/combatlog/parser/vanilla/state/encounters/instances/instancehook"
	"github.com/Emyrk/chronicle/combatlog/parser/vanilla/state/encounters/period"
	"github.com/Emyrk/chronicle/combatlog/parser/vanilla/state/participants"
	"github.com/Emyrk/chronicle/combatlog/parser/vanilla/state/unitdb"
	"github.com/Emyrk/chronicle/internal/timings"
	"github.com/google/uuid"
)

const (
	timingsProcessCharacters          = "process_characters"
	timingsProcessFightDetection      = "process_fight_detection"
	timingsProcessOngoingFightProcess = "ongoing_fight_process_events"
	timingsFinalizeFight              = "finalize_fight"
	timingsHooks                      = "hooks"
)

type Hookable struct {
	name          string
	timings       *timings.Accumulator
	zoneNameMatch func(z string) bool
	logger        *slog.Logger
	units         *unitdb.Units

	// Static
	CurrentZone zone.Zone
	*Identifier
	verbose bool
	realm   *realm.Info         // mostly static
	hooks   []instancehook.Hook // TODO: unroll?

	// Live tracking data
	Characters      *character.Characters
	currentFight    *ongoingFight
	events          *encounterevents.Events
	completedFights []Fight

	// finalized references
	g *armory.Tracker
	p *participants.Tracker
}

func (f *CommonFactory) NewHookable(ctx context.Context, logger *slog.Logger, db *unitdb.Units, z zone.Zone) *Hookable {
	p := participants.New()
	g := armory.New()

	characters := character.NewCharacters(db)
	characters.RegisterHook(p)

	// classificationEmitter needs a forward reference to the hookable for the emit callback.
	// We set the emit function after creating the hookable.
	ce := &classificationEmitter{
		units:      db,
		characters: characters,
	}
	characters.RegisterHook(ce)

	c := &Hookable{
		name:          f.Name,
		zoneNameMatch: f.ZoneName,
		logger:        logger,
		units:         db,
		CurrentZone:   z,
		Characters:    characters,
		Identifier:    f.Hostiles(),
		events:        encounterevents.NewEvents(),
		g:             g,
		p:             p,
		hooks: []instancehook.Hook{
			g,
			ce,
		},
		verbose:         parseoptions.IsVerbose(ctx),
		timings:         timings.New(),
		completedFights: make([]Fight, 0),
	}

	ce.emit = func(evt *messages.UnitClassificationEvent) {
		if c.currentFight != nil && c.currentFight.active() {
			err := c.currentFight.Events.Process(evt)
			if err != nil {
				logger.Error("processing classification event in ongoing fight", slog.String("error", err.Error()))
			}
		}
	}

	return c
}

func (h *Hookable) AddHook(hook instancehook.Hook) {
	h.hooks = append(h.hooks, hook)
}
func (h *Hookable) Name() string           { return h.name }
func (h *Hookable) SetRealm(r *realm.Info) { h.realm = r }

// MatchesZone
// TODO: Should we care about the instance ID here?
func (h *Hookable) MatchesZone(z zone.Zone) bool { return h.zoneNameMatch(z.Name) }

func (h *Hookable) Process(m messages.Message) (finalError error) {
	err := h.units.ProcessMessage(m)
	if err != nil {
		return fmt.Errorf("processing unit message: %w", err)
	}

	switch msg := m.(type) {
	case *messages.Realm:
		if h.realm != nil {
			if h.realm.RealmName != msg.RealmName {
				return parseerrors.AsFatalError(fmt.Errorf("realm name changed from %q to %q during instance", h.realm.RealmName, msg.RealmName))
			}
		}
		h.SetRealm(&msg.Info)
	default:
	}

	actChange, err := timings.Do2(h.timings, timingsProcessCharacters, func() (bool, error) {
		return h.Characters.Process(m)
	})
	if err != nil {
		return fmt.Errorf("process characters: %w", err)
	}

	if actChange {
		// Only need to update the fight detection if there is a change in character activity.
		callback, err := timings.Do2(h.timings, timingsProcessFightDetection, func() (func() error, error) {
			return h.FightDetectionHandler(m)
		})
		if err != nil {
			return fmt.Errorf("fight detection: %w", err)
		}

		// callback is used to finish the fight. This should happen after all hooks
		// have processed the message, but before the next message is processed.
		if callback != nil {
			defer func() {
				finalError = callback()
			}()
		}
	}

	err = timings.Do1(h.timings, timingsProcessOngoingFightProcess, func() error {
		return h.currentFight.Process(m)
	})

	if len(h.hooks) > 0 {
		err = timings.Do1(h.timings, timingsHooks, func() error {
			for _, hook := range h.hooks {
				var eid uuid.UUID
				if h.currentFight != nil {
					eid = h.currentFight.EncounterID
				}
				err = hook.ProcessMessage(h.currentFight.active(), eid, m)
				if err != nil {
					return fmt.Errorf("hook: %w", err)
				}
			}
			return nil
		})
	}

	return nil
}

// FightDetectionHandler manages the life of "currentFight".
// Updates live fight state based on character activity changes.
// Call this after Characters.Process returns true (activity changed).
func (h *Hookable) FightDetectionHandler(m messages.Message) (func() error, error) {
	if h.currentFight == nil {
		// this is the only place a new fight should be instantiated.
		// The ongoingFight struct can handle itself. Make sure it exists.
		h.currentFight = &ongoingFight{
			EncounterID:    uuid.New(),
			ActiveHostiles: make(map[guid.GUID]struct{}),
			Events:         encounterevents.New(h.verbose),
			PlayerDeaths:   nil,
			Start:          nil,
			End:            nil,
		}
	}

	wasActive := h.currentFight.active()
	activeTotal := 0
	var latestEnd *period.Moment
	err := h.Characters.All.ForEach(func(char character.Character) error {
		if info := h.IdentifyUnit(char.ID()); !info.Hostile {
			// Only consider hostile characters for fights
			return nil
		}

		pd, ok := char.CurrentPeriod()
		if !ok {
			return nil
		}

		if pd.IsActive() {
			// If the character is active, update the fight start time if needed.
			activeTotal++
			h.currentFight.ActiveHostiles[char.ID()] = struct{}{}
			h.currentFight.Begin(pd.Start)
		}

		if !pd.IsActive() {
			// If the character is no longer active, check if they were part of the fight
			if _, inFight := h.currentFight.ActiveHostiles[char.ID()]; !inFight {
				// If the character is not part of the fight, then skip
				return nil
			}

			// If the latestEnd is not yet set, we still are trying to find it.
			if latestEnd == nil || latestEnd.Timestamp.Date().Before(pd.End.Timestamp.Date()) {
				latestEnd = pd.End
			}
		}
		return nil
	})
	if err != nil {
		return nil, fmt.Errorf("iterating characters for fight detection: %w", err)
	}

	if !wasActive && h.currentFight.active() {
		for _, hook := range h.hooks {
			hook.FightStarted(h.currentFight.EncounterID, m)
		}
	}

	if activeTotal == 0 && h.currentFight.active() {
		return func() error {
			for _, hook := range h.hooks {
				hook.FightEnded(h.currentFight.EncounterID, m)
			}
			return timings.Do1(h.timings, timingsFinalizeFight, func() error {
				h.currentFight.End = latestEnd
				return h.finalizeFight()
			})
		}, nil
	}

	return nil, nil
}

func (h *Hookable) finalizeFight() error {
	fight := Fight{
		Hostiles:     map[guid.GUID]CharacterFight{},
		Start:        h.currentFight.Start.Timestamp.Date(),
		End:          h.currentFight.End.Timestamp.Date(),
		EncounterID:  h.currentFight.EncounterID,
		PlayerDeaths: h.currentFight.PlayerDeaths,
	}

	for id := range h.currentFight.ActiveHostiles {
		char, ok := h.Characters.Get(id)
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

	err := h.currentFight.Events.Finalize(h.events, fight.EncounterID)
	if err != nil {
		return fmt.Errorf("finalizing encounter messages: %w", err)
	}

	// End the fight
	h.currentFight = nil
	h.completedFights = append(h.completedFights, fight)
	return nil
}

func (h *Hookable) Fights() []Fight {
	fights := make([]Fight, len(h.completedFights))
	copy(fights, h.completedFights)
	return fights
}

func (h *Hookable) Events() *encounterevents.Events {
	return h.events
}

func (h *Hookable) Finalize(ctx context.Context) (*FinalizedInstance, error) {
	// TODO: What about any ongoing fight? Do we finalize it? Do we discard it? Do we error?
	//if false && c.currentFight != nil {
	//  // TODO: We need to end any ongoing fight with what timestamp?
	//  // Finalize any current fight that hasn't been completed yet
	//  err := c.finalizeFight()
	//  if err != nil {
	//    return nil, fmt.Errorf("finalizing ongoing fight: %w", err)
	//  }
	//}

	encounters := make([]Encounter, 0, len(h.completedFights))
	for _, fight := range h.completedFights {
		if ctx.Err() != nil {
			return nil, ctx.Err()
		}
		encounterName := ""
		encounterType := types.EncounterTypeTRASH
		isBossFight := false
		// TODO: Fix to boss count, as there can be 2 bosses
		aBossRemains := false
		for hid, hostile := range fight.Hostiles {
			if ctx.Err() != nil {
				return nil, ctx.Err()
			}
			if hid != hostile.ID {
				panic("inconsistent hostile ID mapping")
			}

			id := h.IdentifyUnit(hostile.ID)
			if !id.Hostile {
				continue
			}
			if id.Boss {
				isBossFight = true
				// Check if this boss was slain
				lastPeriod := hostile.Activity[len(hostile.Activity)-1]
				aBossRemains = aBossRemains || lastPeriod.EndState != period.EndStateSlain
			}

			// Always take the encounter name if set
			if id.EncounterName != "" {
				encounterName = id.EncounterName
				encounterType = types.EncounterTypeBOSS
			}

			if encounterName == "" {
				info, hasInfo := h.units.Get(hostile.ID)
				if hasInfo {
					encounterName = info.Name
				}
			}
		}

		rr := fight.EndStates()

		// Determine kill type based on remaining enemies and boss status
		var killType KillType
		if len(rr.Timeouts) == 0 {
			killType = KillTypeClean
			if rr.Slain == 0 && rr.Reset > 0 {
				killType = KillTypeReset
				if isBossFight && !aBossRemains {
					killType = KillTypePartial
				}
			}
		} else if isBossFight && !aBossRemains {
			// No bosses remain, but it was a boss fight.
			// An add probably lived
			killType = KillTypePartial
		} else {
			if len(fight.PlayerDeaths) == 0 {
				killType = KillTypeReset
			} else {
				killType = KillTypeWipe
			}
		}

		encounters = append(encounters, Encounter{
			Name:      encounterName,
			Type:      encounterType,
			Combat:    fight,
			KillType:  killType,
			Remaining: rr.Timeouts,
			Boss:      isBossFight,
		})
	}

	for _, hook := range h.hooks {
		err := hook.Finalize(ctx)
		if err != nil {
			return nil, fmt.Errorf("finalizing hook: %w", err)
		}
	}

	return &FinalizedInstance{
		Realm:      h.realm,
		Encounters: encounters,
		// TODO: Break off guild and spellbook
		Guilds:       h.g,
		Participants: h.p,

		//SpellBook:  c.SpellBook,
	}, nil
}

func (c *Hookable) DetailedTimes() map[string]time.Duration {
	return c.timings.Snapshot()
}
