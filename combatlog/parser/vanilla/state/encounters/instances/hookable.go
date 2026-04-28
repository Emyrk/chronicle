package instances

import (
	"context"
	"fmt"
	"log/slog"
	"time"

	"github.com/Emyrk/chronicle/combatlog/parseoptions"
	wotlkcreatures "github.com/Emyrk/chronicle/combatlog/parser/azerothcore/creatures"
	"github.com/Emyrk/chronicle/combatlog/parser/common/characters"
	"github.com/Emyrk/chronicle/combatlog/parser/common/characters/period"
	"github.com/Emyrk/chronicle/combatlog/parser/common/parsectx"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/types"
	"github.com/Emyrk/chronicle/combatlog/parser/types/realm"
	"github.com/Emyrk/chronicle/combatlog/parser/types/zone"
	"github.com/Emyrk/chronicle/combatlog/parser/vanilla/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/vanilla/parseerrors"
	"github.com/Emyrk/chronicle/combatlog/parser/vanilla/state/armory"
	"github.com/Emyrk/chronicle/combatlog/parser/vanilla/state/encounters/auras"
	classiccreatures "github.com/Emyrk/chronicle/combatlog/parser/vanilla/state/encounters/creatures"
	"github.com/Emyrk/chronicle/combatlog/parser/vanilla/state/encounters/encounterevents"
	"github.com/Emyrk/chronicle/combatlog/parser/vanilla/state/encounters/instances/instancehook"
	"github.com/Emyrk/chronicle/combatlog/parser/vanilla/state/encounters/instances/rankings"
	"github.com/Emyrk/chronicle/combatlog/parser/vanilla/state/loot"
	"github.com/Emyrk/chronicle/combatlog/parser/vanilla/state/participants"
	"github.com/Emyrk/chronicle/combatlog/parser/vanilla/state/unitdb"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/internal/services"
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
	name    string
	timings *timings.Accumulator
	factory *CommonFactory
	logger  *slog.Logger
	units   *unitdb.Units

	// Static
	CurrentZone zone.Zone
	*Identifier
	verbose         bool
	realm           *realm.Info         // mostly static
	versions        map[string]string   // addon/dependency versions from HEADER
	recorderGUID    *guid.GUID          // recording player GUID from HEADER
	hooks           []instancehook.Hook // TODO: unroll?
	speedrunTracker *rankings.SpeedrunTracker

	// Live tracking data
	Auras           *auras.Tracking
	Characters      *characters.Characters
	currentFight    *ongoingFight
	events          *encounterevents.Events
	completedFights []Fight

	// finalized references
	g            *armory.Tracker
	p            *participants.Tracker
	lootTracking *loot.LootTracker
}

