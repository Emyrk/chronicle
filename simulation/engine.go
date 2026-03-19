package simulation

import (
	"fmt"
	"math/rand"

	"github.com/Emyrk/chronicle/simulation/combat"
	"github.com/Emyrk/chronicle/simulation/gamedata"
)

// EventType identifies the type of simulation event.
type EventType int

const (
	EventAutoAttack    EventType = iota
	EventCastStart               // began casting
	EventCastComplete            // spell lands
	EventDotTick                 // periodic damage tick
	EventHotTick                 // periodic heal tick
	EventAuraExpire              // aura expired
	EventGCDReady                // GCD elapsed
	EventCooldownReady           // spell cooldown elapsed
	EventResourceTick            // mana/energy regen tick
	EventProc                    // triggered spell from proc
)

// String returns event type name.
func (e EventType) String() string {
	names := [...]string{
		"AutoAttack", "CastStart", "CastComplete", "DotTick", "HotTick",
		"AuraExpire", "GCDReady", "CooldownReady", "ResourceTick", "Proc",
	}
	if int(e) < len(names) {
		return names[e]
	}
	return "Unknown"
}

// StepResult describes what happened during a single Step().
type StepResult struct {
	TimeMs         int32
	Event          EventType
	SpellID        int32
	Outcome        combat.Outcome
	Amount         int32
	School         int32
	Resisted       int32
	IsCrit         bool
	ResourceDelta  int32
	AurasApplied   []int32
	AurasRemoved   []int32
	ProcsTriggered []int32
}

// Rotation decides what action to take when the GCD is available.
type Rotation interface {
	NextAction(state *SimState) *Action
}

// ActionType identifies an action the rotation wants to take.
type ActionType int

const (
	ActionCastSpell ActionType = iota
	ActionUseItem
	ActionWait
)

// Action is a rotation decision.
type Action struct {
	Type    ActionType
	SpellID int32
}

// CastState tracks an in-progress cast.
type CastState struct {
	SpellID    int32
	StartMs    int32
	CompleteMs int32
}

// SimState is the mutable runtime state of the simulation.
type SimState struct {
	TimeMs        int32
	Caster        *combat.CombatUnit
	Target        *combat.CombatUnit
	Auras         *combat.AuraTracker // player buffs/procs
	TargetAuras   *combat.AuraTracker // target debuffs (DoTs, etc.)
	SpellMods     []SpellMod
	Cooldowns     map[int32]int32 // spellID → readyAtMs
	GCDReadyMs    int32
	Casting       *CastState
	AutoAttacking bool
	ComboPoints   int32
	TotalDamage   int64
}

// Engine is the DPS simulation engine. It processes events from a priority
// queue, resolving combat using the DataProvider for spell/item data.
type Engine struct {
	data       gamedata.DataProvider
	config     CharacterConfig
	targetData gamedata.CreatureData
	state      *SimState
	events     *eventQueue
	rotation   Rotation
	results    SimResults
	combatLog  *CombatLog // nil = no combat log recording
	durationMs int32
	rng        *rand.Rand
	seqCounter int64
}

// NewEngine creates a simulation engine. Call Reset() before stepping.
func NewEngine(config CharacterConfig, target gamedata.CreatureData, data gamedata.DataProvider) *Engine {
	return &Engine{
		data:       data,
		config:     config,
		targetData: target,
		rng:        rand.New(rand.NewSource(1)),
	}
}

// SetRotation sets the AI rotation for batch mode. Pass nil for interactive.
func (e *Engine) SetRotation(r Rotation) {
	e.rotation = r
}

// EnableCombatLog starts recording protobuf combat log events that are
// compatible with Chronicle's EventsPanels frontend. Call before Reset().
func (e *Engine) EnableCombatLog(playerName string, playerID uint64) {
	e.combatLog = NewCombatLog(playerName, playerID, e.targetData.Name, e.targetData.EntryID)
}

