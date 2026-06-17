package instances

import (
	"context"
	"fmt"
	"log/slog"
	"slices"
	"time"

	"github.com/Emyrk/chronicle/combatlog/parseoptions"
	"github.com/Emyrk/chronicle/combatlog/parser/common/armory"
	"github.com/Emyrk/chronicle/combatlog/parser/common/auras"
	"github.com/Emyrk/chronicle/combatlog/parser/common/characters"
	"github.com/Emyrk/chronicle/combatlog/parser/common/characters/period"
	"github.com/Emyrk/chronicle/combatlog/parser/common/encounter"
	"github.com/Emyrk/chronicle/combatlog/parser/common/encounterevents"
	"github.com/Emyrk/chronicle/combatlog/parser/common/identifier"
	"github.com/Emyrk/chronicle/combatlog/parser/common/instances/instancehook"
	"github.com/Emyrk/chronicle/combatlog/parser/common/instances/rankings"
	"github.com/Emyrk/chronicle/combatlog/parser/common/loot"
	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/common/parsectx"
	"github.com/Emyrk/chronicle/combatlog/parser/common/parseerrors"
	"github.com/Emyrk/chronicle/combatlog/parser/common/participants"
	"github.com/Emyrk/chronicle/combatlog/parser/common/unitdb"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/types"
	"github.com/Emyrk/chronicle/combatlog/parser/types/realm"
	"github.com/Emyrk/chronicle/combatlog/parser/types/zone"
	wotlkcreatures "github.com/Emyrk/chronicle/combatlog/parser/wotlk/creatures"
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
	name        string
	derivedName *MultiInstanceZone
	timings     *timings.Accumulator
	logger      *slog.Logger
	units       *unitdb.Units

	// Static
	MatchesZoneF func(z zone.Zone) bool
	CurrentZone  zone.Zone
	*identifier.Identifier
	verbose           bool
	realm             *realm.Info         // mostly static
	versions          map[string]string   // addon/dependency versions from HEADER
	recorderGUID      *guid.GUID          // recording player GUID from HEADER
	hooks             []instancehook.Hook // TODO: unroll?
	engagementTracker *rankings.EngagementTracker
	speedrunTracker   *rankings.SpeedrunTracker
	dpsTracker        *rankings.DPSTracker
	rankingRules      *rankings.Rankings

	// Live tracking data
	Auras           *auras.Tracking
	Characters      *characters.Characters
	currentFight    *ongoingFight
	events          *encounterevents.Events
	completedFights []encounter.Fight

	// finalized references
	g            *armory.Tracker
	p            *participants.Tracker
	lootTracking *loot.LootTracker
}

type InstanceParams struct {
	Name        string
	MatchesZone func(z zone.Zone) bool
	Idf         *identifier.Identifier
	Rankings    *rankings.Rankings
	ExtraHooks  []instancehook.Hook
}

func (f *CommonFactory) NewHookable(ctx context.Context, logger *slog.Logger, db *unitdb.Units, z zone.Zone) *Hookable {
	return NewHookable(ctx, logger, db, z, InstanceParams{
		Name:        f.Name,
		MatchesZone: f.MatchZone,
		Idf:         f.Hostiles(),
		Rankings:    f.Rankings,
	})
}

