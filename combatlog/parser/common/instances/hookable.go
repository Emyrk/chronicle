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
	"github.com/Emyrk/chronicle/combatlog/parser/common/consumeevidence"
	"github.com/Emyrk/chronicle/combatlog/parser/common/encounter"
	"github.com/Emyrk/chronicle/combatlog/parser/common/encounterevents"
	"github.com/Emyrk/chronicle/combatlog/parser/common/identifier"
	"github.com/Emyrk/chronicle/combatlog/parser/common/instances/instancehook"
	"github.com/Emyrk/chronicle/combatlog/parser/common/instances/overviewmetrics"
	"github.com/Emyrk/chronicle/combatlog/parser/common/instances/rankings"
	"github.com/Emyrk/chronicle/combatlog/parser/common/loot"
	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/common/parsectx"
	"github.com/Emyrk/chronicle/combatlog/parser/common/parseerrors"
	"github.com/Emyrk/chronicle/combatlog/parser/common/participants"
	"github.com/Emyrk/chronicle/combatlog/parser/common/phases"
	"github.com/Emyrk/chronicle/combatlog/parser/common/raidgroups"
	"github.com/Emyrk/chronicle/combatlog/parser/common/unitdb"
	"github.com/Emyrk/chronicle/combatlog/parser/common/vehicles"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/types"
	"github.com/Emyrk/chronicle/combatlog/parser/types/realm"
	"github.com/Emyrk/chronicle/combatlog/parser/types/zone"
	wotlkcreatures "github.com/Emyrk/chronicle/combatlog/parser/wotlk/creatures"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/internal/timings"
	"github.com/google/uuid"
)

const (
	timingsPreprocessors              = "preprocessors"
	timingsProcessCharacters          = "process_characters"
	timingsProcessFightDetection      = "process_fight_detection"
	timingsProcessOngoingFightProcess = "ongoing_fight_process_events"
	timingsFinalizeFight              = "finalize_fight"
	timingsHooks                      = "hooks"

	finalizeTickInterval = 2 * time.Second
	finalizeTickHorizon  = 5 * time.Minute
)

type Hookable struct {
	name        string
	derivedName *MultiInstanceZone
	Category    InstanceCategory
	timings     *timings.Accumulator
	logger      *slog.Logger
	units       *unitdb.Units

	// Static
	MatchesZoneF func(z zone.Zone) bool
	CurrentZone  zone.Zone
	*identifier.Identifier
	verbose           bool
	realm             *realm.Info       // mostly static
	versions          map[string]string // addon/dependency versions from HEADER
	recorderGUID      *guid.GUID        // recording player GUID from HEADER
	preprocessors     []instancehook.Preprocessor
	hooks             []instancehook.Hook // TODO: unroll?
	engagementTracker *rankings.EngagementTracker
	overviewTracker   *overviewmetrics.Tracker
	speedrunTracker   *rankings.SpeedrunTracker
	dpsTracker        *rankings.DPSTracker
	rankingRules      *rankings.Rankings

	// derivedSpeedrunTrackers holds per-sub-instance speedrun trackers when
	// DerivedRankings is configured. At finalization the tracker matching the
	// derived name is selected.
	derivedSpeedrunTrackers map[string]*rankings.SpeedrunTracker
	derivedRankingRules     map[string]*rankings.Rankings

	// Live tracking data
	Auras           *auras.Tracking
	Characters      *characters.Characters
	currentFight    *ongoingFight
	events          *encounterevents.Events
	lastActivity    time.Time
	completedFights []encounter.Fight
	lastProcessedAt time.Time
	finalizing      bool
	finalized       bool

	// finalized references
	g                *armory.Tracker
	p                *participants.Tracker
	lootTracking     *loot.LootTracker
	vehicleTracker   *vehicles.Tracker
	raidGroupTracker *raidgroups.Tracker
}

type InstanceParams struct {
	Name          string
	Category      InstanceCategory
	MatchesZone   func(z zone.Zone) bool
	Idf           *identifier.Identifier
	Rankings      *rankings.Rankings
	Preprocessors []instancehook.Preprocessor
	ExtraHooks    []instancehook.Hook
}