// CombatLog returns the recorded combat log, or nil if not enabled.
func (e *Engine) GetCombatLog() *CombatLog { return e.combatLog }

// SetSeed sets the RNG seed for deterministic simulations.
func (e *Engine) SetSeed(seed int64) {
	e.rng = rand.New(rand.NewSource(seed))
}

// Reset initializes the simulation state and schedules initial events.
func (e *Engine) Reset() {
	caster := BuildCombatUnit(e.config, e.data)
	target := BuildTargetUnit(&e.targetData)

	e.state = &SimState{
		Caster:      caster,
		Target:      target,
		Auras:       combat.NewAuraTracker(),
		TargetAuras: combat.NewAuraTracker(),
		Cooldowns:   make(map[int32]int32),
	}
	e.events = newEventQueue()
	e.results = SimResults{
		SpellBreakdown: make(map[int32]*SpellBreakdown),
	}
	e.seqCounter = 0

	// Schedule initial events
	e.scheduleEvent(SimEvent{TimeMs: 0, Type: EventGCDReady})
	e.scheduleEvent(SimEvent{TimeMs: 2000, Type: EventResourceTick})
}

func (e *Engine) scheduleEvent(ev SimEvent) {
	e.seqCounter++
	ev.seqNo = e.seqCounter
	e.events.push(ev)
}

// Step processes the next event and returns the result.
// Returns (result, false) when there are no more events.
func (e *Engine) Step() (StepResult, bool) {
	ev, ok := e.events.pop()
	if !ok {
		return StepResult{}, false
	}

	// Advance time
	oldTime := e.state.TimeMs
	e.state.TimeMs = ev.TimeMs

	// Process aura ticks/expiry for elapsed time
	deltaMs := e.state.TimeMs - oldTime
	result := StepResult{
		TimeMs: ev.TimeMs,
		Event:  ev.Type,
	}

	if deltaMs > 0 {
		// Tick auras
		ticks := e.state.TargetAuras.TickAuras(deltaMs)
		for _, tick := range ticks {
			if tick.AuraType == gamedata.AuraPeriodicDamage {
				dmg := int32(tick.Amount)
				result.Amount += dmg
				e.state.TotalDamage += int64(dmg)
				spell, _ := e.data.GetSpell(tick.SpellID)
				e.results.recordDamage(tick.SpellID, spell.Name, dmg, false, false, true)
			}
		}
		// Expire auras
		expired := e.state.TargetAuras.ExpireAuras(deltaMs)
		result.AurasRemoved = append(result.AurasRemoved, expired...)
		if e.combatLog != nil {
			for _, sid := range expired {
				if spell, ok := e.data.GetSpell(sid); ok {
					e.combatLog.RecordAuraRemoved(e.state.TimeMs, spell.Name, sid, true)
				}
			}
		}
		expired = e.state.Auras.ExpireAuras(deltaMs)
		result.AurasRemoved = append(result.AurasRemoved, expired...)
		if e.combatLog != nil {
			for _, sid := range expired {
				if spell, ok := e.data.GetSpell(sid); ok {
					e.combatLog.RecordAuraRemoved(e.state.TimeMs, spell.Name, sid, false)
				}
			}
		}
	}

	// Process event
	switch ev.Type {
	case EventGCDReady:
		e.state.GCDReadyMs = ev.TimeMs
		if e.rotation != nil {
			action := e.rotation.NextAction(e.state)
			if action != nil && action.Type == ActionCastSpell {
				if err := e.CastSpell(action.SpellID); err == nil {
					result.SpellID = action.SpellID
				}
			}
		}

	case EventCastStart:
		result.SpellID = ev.SpellID
		if e.combatLog != nil {
			if spell, ok := e.data.GetSpell(ev.SpellID); ok {
				e.combatLog.RecordCastStart(ev.TimeMs, &spell)
			}
		}

	case EventCastComplete:
		result.SpellID = ev.SpellID
		e.state.Casting = nil
		e.processCastComplete(ev.SpellID, &result)

	case EventAutoAttack:
		e.processAutoAttack(&result)

	case EventResourceTick:
		e.processResourceTick(&result)
		// Schedule next resource tick
		e.scheduleEvent(SimEvent{TimeMs: e.state.TimeMs + 2000, Type: EventResourceTick})

	case EventCooldownReady:
		// Just a marker — cooldown map is checked on cast
		result.SpellID = ev.SpellID

	case EventDotTick:
		// DoT ticks are handled via AuraTracker.TickAuras above
		result.SpellID = ev.SpellID

	case EventAuraExpire:
		// Handled via ExpireAuras above
		result.SpellID = ev.SpellID
	}

	return result, true
}