func (f *CommonFactory) NewHookable(ctx context.Context, logger *slog.Logger, db *unitdb.Units, z zone.Zone) *Hookable {
	p := participants.New()
	g := armory.New()

	cres := classiccreatures.TurtleCharacterFactories()
	logType, ok := parsectx.Type(ctx)
	if ok {
		switch logType {
		case database.LogTypeAzerothcore:
			cres = wotlkcreatures.WoTLKCharacterFactories()
		}
	}

	chrs := characters.NewCharacters(db, cres)
	chrs.RegisterHook(p)

	// classificationEmitter needs a forward reference to the hookable for the emit callback.
	// We set the emit function after creating the hookable.
	ce := &classificationEmitter{
		units:      db,
		characters: chrs,
	}
	chrs.RegisterHook(ce)

	cie := &combatantInfoEmitter{
		armory:     g,
		characters: chrs,
	}
	chrs.RegisterHook(cie)

	var speedrunTracker *rankings.SpeedrunTracker
	if f.Rankings != nil && f.Rankings.Speedrun != nil {
		speedrunTracker = rankings.NewSpeedrunTracker(*f.Rankings.Speedrun)
		chrs.RegisterHook(speedrunTracker)
	}

	//auraTracking := auras.New()
	//chrs.RegisterHook(auraTracking)

	lootTracking := loot.New(db)

	hooks := []instancehook.Hook{
		g,
		ce,
		cie,
		lootTracking,
		//auraTracking,
	}
	if speedrunTracker != nil {
		hooks = append(hooks, speedrunTracker)
	}

	switch services.ServerName {
	// 1.12 does not record overheals in the logs
	case services.ServerIdentityTurtle, services.ServerIdentityKronos:
		hooks = append(hooks, &Overhealing{
			deficits: make(map[guid.GUID]int32),
		})
	}

	c := &Hookable{
		name:        f.Name,
		factory:     f,
		logger:      logger,
		units:       db,
		CurrentZone: z,
		//Auras:           auraTracking,
		Characters:      chrs,
		Identifier:      f.Hostiles(),
		events:          encounterevents.NewEvents(),
		g:               g,
		p:               p,
		lootTracking:    lootTracking,
		hooks:           hooks,
		speedrunTracker: speedrunTracker,
		verbose:         parseoptions.IsVerbose(ctx),
		timings:         timings.New(),
		completedFights: make([]Fight, 0),
	}

	cie.emit = func(evt *messages.Combatant) {
		if c.currentFight != nil && c.currentFight.active() {
			err := c.currentFight.Events.Process(evt)
			if err != nil {
				logger.Error("processing combatant info event in ongoing fight", slog.String("error", err.Error()))
			}
		}
	}

	//auraTracking.SetEmit(func(evt *messages.Aura) {
	//	if c.currentFight != nil && c.currentFight.active() {
	//		err := c.currentFight.Events.Process(evt)
	//		if err != nil {
	//			logger.Error("processing synthetic aura event in ongoing fight", slog.String("error", err.Error()))
	//		}
	//	}
	//})

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
func (h *Hookable) SetVersions(versions map[string]string, player *guid.GUID) {
	h.versions = versions
	h.recorderGUID = player
}

// MatchesZone
// TODO: Should we care about the instance ID here?
func (h *Hookable) MatchesZone(z zone.Zone) bool { return h.factory.MatchZone(z) }

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

	err = timings.Do1(h.timings, timingsProcessOngoingFightProcess, func() error {
		return h.currentFight.Process(m)
	})

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
	err := h.Characters.All.ForEach(func(char characters.Character) error {
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
		adEncounterName := ""
		encounterName := ""
		var encounterNamedAt *time.Time
		encounterType := types.EncounterTypeTRASH
		isBossFight := false
		// TODO: Fix to boss count, as there can be 2 bosses
		aBossRemains := false
		killed := make(map[uint32]int)
		bossesRequired := make(map[uint32]struct{})
		for hid, hostile := range fight.Hostiles {
			if ctx.Err() != nil {
				return nil, ctx.Err()
			}
			if hid != hostile.ID {
				return nil, fmt.Errorf("inconsistent hostile ID mapping: key=%v hostile=%v", hid, hostile.ID)
			}

			id := h.IdentifyUnit(hostile.ID)
			if !id.Hostile {
				continue
			}

			entry, hasEntry := hostile.ID.GetEntry()
			lastPeriod := hostile.Activity[len(hostile.Activity)-1]
			if id.Boss {
				isBossFight = true
				// Check if this boss was slain
				aBossRemains = aBossRemains || lastPeriod.EndState != period.EndStateSlain
			}

			if hasEntry && lastPeriod.EndState == period.EndStateSlain {
				killed[entry]++
			}

			namedAt := hostile.Activity[0].Start.Timestamp.Date()

			// Prefer the earliest named hostile in the fight so encounter naming is
			// deterministic even when multiple named boss/helper units are present.
			if id.EncounterName != "" {
				// Bosses always take the earliest.
				if encounterNamedAt == nil || namedAt.Before(*encounterNamedAt) {
					encounterName = id.EncounterName
					encounterType = types.EncounterTypeBOSS
					encounterNamedAt = &namedAt
				}
			}

			if id.EncounterNameFn != nil {
				if res := id.EncounterNameFn(fight); res != nil {
					if encounterNamedAt == nil || namedAt.Before(*encounterNamedAt) {
						encounterName = res.EncounterName
						encounterNamedAt = &namedAt
					}
					if res.Bosses != nil && len(res.Bosses) > 0 {
						encounterType = types.EncounterTypeBOSS
						isBossFight = isBossFight || len(res.Bosses) > 0
						for _, bossID := range res.Bosses {
							bossesRequired[bossID] = struct{}{}
						}
					}
				}
			}

			info, hasInfo := h.units.Get(hostile.ID)
			if hasInfo {
				if info.Name == "" || info.Name > adEncounterName {
					adEncounterName = info.Name
				}
			}
		}
		if encounterName == "" {
			encounterName = adEncounterName
		}

		for k := range killed {
			delete(bossesRequired, k)
		}
		aBossRemains = aBossRemains || len(bossesRequired) > 0

		rr := fight.EndStates()

		// Determine kill type based on remaining enemies and boss status
		var killType KillType
		if len(rr.Timeouts) == 0 {
			killType = KillTypeClean
			if aBossRemains {
				// All present hostiles resolved, but a required boss
				// never appeared (e.g. King chess fight adds killed
				// without the King). This is not a clean kill.
				if len(fight.PlayerDeaths) == 0 {
					killType = KillTypeReset
				} else {
					killType = KillTypeWipe
				}
			} else if rr.Slain == 0 && rr.Reset > 0 {
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

	var rankingsResult *rankings.RankingsResult
	if h.speedrunTracker != nil {
		rankingsResult = &rankings.RankingsResult{
			Speedrun: h.speedrunTracker.Result(),
		}
	}

	return &FinalizedInstance{
		Realm:        h.realm,
		Versions:     h.versions,
		RecorderGUID: h.recorderGUID,
		Encounters:   encounters,
		// TODO: Break off guild and spellbook
		Guilds:       h.g,
		Loot:         h.lootTracking,
		Participants: h.p,
		Rankings:     rankingsResult,
		UnknownUnits: h.resolveUnknownUnits(),

		//SpellBook:  c.SpellBook,
	}, nil
}

func (c *Hookable) DetailedTimes() map[string]time.Duration {
	return c.timings.Snapshot()
}

// resolveUnknownUnits maps unknown creature entry IDs to their names using the unitdb.
// Units are filtered out if they are players or have an owner (pets, totems, summons).
func (h *Hookable) resolveUnknownUnits() map[uint32]UnknownUnit {
	raw := h.UnknownUnits()
	if len(raw) == 0 {
		return nil
	}

	// Build entry ID → name and owned status from unitdb.
	type entryInfo struct {
		name  string
		owned bool // true if any GUID with this entry has an owner
	}
	entries := make(map[uint32]*entryInfo)
	for gid, info := range h.units.Info {
		if gid.IsPlayer() {
			continue
		}
		entry, ok := gid.GetEntry()
		if !ok {
			continue
		}
		ei := entries[entry]
		if ei == nil {
			ei = &entryInfo{}
			entries[entry] = ei
		}
		if info.Name != "" {
			ei.name = info.Name
		}
		if info.Owner != nil {
			ei.owned = true
		}
	}

	result := make(map[uint32]UnknownUnit, len(raw))
	for entryID, count := range raw {
		// Skip owned units — they're pets, totems, or other player summons.
		if ei := entries[entryID]; ei != nil && ei.owned {
			continue
		}

		name := ""
		if ei := entries[entryID]; ei != nil {
			name = ei.name
		}
		result[entryID] = UnknownUnit{
			Name:  name,
			Count: count,
		}
	}
	if len(result) == 0 {
		return nil
	}
	return result
}