func NewHookable(ctx context.Context, logger *slog.Logger, db *unitdb.Units, z zone.Zone, ip InstanceParams) *Hookable {
	p := participants.New()
	g := armory.New()

	combatantStrategy := EmitAllActive

	// Read the resolved flavor + format from the parse context (stamped in
	// logparse from the persisted columns). An unset context yields an empty
	// flavor, which falls through to the default vanilla factories.
	flavor, _ := parsectx.Flavor(ctx)
	format, _ := parsectx.Format(ctx)

	// Select character factories based on flavor + format.
	var cres []characters.CharacterFactory
	switch {
	case flavor.Has(database.FlavorAzerothcore) && format == database.LogFormatAzerothcoreMod:
		// Server-side mod: minimal factories, emit all players.
		cres = wotlkcreatures.AzerothServersideCoreCharacterFactories()
		combatantStrategy = EmitAllPlayers
	default:
		// Client-side addon all the way up to WoTLK
		cres = wotlkcreatures.NewAzerothCoreCharacterFactories(flavor)
	}

	chrs := characters.NewCharacters(db, cres, ip.Idf)
	chrs.RegisterHook(p)

	// ClassificationEmitter needs a forward reference to the hookable for the emit callback.
	// We set the emit function after creating the hookable.
	ce := &ClassificationEmitter{
		units:      db,
		characters: chrs,
	}
	chrs.RegisterHook(ce)

	cie := &CombatantInfoEmitter{
		armory:     g,
		characters: chrs,
		strategy:   combatantStrategy,
	}
	chrs.RegisterHook(cie)

	engagementTracker := rankings.NewEngagementTracker(db)

	var dpsTracker *rankings.DPSTracker
	var speedrunTracker *rankings.SpeedrunTracker
	if ip.Rankings != nil {
		dpsTracker = rankings.NewDPSTracker(db)
		if ip.Rankings.Speedrun != nil {
			speedrunTracker = rankings.NewSpeedrunTracker(*ip.Rankings.Speedrun, db, engagementTracker)
			chrs.RegisterHook(speedrunTracker)
		}
	}

	//auraTracking := auras.New(nil)
	//chrs.RegisterHook(auraTracking)

	lootTracking := loot.New(db)

	hooks := append(ip.ExtraHooks, []instancehook.Hook{
		g,
		ce,
		cie,
		lootTracking,
		engagementTracker,
		//auraTracking,
	}...)
	if dpsTracker != nil {
		hooks = append(hooks, dpsTracker)
	}
	if speedrunTracker != nil {
		hooks = append(hooks, speedrunTracker)
	}

	switch services.ServerName {
	// 1.12 does not record overheals in the logs
	case services.ServerIdentityTurtle, services.ServerIdentityKronos,
		services.ServerIdentityVanillaPlus, services.ServerIdentityOctoWoW:
		hooks = append(hooks, &Overhealing{
			deficits: make(map[guid.GUID]int32),
		})
	}

	c := &Hookable{
		name:         ip.Name,
		logger:       logger,
		units:        db,
		CurrentZone:  z,
		MatchesZoneF: ip.MatchesZone,
		//Auras:           auraTracking,
		Characters:        chrs,
		Identifier:        ip.Idf,
		events:            encounterevents.NewEvents(),
		g:                 g,
		p:                 p,
		lootTracking:      lootTracking,
		hooks:             hooks,
		engagementTracker: engagementTracker,
		speedrunTracker:   speedrunTracker,
		dpsTracker:        dpsTracker,
		rankingRules:      ip.Rankings,
		verbose:           parseoptions.IsVerbose(ctx),
		timings:           timings.New(),
		completedFights:   make([]encounter.Fight, 0),
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
func (h *Hookable) Name() string {
	if h.derivedName != nil {
		name, ok := h.derivedName.Name(h.completedFights)
		if ok {
			return name
		}
	}
	return h.name
}
func (h *Hookable) SetRealm(r *realm.Info) { h.realm = r }
func (h *Hookable) SetVersions(versions map[string]string, player *guid.GUID) {
	h.versions = versions
	h.recorderGUID = player
}

// MatchesZone
// TODO: Should we care about the instance ID here?
func (h *Hookable) MatchesZone(z zone.Zone) bool { return h.MatchesZoneF(z) }

// UpdateZoneDifficulty propagates late-arriving difficulty information to this
// instance's CurrentZone without triggering a new hookable instance.
func (h *Hookable) UpdateZoneDifficulty(z zone.Zone) {
	h.CurrentZone.DifficultyIndex = z.DifficultyIndex
	h.CurrentZone.DifficultyName = z.DifficultyName
	h.CurrentZone.MaxPlayers = z.MaxPlayers
	h.CurrentZone.DynamicDifficulty = z.DynamicDifficulty
	h.CurrentZone.SubZone = z.SubZone
}

func (h *Hookable) Process(m messages.Message) (finalError error) {
	err := h.units.ProcessMessage(m)
	if err != nil {
		return fmt.Errorf("processing unit message: %w", err)
	}

	switch msg := m.(type) {
	case *messages.Versions:
		h.SetVersions(msg.Versions, msg.Player)
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
		if info := h.IdentifyUnit(char.ID()); !info.CanBattle() {
			// Only consider hostile & neutral characters for fights
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
	fight := encounter.Fight{
		Hostiles:     map[guid.GUID]encounter.CharacterFight{},
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

		fight.Hostiles[id] = encounter.CharacterFight{
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

func (h *Hookable) Fights() []encounter.Fight {
	fights := make([]encounter.Fight, len(h.completedFights))
	copy(fights, h.completedFights)
	return fights
}

func (h *Hookable) Events() *encounterevents.Events {
	return h.events
}

// fightEncounter resolves the encounter name, type, boss status, and kill
// classification for a single completed fight.
func (h *Hookable) fightEncounter(fight encounter.Fight) (encounter.Encounter, error) {
	encName := &encounterName{
		byCharacterName: "",
		byBossName:      "",
		byEncounterName: "",
		bossDeadState:   make(map[uint32]bool),
		killed:          make(map[uint32]int),
	}

	chf := make([]encounter.CharacterFight, 0, len(fight.Hostiles))
	for hid, hostile := range fight.Hostiles {
		if hid != hostile.ID {
			return encounter.Encounter{}, fmt.Errorf("inconsistent hostile ID mapping: key=%v hostile=%v", hid, hostile.ID)
		}
		chf = append(chf, hostile)
	}

	// Deterministic ordering
	slices.SortFunc(chf, func(a, b encounter.CharacterFight) int {
		if len(a.Activity) == 0 && len(b.Activity) == 0 {
			return 0
		}
		if len(a.Activity) > 0 && len(b.Activity) == 0 {
			return 1
		}
		if len(a.Activity) == 0 && len(b.Activity) > 0 {
			return -1
		}
		return a.Activity[0].Compare(b.Activity[0])
	})

	for _, hostile := range chf {
		id := h.IdentifyUnit(hostile.ID)
		if !id.CanBattle() {
			continue
		}

		encName.Apply(hostile, id, fight)
	}

	rr := fight.EndStates()
	aBossRemains := encName.BossRemains()

	// Determine kill type based on remaining enemies and boss status
	var killType encounter.KillType
	if len(rr.Timeouts) == 0 {
		killType = encounter.KillTypeClean
		if aBossRemains {
			// All present hostiles resolved, but a required boss
			// never appeared (e.g. King chess fight adds killed
			// without the King). This is not a clean kill.
			if len(fight.PlayerDeaths) == 0 {
				killType = encounter.KillTypeReset
			} else {
				killType = encounter.KillTypeWipe
			}
		} else if rr.Slain == 0 && rr.Reset > 0 {
			killType = encounter.KillTypeReset
			if encName.IsBossFight() && !aBossRemains {
				killType = encounter.KillTypePartial
			}
		}
	} else if encName.IsBossFight() && !aBossRemains {
		// No bosses remain, but it was a boss fight.
		// An add probably lived
		killType = encounter.KillTypePartial
	} else {
		if len(fight.PlayerDeaths) == 0 {
			killType = encounter.KillTypeReset
		} else {
			killType = encounter.KillTypeWipe
		}
	}

	return encounter.Encounter{
		Name:      encName.Name(),
		Type:      encName.Type(),
		Combat:    fight,
		KillType:  killType,
		Remaining: rr.Timeouts,
		Boss:      encName.IsBossFight(),
	}, nil
}

func (h *Hookable) Finalize(ctx context.Context) (*FinalizedInstance, error) {
	if h.currentFight != nil && h.currentFight.active() {
		if len(h.currentFight.ActiveHostiles) > 0 {
			h.logger.Error("hostiles remaining in finalized instance", slog.Int("cnt", len(h.currentFight.ActiveHostiles)))
		}
	}

	// TODO: What about any ongoing fight? Do we finalize it? Do we discard it? Do we error?
	//if false && c.currentFight != nil {
	//  // TODO: We need to end any ongoing fight with what timestamp?
	//  // Finalize any current fight that hasn't been completed yet
	//  err := c.finalizeFight()
	//  if err != nil {
	//    return nil, fmt.Errorf("finalizing ongoing fight: %w", err)
	//  }
	//}

	encounters := make([]encounter.Encounter, 0, len(h.completedFights))
	for _, fight := range h.completedFights {
		if ctx.Err() != nil {
			return nil, ctx.Err()
		}
		enc, err := h.fightEncounter(fight)
		if err != nil {
			return nil, err
		}
		encounters = append(encounters, enc)
	}

	for _, hook := range h.hooks {
		err := hook.Finalize(ctx)
		if err != nil {
			return nil, fmt.Errorf("finalizing hook: %w", err)
		}
	}

	var rankingsResult *rankings.RankingsResult
	if h.dpsTracker != nil || h.speedrunTracker != nil {
		rankingsResult = &rankings.RankingsResult{}
		if h.dpsTracker != nil {
			rankingsResult.DPS = h.dpsTracker.Result()
		}
		if h.speedrunTracker != nil {
			rankingsResult.Speedrun = h.speedrunTracker.Result()
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
		RankingRules: h.rankingRules,
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

type encounterName struct {
	byCharacterName   string
	byBossName        string
	byEncounterName   string
	byEncounterFnName string
	encounterType     types.EncounterType

	bossDeadState map[uint32]bool

	killed map[uint32]int
}

func (e *encounterName) Apply(ch encounter.CharacterFight, id identifier.Identity, f encounter.Fight) {
	e.applyState(ch, id, f)
	e.applyName(id, f)
}

func (e *encounterName) BossRemains() bool {
	for k := range e.killed {
		_, exists := e.bossDeadState[k]
		if exists {
			e.bossDeadState[k] = true
		}
	}

	for _, v := range e.bossDeadState {
		if !v {
			return true
		}
	}
	return false
}

func (e *encounterName) Name() string {
	if e.byEncounterFnName != "" {
		return e.byEncounterFnName
	}
	if e.byEncounterName != "" {
		return e.byEncounterName
	}
	if e.byBossName != "" {
		return e.byBossName
	}
	return e.byCharacterName
}

func (e *encounterName) Type() types.EncounterType {
	return e.encounterType
}

func (e *encounterName) IsBossFight() bool {
	return e.encounterType == types.EncounterTypeBOSS
}

func (e *encounterName) applyState(ch encounter.CharacterFight, id identifier.Identity, f encounter.Fight) {
	entry, hasEntry := ch.ID.GetEntry()
	lastPeriod := ch.Activity[len(ch.Activity)-1]
	if id.Boss {
		e.encounterType = types.EncounterTypeBOSS
		e.bossDeadState[entry] = false
	}

	if hasEntry && lastPeriod.EndState == period.EndStateSlain {
		e.killed[entry]++
	}

	if id.EncounterNameFn != nil {
		res := id.EncounterNameFn(f)
		if res != nil {
			if res.EncounterName != "" || len(res.Bosses) > 0 {
				e.encounterType = types.EncounterTypeBOSS
			}
			for _, r := range res.Bosses {
				e.bossDeadState[r] = false
			}
		}
	}
}

func (e *encounterName) applyName(id identifier.Identity, f encounter.Fight) {
	if e.byCharacterName == "" {
		e.byCharacterName = id.Name
	}
	if id.Boss && e.byBossName == "" {
		e.byBossName = id.Name
	}

	if e.byEncounterName == "" && id.EncounterName != "" {
		e.byEncounterName = id.EncounterName
	}

	if e.byEncounterName == "" && id.EncounterNameFn != nil {
		res := id.EncounterNameFn(f)
		if res != nil {
			e.byEncounterFnName = res.EncounterName
		}
	}
}