func (e *Engine) processCastComplete(spellID int32, result *StepResult) {
	spell, ok := e.data.GetSpell(spellID)
	if !ok {
		return
	}

	if e.combatLog != nil {
		e.combatLog.RecordCastComplete(e.state.TimeMs, &spell)
	}

	for i := range spell.Effects {
		eff := &spell.Effects[i]
		if eff.Type == gamedata.SpellEffectNone {
			continue
		}

		switch eff.Type {
		case gamedata.SpellEffectSchoolDamage:
			dmgResult := combat.ResolveSpellDamage(&spell, i, e.state.Caster, e.state.Target, e.rng)
			result.Amount += dmgResult.Damage
			result.Outcome = dmgResult.Outcome
			result.School = dmgResult.School
			result.Resisted = dmgResult.Resisted
			result.IsCrit = dmgResult.Outcome == combat.OutcomeCrit

			if dmgResult.Outcome != combat.OutcomeResist {
				e.state.TotalDamage += int64(dmgResult.Damage)
				e.results.recordDamage(spellID, spell.Name, dmgResult.Damage,
					dmgResult.Outcome == combat.OutcomeCrit, false, false)
			} else {
				e.results.recordDamage(spellID, spell.Name, 0, false, true, false)
			}
			if e.combatLog != nil {
				e.combatLog.RecordDamage(e.state.TimeMs, &spell, dmgResult, true)
			}

		case gamedata.SpellEffectApplyAura:
			if eff.AuraType == gamedata.AuraPeriodicDamage {
				spellPower := e.state.Caster.SpellPower[0]
				aura := combat.CreateAuraFromSpell(&spell, e.state.Caster.Level, spellPower)
				e.state.TargetAuras.AddAura(aura)
				result.AurasApplied = append(result.AurasApplied, spellID)
				if e.combatLog != nil {
					e.combatLog.RecordAuraApplied(e.state.TimeMs, &spell, true)
				}
			}

		case gamedata.SpellEffectWeaponDamage, gamedata.SpellEffectNormalizedWeaponDmg:
			dmgResult := combat.ResolveMeleeDamage(
				e.state.Caster, e.state.Target,
				combat.AttackMainHand, e.state.Caster.WeaponSkill, e.rng,
			)
			if dmgResult.Outcome != combat.OutcomeMiss && dmgResult.Outcome != combat.OutcomeDodge && dmgResult.Outcome != combat.OutcomeParry {
				dmgResult.Damage += eff.BasePoints + 1
			}
			result.Amount += dmgResult.Damage
			result.Outcome = dmgResult.Outcome
			result.School = dmgResult.School
			result.IsCrit = dmgResult.Outcome == combat.OutcomeCrit

			if dmgResult.Outcome != combat.OutcomeMiss {
				e.state.TotalDamage += int64(dmgResult.Damage)
				e.results.recordDamage(spellID, spell.Name, dmgResult.Damage,
					dmgResult.Outcome == combat.OutcomeCrit, false, false)
			} else {
				e.results.recordDamage(spellID, spell.Name, 0, false, true, false)
			}
			if e.combatLog != nil {
				e.combatLog.RecordDamage(e.state.TimeMs, &spell, dmgResult, true)
			}
		}
	}

	// Schedule GCD
	gcd := spell.GCDMs
	if gcd == 0 {
		gcd = 1500
	}
	gcdReady := e.state.TimeMs + gcd
	if gcdReady > e.state.GCDReadyMs {
		e.scheduleEvent(SimEvent{TimeMs: gcdReady, Type: EventGCDReady})
	}

	// Schedule cooldown
	cd := spell.CooldownMs
	if cd > 0 {
		e.state.Cooldowns[spellID] = e.state.TimeMs + cd
		e.scheduleEvent(SimEvent{TimeMs: e.state.TimeMs + cd, Type: EventCooldownReady, SpellID: spellID})
	}
}