func (f *CommonFactory) NewHookable(ctx context.Context, logger *slog.Logger, db *unitdb.Units, z zone.Zone, flavor database.WoWFlavor) *Hookable {
	var r *rankings.Rankings
	if f.FlavoredRankings != nil {
		r = f.FlavoredRankings(flavor)
	}
	name := f.Name
	if f.NameFromZone != nil {
		name = f.NameFromZone(ctx, z, flavor)
	}
	var preprocessors []instancehook.Preprocessor
	if f.Preprocessors != nil {
		preprocessors = f.Preprocessors()
	}
	return NewHookable(ctx, logger, db, z, InstanceParams{
		Name:          name,
		Category:      f.Category,
		MatchesZone:   f.MatchZone,
		Idf:           f.Hostiles(flavor),
		Rankings:      r,
		Preprocessors: preprocessors,
	})
}

func NewHookable(ctx context.Context, logger *slog.Logger, db *unitdb.Units, z zone.Zone, ip InstanceParams) *Hookable {
	p := participants.New()
	g := armory.New(db)

	combatantStrategy := EmitAllActive

	// Read the resolved flavor + format from the parse context (stamped in
	// logparse from the persisted columns). An unset context yields an empty
	// flavor, which falls through to the default vanilla factories.
	flavor, _ := parsectx.Flavor(ctx)
	format, _ := parsectx.Format(ctx)

	// Select character factories based on flavor + format.
	var cres []characters.CharacterFactory
	switch format {
	case database.LogFormatAzerothcoreMod:
		// Server-side mod: minimal factories, emit all players. The transport
		// format, not the realm flavor, determines whether CHRONICLE_UNIT_INFO
		// supplies authoritative unit metadata.
		cres = wotlkcreatures.AzerothServersideCoreCharacterFactories()
		combatantStrategy = EmitAllPlayers
	default:
		// Client-side addon all the way up to WoTLK
		cres = wotlkcreatures.NewCharacterFactories(flavor)
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
	overviewTracker := overviewmetrics.NewTracker(db)

	var dpsTracker *rankings.DPSTracker
	var speedrunTracker *rankings.SpeedrunTracker
	if ip.Rankings != nil {
		dpsTracker = rankings.NewDPSTracker(db)
		if ip.Rankings.Speedrun != nil {
			speedrunTracker = rankings.NewSpeedrunTracker(*ip.Rankings.Speedrun, db, engagementTracker)
			chrs.RegisterHook(speedrunTracker)
		}
	}

	lootTracking := loot.New(db)

	hooks := append(ip.ExtraHooks, []instancehook.Hook{
		g,
		ce,
		cie,
		lootTracking,
		engagementTracker,
		overviewTracker,
	}...)
	switch format {
	case database.LogFormat112aCcAddon, database.LogFormat112aSuperwowAddon, database.LogFormat243CcAddon:
		// 1.12 and 2.4.3 do not record overheals in the logs, so this hook
		// derives msg.Overheal from tracked health deficits. It MUST run before any
		// hook that reads Overheal (e.g. the DPS tracker's effective-healing
		// accumulation): hooks execute in slice order, and mutating hooks
		// registered after a reader leave the reader seeing Overheal == 0,
		// silently turning effective healing into total healing.
		hooks = append(hooks, &Overhealing{
			deficits: make(map[guid.GUID]int32),
		})
	}

	if dpsTracker != nil {
		hooks = append(hooks, dpsTracker)
	}
	if speedrunTracker != nil {
		hooks = append(hooks, speedrunTracker)
	}

	c := &Hookable{
		name:              ip.Name,
		Category:          ip.Category,
		logger:            logger,
		units:             db,
		preprocessors:     ip.Preprocessors,
		CurrentZone:       z,
		MatchesZoneF:      ip.MatchesZone,
		Characters:        chrs,
		Identifier:        ip.Idf,
		events:            encounterevents.NewEvents(),
		g:                 g,
		p:                 p,
		lootTracking:      lootTracking,
		hooks:             hooks,
		engagementTracker: engagementTracker,
		overviewTracker:   overviewTracker,
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

func (h *Hookable) AttachVehicleTracker(tracker *vehicles.Tracker) {
	h.vehicleTracker = tracker
}

func (h *Hookable) AttachRaidGroupTracker(tracker *raidgroups.Tracker) {
	h.raidGroupTracker = tracker
}

func (h *Hookable) ObserveMetadataAt(at time.Time) {
	if at.After(h.lastProcessedAt) {
		h.lastProcessedAt = at
	}
}

// ProcessRaidGroupMetadata keeps instance timing current and records composition
// changes in the active encounter without running normal combat hooks.
func (h *Hookable) ProcessRaidGroupMetadata(msg *messages.RaidGroup) error {
	h.ObserveMetadataAt(msg.Date())
	if h.currentFight == nil || !h.currentFight.active() {
		return nil
	}
	return h.currentFight.Events.Process(msg)
}

// AttachAuraProjection creates and registers an aura projection adapter that
// references the shared parse-wide tracker. The adapter projects active auras
// into encounter event streams on the first real message after FightStarted,
// manages synthetic expiry, and forwards death notifications.
func (h *Hookable) AttachAuraProjection(tracker *auras.Tracking) {
	proj := auras.NewProjection(tracker)
	proj.SetEmit(func(evt *messages.Aura) {
		if h.currentFight != nil && h.currentFight.active() {
			err := h.currentFight.Events.Process(evt)
			if err != nil {
				h.logger.Error("processing synthetic aura event in ongoing fight", slog.String("error", err.Error()))
			}
		}
	})
	h.Characters.RegisterHook(proj)
	h.Auras = tracker
	// Prepend so projection events are emitted before hooks that might read them.
	h.hooks = append([]instancehook.Hook{proj}, h.hooks...)
}

// AttachConsumeCollector creates and registers a consume evidence collector
// that reads from the shared parse-wide Tracker and emits evidence into this
// instance's fight event stream.
func (h *Hookable) AttachConsumeCollector(auraTracker *auras.Tracking, shared *consumeevidence.Tracker) {
	col := consumeevidence.NewCollector(auraTracker, shared)
	col.SetEmit(func(evt *messages.Consume) {
		if h.currentFight != nil && h.currentFight.active() {
			err := h.currentFight.Events.Process(evt)
			if err != nil {
				h.logger.Error("processing consume event in ongoing fight", slog.String("error", err.Error()))
			}
		}
	})
	h.hooks = append(h.hooks, col)
}

// initDerivedRankings creates a SpeedrunTracker for each sub-instance defined
// in derivedRankings and a shared DPSTracker. All trackers run as hooks during
// parsing; at finalization the tracker matching the derived name is selected.
func (h *Hookable) initDerivedRankings(flavor database.WoWFlavor, derivedRankings map[string]func(database.WoWFlavor) *rankings.Rankings) {
	h.derivedSpeedrunTrackers = make(map[string]*rankings.SpeedrunTracker, len(derivedRankings))
	h.derivedRankingRules = make(map[string]*rankings.Rankings, len(derivedRankings))

	// Ensure a shared DPS tracker exists (created once, shared across all derived sub-instances).
	if h.dpsTracker == nil {
		h.dpsTracker = rankings.NewDPSTracker(h.units)
		h.hooks = append(h.hooks, h.dpsTracker)
	}

	for name, rankingsFn := range derivedRankings {
		r := rankingsFn(flavor)
		if r == nil {
			continue
		}
		h.derivedRankingRules[name] = r
		if r.Speedrun != nil {
			tracker := rankings.NewSpeedrunTracker(*r.Speedrun, h.units, h.engagementTracker)
			h.Characters.RegisterHook(tracker)
			h.hooks = append(h.hooks, tracker)
			h.derivedSpeedrunTrackers[name] = tracker
		}
	}
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
func (h *Hookable) SetRealm(r *realm.Info) {
	if r == nil {
		return
	}
	h.realm = r
}

func (h *Hookable) SetVersions(versions map[string]string, player *guid.GUID) {
	h.versions = versions
	h.recorderGUID = player
}

func (h *Hookable) SetVersionsIfUnset(versions map[string]string, player *guid.GUID) {
	if h.versions != nil {
		return
	}
	h.SetVersions(versions, player)
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

// ShouldStartNewRun reports whether a later entry into the same zone should
// start a new parsed instance. The current run must be complete and inactive
// for its configured re-entry gap.
func (h *Hookable) ShouldStartNewRun(at time.Time) bool {
	completedAt, gap, ok := h.completedSpeedrunBoundary()
	if !ok {
		return false
	}
	lastActivity := h.lastActivity
	if lastActivity.Before(completedAt) {
		lastActivity = completedAt
	}
	return at.Sub(lastActivity) > gap
}

func (h *Hookable) completedSpeedrunBoundary() (time.Time, time.Duration, bool) {
	var completedAt time.Time
	var gap time.Duration
	trackers := make([]*rankings.SpeedrunTracker, 0, 1+len(h.derivedSpeedrunTrackers))
	if h.speedrunTracker != nil {
		trackers = append(trackers, h.speedrunTracker)
	}
	for _, tracker := range h.derivedSpeedrunTrackers {
		trackers = append(trackers, tracker)
	}
	for _, tracker := range trackers {
		at, complete := tracker.CompletedAt()
		if !complete || (!completedAt.IsZero() && !at.After(completedAt)) {
			continue
		}
		completedAt = at
		gap = tracker.ReentryGap()
	}
	return completedAt, gap, !completedAt.IsZero()
}

func (h *Hookable) Process(m messages.Message) error {
	if h.finalizing || h.finalized {
		return fmt.Errorf("cannot process message after instance finalization started")
	}
	if at := m.Date(); at.After(h.lastActivity) {
		h.lastActivity = at
	}
	return h.process(m)
}

func (h *Hookable) process(m messages.Message) (finalError error) {
	if len(h.preprocessors) > 0 {
		err := timings.Do1(h.timings, timingsPreprocessors, func() error {
			for _, preprocessor := range h.preprocessors {
				if err := preprocessor.ProcessMessage(m); err != nil {
					return fmt.Errorf("preprocessor: %w", err)
				}
			}
			return nil
		})
		if err != nil {
			return err
		}
	}

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

	h.lastProcessedAt = m.Date()

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
		// Install the callback as soon as the fight starts. If the phased
		// character has not joined yet, keep transitions on the fight until its
		// provider is discovered later in the same or a subsequent message.
		fight := h.currentFight
		h.Characters.SetPhaseTransitionCallback(func(t phases.Transition) {
			if fight.Phases == nil {
				fight.StagedPhaseTransitions = append(fight.StagedPhaseTransitions, t)
				return
			}
			fight.Phases.transition(t)
		})
		fight.StagedPhaseTransitions = append(
			fight.StagedPhaseTransitions,
			h.Characters.DrainStagedTransitions()...,
		)
	}

	// A phase provider may become active after other enemies started the fight.
	// Initialize it retroactively at fight.Start, then apply transitions emitted
	// by the triggering message before later hooks process that message.
	if h.currentFight.active() && h.currentFight.Phases == nil {
		h.initPhaseTracker()
	}
	if h.currentFight.Phases != nil && len(h.currentFight.StagedPhaseTransitions) > 0 {
		for _, staged := range h.currentFight.StagedPhaseTransitions {
			h.currentFight.Phases.transition(staged)
		}
		h.currentFight.StagedPhaseTransitions = nil
	}

	if !wasActive && h.currentFight.active() {
		if h.raidGroupTracker != nil {
			start := h.currentFight.Start.Timestamp.Date()
			if observation, ok := h.raidGroupTracker.LatestBetween(h.CurrentZone.Seen, start); ok {
				snapshot := &messages.RaidGroup{
					MessageBase: messages.Base(start, messages.WithSynthetic()),
					Groups:      [messages.RaidGroupCount][messages.RaidGroupSize]guid.GUID(observation.Composition),
				}
				if err := h.currentFight.Events.Process(snapshot); err != nil {
					return nil, fmt.Errorf("processing encounter-start raid group: %w", err)
				}
			}
		}
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
	// Close the live phase tracker at fight end. The final phase's kill type
	// is not yet known; fightEncounter assigns it after computing the outcome.
	h.currentFight.Phases.close(*h.currentFight.End, "")

	fight := encounter.Fight{
		Hostiles:           map[guid.GUID]encounter.CharacterFight{},
		Start:              h.currentFight.Start.Timestamp.Date(),
		End:                h.currentFight.End.Timestamp.Date(),
		EncounterID:        h.currentFight.EncounterID,
		PlayerDeaths:       h.currentFight.PlayerDeaths,
		Phases:             h.currentFight.Phases.materialized(),
		PhaseEncounterName: h.currentFight.Phases.encounterName(),
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

	// End the fight and clear the phase transition callback.
	h.Characters.SetPhaseTransitionCallback(nil)
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

	enc := encounter.Encounter{
		Name:      encName.Name(),
		Type:      encName.Type(),
		Combat:    fight,
		KillType:  killType,
		Remaining: rr.Timeouts,
		Boss:      encName.IsBossFight(),
	}

	// Copy already-materialized phases. The final phase's kill type was left
	// empty at finalization; assign it now that the outcome is known.
	if fight.PhaseEncounterName == enc.Name {
		enc.Phases = fight.Phases
		if len(enc.Phases) > 0 {
			enc.Phases[len(enc.Phases)-1].KillType = killType
		}
	}

	return enc, nil
}

// initPhaseTracker searches participating hostiles for a PhaseProvider and
// initializes the live phase tracker on the current fight. Must be called
// after the fight becomes active (Start is set).
func (h *Hookable) initPhaseTracker() {
	if h.Characters == nil || h.currentFight == nil || h.currentFight.Start == nil {
		return
	}
	for hostileID := range h.currentFight.ActiveHostiles {
		char, ok := h.Characters.Get(hostileID)
		if !ok {
			continue
		}
		pp, ok := char.(phases.PhaseProvider)
		if !ok {
			continue
		}
		defs := pp.PhaseDefinitions()
		if defs != nil {
			h.currentFight.Phases = newPhaseTracker(defs, hostileID, *h.currentFight.Start)
			return
		}
	}
}

func (h *Hookable) drainOpenFight(ctx context.Context) error {
	if err := ctx.Err(); err != nil {
		return err
	}
	if h.currentFight == nil || !h.currentFight.active() {
		return nil
	}
	if h.lastProcessedAt.IsZero() {
		return fmt.Errorf("cannot drain active fight without a last processed timestamp")
	}

	start := h.lastProcessedAt
	terminal := start.Add(finalizeTickHorizon)
	for now := start.Add(finalizeTickInterval); !now.After(terminal); now = now.Add(finalizeTickInterval) {
		if err := ctx.Err(); err != nil {
			return err
		}
		if err := h.process(messages.TimedOut(now)); err != nil {
			return fmt.Errorf("processing finalization tick at %s: %w", now, err)
		}
		if h.currentFight == nil || !h.currentFight.active() {
			return nil
		}
	}

	activeHostiles := make([]string, 0, len(h.currentFight.ActiveHostiles))
	for id := range h.currentFight.ActiveHostiles {
		char, ok := h.Characters.Get(id)
		if ok && char.IsActive() {
			activeHostiles = append(activeHostiles, id.String())
		}
	}
	slices.Sort(activeHostiles)

	logger := h.logger
	if logger == nil {
		logger = slog.Default()
	}
	logger.Error("fight remained active after finalization ticks",
		slog.String("instance", h.Name()),
		slog.Time("start", start),
		slog.Time("terminal", terminal),
		slog.Any("active_hostiles", activeHostiles),
	)
	return nil
}

func (h *Hookable) Finalize(ctx context.Context) (*FinalizedInstance, error) {
	if h.finalizing || h.finalized {
		return nil, fmt.Errorf("instance finalization already started")
	}
	h.finalizing = true
	defer func() {
		h.finalizing = false
		h.finalized = true
	}()

	if err := h.drainOpenFight(ctx); err != nil {
		return nil, fmt.Errorf("draining open fight: %w", err)
	}

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

	// Select the appropriate speedrun tracker and ranking rules.
	// When DerivedRankings is configured, pick the tracker matching the
	// resolved derived name; otherwise fall back to the single tracker.
	activeSpeedrunTracker := h.speedrunTracker
	activeRankingRules := h.rankingRules
	if len(h.derivedSpeedrunTrackers) > 0 {
		derivedName := h.Name()
		if tracker, ok := h.derivedSpeedrunTrackers[derivedName]; ok {
			activeSpeedrunTracker = tracker
		}
		if rules, ok := h.derivedRankingRules[derivedName]; ok {
			activeRankingRules = rules
		}
	}

	var rankingsResult *rankings.RankingsResult
	if h.dpsTracker != nil || activeSpeedrunTracker != nil {
		rankingsResult = &rankings.RankingsResult{}
		if h.dpsTracker != nil {
			rankingsResult.DPS = h.dpsTracker.Result()
		}
		if activeSpeedrunTracker != nil {
			rankingsResult.Speedrun = activeSpeedrunTracker.Result()
		}
	}

	var speedrunResult *rankings.SpeedrunResult
	if rankingsResult != nil {
		speedrunResult = rankingsResult.Speedrun
	}
	var deadliestAbilities []overviewmetrics.DeadliestAbility
	if h.overviewTracker != nil {
		deadliestAbilities = h.overviewTracker.Result()
	}
	overview := overviewmetrics.Summarize(encounters, deadliestAbilities, speedrunResult)

	var raidGroupSnapshots []raidgroups.InstanceSnapshot
	if h.raidGroupTracker != nil && len(encounters) > 0 {
		for _, enc := range encounters {
			if !enc.Boss || enc.KillType != encounter.KillTypeClean {
				continue
			}
			if observation, ok := h.raidGroupTracker.LatestBetween(h.CurrentZone.Seen, enc.Combat.End); ok {
				encounterID := enc.Combat.EncounterID
				raidGroupSnapshots = append(raidGroupSnapshots, raidgroups.InstanceSnapshot{
					EncounterID: &encounterID, ObservedAt: observation.At, Composition: observation.Composition,
				})
			}
		}
		if observation, ok := h.raidGroupTracker.LatestBetween(h.CurrentZone.Seen, h.lastProcessedAt); ok {
			raidGroupSnapshots = append(raidGroupSnapshots, raidgroups.InstanceSnapshot{
				ObservedAt: observation.At, Composition: observation.Composition,
			})
		}
	}

	var vehicleMetadata vehicles.Metadata
	if h.vehicleTracker != nil && len(encounters) > 0 {
		instanceStart := encounters[0].Combat.Start
		instanceEnd := encounters[0].Combat.End
		for _, enc := range encounters[1:] {
			if enc.Combat.Start.Before(instanceStart) {
				instanceStart = enc.Combat.Start
			}
			if enc.Combat.End.After(instanceEnd) {
				instanceEnd = enc.Combat.End
			}
		}
		vehicleMetadata = h.vehicleTracker.MetadataForRange(instanceStart, instanceEnd)
	}

	persistedUnitSet := make(map[guid.GUID]struct{})
	if h.Characters != nil {
		_ = h.Characters.All.ForEach(func(char characters.Character) error {
			persist, ok := char.(characters.InstanceUnitPersister)
			if ok && persist.PersistInInstance() {
				persistedUnitSet[char.ID()] = struct{}{}
			}
			return nil
		})
	}
	// UNIT_INFO pets should be available to metadata consumers such as Unit
	// Lookup regardless of whether their Character implementation became active.
	// This intentionally does not alter character factory selection or activity.
	for id := range h.units.Info {
		if id.IsPet() {
			persistedUnitSet[id] = struct{}{}
		}
	}
	persistedUnits := make([]guid.GUID, 0, len(persistedUnitSet))
	for id := range persistedUnitSet {
		persistedUnits = append(persistedUnits, id)
	}
	slices.Sort(persistedUnits)

	return &FinalizedInstance{
		Realm:        h.realm,
		Versions:     h.versions,
		RecorderGUID: h.recorderGUID,
		Encounters:   encounters,
		// TODO: Break off guild and spellbook
		Guilds:             h.g,
		Loot:               h.lootTracking,
		Participants:       h.p,
		Rankings:           rankingsResult,
		Overview:           overview,
		RankingRules:       activeRankingRules,
		UnknownUnits:       h.resolveUnknownUnits(),
		PersistedUnits:     persistedUnits,
		VehicleMetadata:    vehicleMetadata,
		RaidGroupSnapshots: raidGroupSnapshots,

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