func (e *Engine) processAutoAttack(result *StepResult) {
	if !e.state.AutoAttacking {
		return
	}

	dmgResult := combat.ResolveMeleeDamage(
		e.state.Caster, e.state.Target,
		combat.AttackMainHand, e.state.Caster.WeaponSkill, e.rng,
	)
	result.Amount = dmgResult.Damage
	result.Outcome = dmgResult.Outcome
	result.School = dmgResult.School
	result.IsCrit = dmgResult.Outcome == combat.OutcomeCrit

	if dmgResult.Outcome != combat.OutcomeMiss && dmgResult.Outcome != combat.OutcomeDodge && dmgResult.Outcome != combat.OutcomeParry {
		e.state.TotalDamage += int64(dmgResult.Damage)
		e.results.recordDamage(0, "Auto Attack", dmgResult.Damage,
			dmgResult.Outcome == combat.OutcomeCrit, false, false)
	} else {
		e.results.recordDamage(0, "Auto Attack", 0, false, true, false)
	}
	if e.combatLog != nil {
		e.combatLog.RecordDamage(e.state.TimeMs, nil, dmgResult, true)
	}

	// Schedule next auto attack
	speedMs := e.state.Caster.MHSpeedMs
	if speedMs <= 0 {
		speedMs = 2000
	}
	e.scheduleEvent(SimEvent{TimeMs: e.state.TimeMs + int32(speedMs), Type: EventAutoAttack})
}

func (e *Engine) processResourceTick(result *StepResult) {
	switch e.state.Caster.PowerType {
	case gamedata.PowerMana:
		// Base mana regen: ~12.5 mana per tick at level 60 with 100 spirit
		// Simplified: 2% of max mana per 2s tick
		regen := e.state.Caster.MaxPower * 2 / 100
		if regen < 1 {
			regen = 1
		}
		e.state.Caster.Power += regen
		if e.state.Caster.Power > e.state.Caster.MaxPower {
			e.state.Caster.Power = e.state.Caster.MaxPower
		}
		result.ResourceDelta = regen
	case gamedata.PowerEnergy:
		e.state.Caster.Power += 20 // 20 energy per 2s
		if e.state.Caster.Power > e.state.Caster.MaxPower {
			e.state.Caster.Power = e.state.Caster.MaxPower
		}
		result.ResourceDelta = 20
	case gamedata.PowerRage:
		// Rage decays 1 per second out of combat — skip in sim (always in combat)
	}
}

// CastSpell validates and initiates a spell cast.
func (e *Engine) CastSpell(spellID int32) error {
	spell, ok := e.data.GetSpell(spellID)
	if !ok {
		return fmt.Errorf("spell %d not found", spellID)
	}

	// Check GCD
	if e.state.TimeMs < e.state.GCDReadyMs {
		return fmt.Errorf("GCD not ready (ready at %dms, current %dms)", e.state.GCDReadyMs, e.state.TimeMs)
	}

	// Check casting
	if e.state.Casting != nil {
		return fmt.Errorf("already casting %d", e.state.Casting.SpellID)
	}

	// Check cooldown
	if readyAt, exists := e.state.Cooldowns[spellID]; exists && e.state.TimeMs < readyAt {
		return fmt.Errorf("spell %d on cooldown until %dms", spellID, readyAt)
	}

	// Check resource
	cost := spell.ManaCost
	if cost > 0 && e.state.Caster.Power < cost {
		return fmt.Errorf("not enough resource: need %d, have %d", cost, e.state.Caster.Power)
	}

	// Deduct resource
	if cost > 0 {
		e.state.Caster.Power -= cost
	}

	// Schedule cast
	castTime := spell.CastTimeMs
	if castTime <= 0 {
		// Instant cast
		e.scheduleEvent(SimEvent{TimeMs: e.state.TimeMs, Type: EventCastComplete, SpellID: spellID})
	} else {
		e.state.Casting = &CastState{
			SpellID:    spellID,
			StartMs:    e.state.TimeMs,
			CompleteMs: e.state.TimeMs + castTime,
		}
		e.scheduleEvent(SimEvent{TimeMs: e.state.TimeMs, Type: EventCastStart, SpellID: spellID})
		e.scheduleEvent(SimEvent{TimeMs: e.state.TimeMs + castTime, Type: EventCastComplete, SpellID: spellID})

		// Reset swing timer if auto-attacking
		if e.state.AutoAttacking {
			e.events.remove(func(ev SimEvent) bool { return ev.Type == EventAutoAttack })
			nextSwing := e.state.TimeMs + castTime + int32(e.state.Caster.MHSpeedMs)
			e.scheduleEvent(SimEvent{TimeMs: nextSwing, Type: EventAutoAttack})
		}
	}

	return nil
}

// StartAutoAttack enables auto-attack and schedules the first swing.
func (e *Engine) StartAutoAttack() {
	if e.state.AutoAttacking {
		return
	}
	e.state.AutoAttacking = true
	e.scheduleEvent(SimEvent{TimeMs: e.state.TimeMs, Type: EventAutoAttack})
}

// StopAutoAttack disables auto-attack.
func (e *Engine) StopAutoAttack() {
	e.state.AutoAttacking = false
	e.events.remove(func(ev SimEvent) bool { return ev.Type == EventAutoAttack })
}

// Run executes the simulation for durationMs using the configured rotation.
func (e *Engine) Run(durationMs int32) SimResults {
	e.durationMs = durationMs
	e.Reset()
	for {
		next, ok := e.events.peek()
		if !ok || next.TimeMs > durationMs {
			break
		}
		_, ok = e.Step()
		if !ok {
			break
		}
	}
	e.results.DurationMs = durationMs
	e.results.Finalize()
	return e.results
}

// AdvanceTo processes all events up to targetTimeMs.
func (e *Engine) AdvanceTo(targetTimeMs int32) []StepResult {
	var results []StepResult
	for {
		next, ok := e.events.peek()
		if !ok || next.TimeMs > targetTimeMs {
			break
		}
		r, ok := e.Step()
		if !ok {
			break
		}
		results = append(results, r)
	}
	return results
}

// CurrentTimeMs returns the current simulation time.
func (e *Engine) CurrentTimeMs() int32 { return e.state.TimeMs }

// IsGCDReady returns true if the GCD has elapsed.
func (e *Engine) IsGCDReady() bool { return e.state.TimeMs >= e.state.GCDReadyMs }

// IsSpellReady returns whether a spell is off cooldown and the remaining ms.
func (e *Engine) IsSpellReady(spellID int32) (bool, int32) {
	readyAt, exists := e.state.Cooldowns[spellID]
	if !exists {
		return true, 0
	}
	remaining := readyAt - e.state.TimeMs
	if remaining <= 0 {
		return true, 0
	}
	return false, remaining
}

// Resources returns current and max power.
func (e *Engine) Resources() (int32, int32) {
	return e.state.Caster.Power, e.state.Caster.MaxPower
}

// CurrentDPS returns damage per second so far.
func (e *Engine) CurrentDPS() float64 {
	if e.state.TimeMs <= 0 {
		return 0
	}
	return float64(e.state.TotalDamage) / (float64(e.state.TimeMs) / 1000.0)
}

// State returns the simulation state (for inspection).
func (e *Engine) State() *SimState { return e.state }
