package rankings

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"maps"
	"slices"
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/common/identifier"
	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/common/unitdb"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/types/combatant"
	"github.com/google/uuid"
)

const DPSTrackerStateType = "rankings.DPSTracker"
const DPSTrackerStateVersion uint32 = 1

type DPSTrackerState struct{ value dpsTrackerStateValue }

type dpsTrackerStateValue struct {
	DamageDone             []guidTotalValue      `json:"damage_done"`
	RankedDamageDone       []guidTotalValue      `json:"ranked_damage_done"`
	DamageCredits          []damageCreditValue   `json:"damage_credits"`
	DamageTaken            []guidTotalValue      `json:"damage_taken"`
	HealingDone            []guidTotalValue      `json:"healing_done"`
	AbsorbDone             []guidTotalValue      `json:"absorb_done"`
	HealingCredits         []healingCreditValue  `json:"healing_credits"`
	Assembly               *assemblyStateValue   `json:"assembly"`
	Forms                  formTrackerStateValue `json:"forms"`
	Results                []dpsResultValue      `json:"results"`
	PendingTalentSnapshots []pendingTalentsValue `json:"pending_talent_snapshots"`
}

type guidTotalValue struct {
	GUID  guid.GUID `json:"guid"`
	Total int64     `json:"total"`
}

type damageCreditValue struct {
	Path   string    `json:"path"`
	Credit guid.GUID `json:"credit"`
}

type damageReferenceValue struct {
	Path string `json:"path"`
}

type assemblyStateValue struct {
	PhaseDamage []assemblyTargetValue  `json:"phase_damage"`
	Pending     []assemblyPendingValue `json:"pending"`
	Excluded    []damageReferenceValue `json:"excluded"`
}

type assemblyTargetValue struct {
	Target  guid.GUID        `json:"target"`
	Credits []guidTotalValue `json:"credits"`
}

type assemblyPendingValue struct {
	Target guid.GUID              `json:"target"`
	Damage []damageReferenceValue `json:"damage"`
}

type healingCreditValue struct {
	Caster   guid.GUID `json:"caster"`
	At       time.Time `json:"at"`
	Amount   int64     `json:"amount"`
	Absorbed bool      `json:"absorbed"`
}

type formTrackerStateValue struct {
	Current        []currentFormValue   `json:"current"`
	Encounter      []encounterFormValue `json:"encounter"`
	FightStartedAt time.Time            `json:"fight_started_at"`
}

type currentFormValue struct {
	Unit guid.GUID `json:"unit"`
	Form druidForm `json:"form"`
}

type encounterFormValue struct {
	Unit          guid.GUID     `json:"unit"`
	Active        druidForm     `json:"active"`
	ActiveSince   time.Time     `json:"active_since"`
	CatDuration   time.Duration `json:"cat_duration"`
	BearDuration  time.Duration `json:"bear_duration"`
	StartedInForm druidForm     `json:"started_in_form"`
}

type dpsResultValue struct {
	EncounterID uuid.UUID        `json:"encounter_id"`
	Units       []unitStatsValue `json:"units"`
}

type unitStatsValue struct {
	Unit               guid.GUID          `json:"unit"`
	DamageDone         int64              `json:"damage_done"`
	RankedDamageDone   int64              `json:"ranked_damage_done"`
	UnrankedDamageDone int64              `json:"unranked_damage_done"`
	DamageTaken        int64              `json:"damage_taken"`
	HealingDone        int64              `json:"healing_done"`
	HealingAbsorbed    int64              `json:"healing_absorbed"`
	IsPlayer           bool               `json:"is_player"`
	OwnerGUID          *guid.GUID         `json:"owner_guid"`
	Talents            *combatant.Talents `json:"talents"`
	ObservedForm       string             `json:"observed_form"`
}

type pendingTalentsValue struct {
	Player guid.GUID      `json:"player"`
	Stats  []unitStatsRef `json:"stats"`
}

type unitStatsRef struct {
	EncounterID uuid.UUID `json:"encounter_id"`
	Unit        guid.GUID `json:"unit"`
}

type damagePathCapture struct {
	capture func(*messages.Damage) (string, error)
	byPtr   map[*messages.Damage]string
	byPath  map[string]*messages.Damage
}

func (c *damagePathCapture) path(damage *messages.Damage) (string, error) {
	if damage == nil {
		return "", fmt.Errorf("nil damage reference")
	}
	if path, ok := c.byPtr[damage]; ok {
		return path, nil
	}
	if c.capture == nil {
		return "", fmt.Errorf("missing damage capture callback")
	}
	path, err := c.capture(damage)
	if err != nil {
		return "", err
	}
	if path == "" {
		return "", fmt.Errorf("empty damage reference")
	}
	if other, exists := c.byPath[path]; exists && other != damage {
		return "", fmt.Errorf("damage path %q identifies multiple messages", path)
	}
	c.byPtr[damage] = path
	c.byPath[path] = damage
	return path, nil
}

func captureTotals(values map[guid.GUID]int64) ([]guidTotalValue, error) {
	if values == nil {
		return nil, fmt.Errorf("nil totals map")
	}
	result := make([]guidTotalValue, 0, len(values))
	for _, unit := range slices.Sorted(maps.Keys(values)) {
		result = append(result, guidTotalValue{GUID: unit, Total: values[unit]})
	}
	return result, nil
}

func (t *DPSTracker) CaptureState(captureDamage func(*messages.Damage) (string, error)) (DPSTrackerState, error) {
	if t == nil || t.units == nil || t.forms == nil || t.results == nil || t.pendingTalentSnapshots == nil {
		return DPSTrackerState{}, fmt.Errorf("incomplete DPS tracker")
	}
	var err error
	value := dpsTrackerStateValue{}
	if value.DamageDone, err = captureTotals(t.damageDone); err != nil {
		return DPSTrackerState{}, fmt.Errorf("capture damage done: %w", err)
	}
	if value.RankedDamageDone, err = captureTotals(t.rankedDamageDone); err != nil {
		return DPSTrackerState{}, fmt.Errorf("capture ranked damage done: %w", err)
	}
	if value.DamageTaken, err = captureTotals(t.damageTaken); err != nil {
		return DPSTrackerState{}, fmt.Errorf("capture damage taken: %w", err)
	}
	if value.HealingDone, err = captureTotals(t.healingDone); err != nil {
		return DPSTrackerState{}, fmt.Errorf("capture healing done: %w", err)
	}
	if value.AbsorbDone, err = captureTotals(t.absorbDone); err != nil {
		return DPSTrackerState{}, fmt.Errorf("capture absorb done: %w", err)
	}

	paths := damagePathCapture{capture: captureDamage, byPtr: make(map[*messages.Damage]string), byPath: make(map[string]*messages.Damage)}
	if t.damageCredits != nil {
		value.DamageCredits = make([]damageCreditValue, 0, len(t.damageCredits))
		for damage, credit := range t.damageCredits {
			path, err := paths.path(damage)
			if err != nil {
				return DPSTrackerState{}, fmt.Errorf("capture damage credit: %w", err)
			}
			value.DamageCredits = append(value.DamageCredits, damageCreditValue{Path: path, Credit: credit})
		}
		slices.SortFunc(value.DamageCredits, func(a, b damageCreditValue) int { return compareString(a.Path, b.Path) })
	}

	if t.healingCredits != nil {
		value.HealingCredits = make([]healingCreditValue, len(t.healingCredits))
		for i, credit := range t.healingCredits {
			value.HealingCredits[i] = healingCreditValue{Caster: credit.caster, At: credit.at, Amount: credit.amount, Absorbed: credit.absorbed}
		}
	}
	if value.Forms, err = captureFormTracker(t.forms); err != nil {
		return DPSTrackerState{}, err
	}

	if t.assemblyOfIron != nil {
		assembly := &assemblyStateValue{}
		if t.assemblyOfIron.phaseDamage == nil {
			return DPSTrackerState{}, fmt.Errorf("assembly tracker has nil phase damage")
		}
		assembly.PhaseDamage = make([]assemblyTargetValue, 0, len(t.assemblyOfIron.phaseDamage))
		for _, target := range slices.Sorted(maps.Keys(t.assemblyOfIron.phaseDamage)) {
			credits, err := captureTotals(t.assemblyOfIron.phaseDamage[target])
			if err != nil {
				return DPSTrackerState{}, fmt.Errorf("capture assembly target %s: %w", target, err)
			}
			assembly.PhaseDamage = append(assembly.PhaseDamage, assemblyTargetValue{Target: target, Credits: credits})
		}
		if t.assemblyPending != nil {
			assembly.Pending = make([]assemblyPendingValue, 0, len(t.assemblyPending))
			for _, target := range slices.Sorted(maps.Keys(t.assemblyPending)) {
				pending := assemblyPendingValue{Target: target, Damage: make([]damageReferenceValue, len(t.assemblyPending[target]))}
				for i, damage := range t.assemblyPending[target] {
					path, err := paths.path(damage)
					if err != nil {
						return DPSTrackerState{}, fmt.Errorf("capture assembly pending: %w", err)
					}
					pending.Damage[i] = damageReferenceValue{Path: path}
				}
				assembly.Pending = append(assembly.Pending, pending)
			}
		}
		if t.assemblyExcluded != nil {
			assembly.Excluded = make([]damageReferenceValue, 0, len(t.assemblyExcluded))
			for damage, excluded := range t.assemblyExcluded {
				if !excluded {
					return DPSTrackerState{}, fmt.Errorf("assembly excluded map contains false value")
				}
				path, err := paths.path(damage)
				if err != nil {
					return DPSTrackerState{}, fmt.Errorf("capture assembly excluded: %w", err)
				}
				assembly.Excluded = append(assembly.Excluded, damageReferenceValue{Path: path})
			}
			slices.SortFunc(assembly.Excluded, func(a, b damageReferenceValue) int { return compareString(a.Path, b.Path) })
		}
		value.Assembly = assembly
	} else if t.assemblyPending != nil || t.assemblyExcluded != nil {
		return DPSTrackerState{}, fmt.Errorf("assembly state exists without assembly tracker")
	}

	statsRefs := make(map[*UnitCombatStats]unitStatsRef)
	value.Results = make([]dpsResultValue, 0, len(t.results))
	encounters := slices.SortedFunc(maps.Keys(t.results), func(a, b uuid.UUID) int { return bytes.Compare(a[:], b[:]) })
	for _, encounterID := range encounters {
		result := t.results[encounterID]
		if result == nil || result.Units == nil {
			return DPSTrackerState{}, fmt.Errorf("nil DPS result for %s", encounterID)
		}
		resultValue := dpsResultValue{EncounterID: encounterID, Units: make([]unitStatsValue, 0, len(result.Units))}
		for _, unit := range slices.Sorted(maps.Keys(result.Units)) {
			stats := result.Units[unit]
			if stats == nil {
				return DPSTrackerState{}, fmt.Errorf("nil unit stats for %s", unit)
			}
			ref := unitStatsRef{EncounterID: encounterID, Unit: unit}
			if previous, exists := statsRefs[stats]; exists {
				return DPSTrackerState{}, fmt.Errorf("unit stats shared by %v and %v", previous, ref)
			}
			statsRefs[stats] = ref
			resultValue.Units = append(resultValue.Units, unitStatsValueFromRuntime(unit, stats))
		}
		value.Results = append(value.Results, resultValue)
	}
	players := slices.Sorted(maps.Keys(t.pendingTalentSnapshots))
	value.PendingTalentSnapshots = make([]pendingTalentsValue, 0, len(players))
	for _, player := range players {
		pending := t.pendingTalentSnapshots[player]
		entry := pendingTalentsValue{Player: player}
		if pending != nil {
			entry.Stats = make([]unitStatsRef, len(pending))
		}
		for i, stats := range pending {
			ref, ok := statsRefs[stats]
			if !ok {
				return DPSTrackerState{}, fmt.Errorf("pending talent stats for %s are not owned by results", player)
			}
			if ref.Unit != player {
				return DPSTrackerState{}, fmt.Errorf("pending talent player %s references unit %s", player, ref.Unit)
			}
			entry.Stats[i] = ref
		}
		value.PendingTalentSnapshots = append(value.PendingTalentSnapshots, entry)
	}
	state := DPSTrackerState{value: value}
	if err := state.validate(); err != nil {
		return DPSTrackerState{}, err
	}
	return state, nil
}

func captureFormTracker(forms *druidFormTracker) (formTrackerStateValue, error) {
	if forms == nil || forms.current == nil || forms.encounter == nil {
		return formTrackerStateValue{}, fmt.Errorf("incomplete druid form tracker")
	}
	value := formTrackerStateValue{FightStartedAt: forms.fightStartedAt}
	value.Current = make([]currentFormValue, 0, len(forms.current))
	for _, unit := range slices.Sorted(maps.Keys(forms.current)) {
		value.Current = append(value.Current, currentFormValue{Unit: unit, Form: forms.current[unit]})
	}
	value.Encounter = make([]encounterFormValue, 0, len(forms.encounter))
	for _, unit := range slices.Sorted(maps.Keys(forms.encounter)) {
		state := forms.encounter[unit]
		if state == nil {
			return formTrackerStateValue{}, fmt.Errorf("nil form state for %s", unit)
		}
		value.Encounter = append(value.Encounter, encounterFormValue{Unit: unit, Active: state.active, ActiveSince: state.activeSince, CatDuration: state.catDuration, BearDuration: state.bearDuration, StartedInForm: state.startedInForm})
	}
	return value, nil
}

func unitStatsValueFromRuntime(unit guid.GUID, stats *UnitCombatStats) unitStatsValue {
	value := unitStatsValue{Unit: unit, DamageDone: stats.DamageDone, RankedDamageDone: stats.RankedDamageDone, UnrankedDamageDone: stats.UnrankedDamageDone, DamageTaken: stats.DamageTaken, HealingDone: stats.HealingDone, HealingAbsorbed: stats.HealingAbsorbed, IsPlayer: stats.IsPlayer, Talents: combatant.CloneTalents(stats.Talents), ObservedForm: stats.ObservedForm}
	if stats.OwnerGUID != nil {
		owner := *stats.OwnerGUID
		value.OwnerGUID = &owner
	}
	return value
}

func compareString(a, b string) int {
	switch {
	case a < b:
		return -1
	case a > b:
		return 1
	default:
		return 0
	}
}

func (s DPSTrackerState) Encode() ([]byte, error) {
	if err := s.validate(); err != nil {
		return nil, err
	}
	return json.Marshal(s.value)
}

func DecodeDPSTrackerState(version uint32, payload []byte) (DPSTrackerState, error) {
	if version != DPSTrackerStateVersion {
		return DPSTrackerState{}, fmt.Errorf("unsupported %s version %d", DPSTrackerStateType, version)
	}
	if err := validateUniqueJSON(payload); err != nil {
		return DPSTrackerState{}, err
	}
	var fields map[string]json.RawMessage
	if err := json.Unmarshal(payload, &fields); err != nil || fields == nil {
		return DPSTrackerState{}, fmt.Errorf("DPS tracker state must be an object")
	}
	required := []string{"damage_done", "ranked_damage_done", "damage_credits", "damage_taken", "healing_done", "absorb_done", "healing_credits", "assembly", "forms", "results", "pending_talent_snapshots"}
	if len(fields) != len(required) {
		return DPSTrackerState{}, fmt.Errorf("DPS tracker state requires %d fields", len(required))
	}
	for _, name := range required {
		if len(fields[name]) == 0 {
			return DPSTrackerState{}, fmt.Errorf("missing DPS tracker field %q", name)
		}
	}
	var value dpsTrackerStateValue
	decoder := json.NewDecoder(bytes.NewReader(payload))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&value); err != nil {
		return DPSTrackerState{}, fmt.Errorf("decode DPS tracker state: %w", err)
	}
	if err := decoder.Decode(new(any)); err != io.EOF {
		return DPSTrackerState{}, fmt.Errorf("trailing DPS tracker state")
	}
	state := DPSTrackerState{value: value}
	if err := state.validate(); err != nil {
		return DPSTrackerState{}, err
	}
	return state, nil
}

func validateUniqueJSON(payload []byte) error {
	decoder := json.NewDecoder(bytes.NewReader(payload))
	var visit func(string) error
	visit = func(path string) error {
		token, err := decoder.Token()
		if err != nil {
			return err
		}
		delim, ok := token.(json.Delim)
		if !ok {
			return nil
		}
		switch delim {
		case '{':
			seen := make(map[string]struct{})
			for decoder.More() {
				nameToken, err := decoder.Token()
				if err != nil {
					return err
				}
				name, ok := nameToken.(string)
				if !ok {
					return fmt.Errorf("non-string JSON field at %s", path)
				}
				if _, exists := seen[name]; exists {
					return fmt.Errorf("duplicate JSON field %s.%s", path, name)
				}
				seen[name] = struct{}{}
				if err := visit(path + "." + name); err != nil {
					return err
				}
			}
			_, err = decoder.Token()
			return err
		case '[':
			for i := 0; decoder.More(); i++ {
				if err := visit(fmt.Sprintf("%s[%d]", path, i)); err != nil {
					return err
				}
			}
			_, err = decoder.Token()
			return err
		default:
			return fmt.Errorf("unexpected JSON delimiter %q", delim)
		}
	}
	if err := visit("state"); err != nil {
		return err
	}
	if err := decoder.Decode(new(any)); err != io.EOF {
		return fmt.Errorf("trailing DPS tracker state")
	}
	return nil
}

func validateTotals(name string, totals []guidTotalValue) error {
	if totals == nil {
		return fmt.Errorf("%s totals are null", name)
	}
	seen := make(map[guid.GUID]struct{}, len(totals))
	for _, total := range totals {
		if _, exists := seen[total.GUID]; exists {
			return fmt.Errorf("duplicate %s total for %s", name, total.GUID)
		}
		seen[total.GUID] = struct{}{}
	}
	return nil
}

func (s DPSTrackerState) validate() error {
	value := s.value
	for name, totals := range map[string][]guidTotalValue{"damage_done": value.DamageDone, "ranked_damage_done": value.RankedDamageDone, "damage_taken": value.DamageTaken, "healing_done": value.HealingDone, "absorb_done": value.AbsorbDone} {
		if err := validateTotals(name, totals); err != nil {
			return err
		}
	}
	if value.Forms.Current == nil || value.Forms.Encounter == nil || value.Results == nil || value.PendingTalentSnapshots == nil {
		return fmt.Errorf("required DPS tracker owner collections are null")
	}
	seenPaths := make(map[string]struct{}, len(value.DamageCredits))
	for _, credit := range value.DamageCredits {
		if credit.Path == "" {
			return fmt.Errorf("empty damage credit reference")
		}
		if _, exists := seenPaths[credit.Path]; exists {
			return fmt.Errorf("duplicate damage credit reference %q", credit.Path)
		}
		seenPaths[credit.Path] = struct{}{}
	}
	for _, credit := range value.HealingCredits {
		if credit.Amount <= 0 {
			return fmt.Errorf("non-positive healing credit")
		}
	}
	if err := validateForms(value.Forms); err != nil {
		return err
	}
	if value.Assembly != nil {
		if value.Assembly.PhaseDamage == nil {
			return fmt.Errorf("assembly phase damage is null")
		}
		assemblyRules := newDPSTrackerAssemblyOfIron()
		seenTargets := make(map[guid.GUID]struct{})
		for _, target := range value.Assembly.PhaseDamage {
			if _, exists := seenTargets[target.Target]; exists {
				return fmt.Errorf("duplicate assembly phase target %s", target.Target)
			}
			seenTargets[target.Target] = struct{}{}
			if !assemblyRules.isPhaseTarget(target.Target) {
				return fmt.Errorf("invalid assembly phase target %s", target.Target)
			}
			if err := validateTotals("assembly phase", target.Credits); err != nil {
				return err
			}
		}
		seenTargets = make(map[guid.GUID]struct{})
		for _, pending := range value.Assembly.Pending {
			if _, exists := seenTargets[pending.Target]; exists {
				return fmt.Errorf("duplicate assembly pending target %s", pending.Target)
			}
			seenTargets[pending.Target] = struct{}{}
			if !assemblyRules.isPhaseTarget(pending.Target) {
				return fmt.Errorf("invalid assembly pending target %s", pending.Target)
			}
			if pending.Damage == nil {
				return fmt.Errorf("assembly pending target %s has null damage", pending.Target)
			}
			for _, ref := range pending.Damage {
				if ref.Path == "" {
					return fmt.Errorf("empty assembly pending reference")
				}
			}
		}
		seenExcluded := make(map[string]struct{})
		for _, ref := range value.Assembly.Excluded {
			if ref.Path == "" {
				return fmt.Errorf("empty assembly excluded reference")
			}
			if _, exists := seenExcluded[ref.Path]; exists {
				return fmt.Errorf("duplicate assembly excluded reference %q", ref.Path)
			}
			seenExcluded[ref.Path] = struct{}{}
		}
	}
	stats := make(map[unitStatsRef]unitStatsValue)
	seenEncounters := make(map[uuid.UUID]struct{}, len(value.Results))
	for _, result := range value.Results {
		if _, exists := seenEncounters[result.EncounterID]; exists {
			return fmt.Errorf("duplicate DPS result %s", result.EncounterID)
		}
		seenEncounters[result.EncounterID] = struct{}{}
		if result.Units == nil {
			return fmt.Errorf("DPS result %s has null units", result.EncounterID)
		}
		for _, unit := range result.Units {
			ref := unitStatsRef{EncounterID: result.EncounterID, Unit: unit.Unit}
			if _, exists := stats[ref]; exists {
				return fmt.Errorf("duplicate unit stats %v", ref)
			}
			if unit.ObservedForm != "" && unit.ObservedForm != druidFormCat.String() && unit.ObservedForm != druidFormBear.String() {
				return fmt.Errorf("invalid observed form %q for %s", unit.ObservedForm, unit.Unit)
			}
			stats[ref] = unit
		}
	}
	seenPlayers := make(map[guid.GUID]struct{}, len(value.PendingTalentSnapshots))
	for _, pending := range value.PendingTalentSnapshots {
		if _, exists := seenPlayers[pending.Player]; exists {
			return fmt.Errorf("duplicate pending talent player %s", pending.Player)
		}
		seenPlayers[pending.Player] = struct{}{}
		for _, ref := range pending.Stats {
			unit, ok := stats[ref]
			if !ok {
				return fmt.Errorf("pending talent reference %v is not owned by results", ref)
			}
			if ref.Unit != pending.Player || !unit.IsPlayer || unit.Talents != nil {
				return fmt.Errorf("invalid pending talent reference %v for %s", ref, pending.Player)
			}
		}
	}
	return nil
}

func validateForms(value formTrackerStateValue) error {
	seen := make(map[guid.GUID]struct{}, len(value.Current))
	for _, current := range value.Current {
		if current.Form != druidFormCat && current.Form != druidFormBear {
			return fmt.Errorf("invalid current druid form %d", current.Form)
		}
		if _, exists := seen[current.Unit]; exists {
			return fmt.Errorf("duplicate current form for %s", current.Unit)
		}
		seen[current.Unit] = struct{}{}
	}
	seen = make(map[guid.GUID]struct{}, len(value.Encounter))
	for _, state := range value.Encounter {
		if !validDruidForm(state.Active) || !validDruidForm(state.StartedInForm) || state.CatDuration < 0 || state.BearDuration < 0 {
			return fmt.Errorf("invalid encounter form state for %s", state.Unit)
		}
		if _, exists := seen[state.Unit]; exists {
			return fmt.Errorf("duplicate encounter form for %s", state.Unit)
		}
		seen[state.Unit] = struct{}{}
	}
	return nil
}

func validDruidForm(form druidForm) bool { return form <= druidFormBear }

func (s DPSTrackerState) Restore(units *unitdb.Units, idf *identifier.Identifier, resolveDamage func(string) (*messages.Damage, error)) (*DPSTracker, error) {
	if units == nil {
		return nil, fmt.Errorf("nil unit database dependency")
	}
	if err := s.validate(); err != nil {
		return nil, err
	}
	paths := make(map[string]struct{})
	for _, credit := range s.value.DamageCredits {
		paths[credit.Path] = struct{}{}
	}
	if s.value.Assembly != nil {
		for _, pending := range s.value.Assembly.Pending {
			for _, ref := range pending.Damage {
				paths[ref.Path] = struct{}{}
			}
		}
		for _, ref := range s.value.Assembly.Excluded {
			paths[ref.Path] = struct{}{}
		}
	}
	resolved := make(map[string]*messages.Damage, len(paths))
	resolvedPaths := make(map[*messages.Damage]string, len(paths))
	for _, path := range slices.Sorted(maps.Keys(paths)) {
		if resolveDamage == nil {
			return nil, fmt.Errorf("missing damage resolver")
		}
		damage, err := resolveDamage(path)
		if err != nil {
			return nil, err
		}
		if damage == nil {
			return nil, fmt.Errorf("nil damage reference %q", path)
		}
		if previous, exists := resolvedPaths[damage]; exists {
			return nil, fmt.Errorf("damage paths %q and %q resolve to the same message", previous, path)
		}
		resolved[path] = damage
		resolvedPaths[damage] = path
	}
	rule := DamageRuleNone
	if s.value.Assembly != nil {
		rule = DamageRuleAssemblyOfIron
	}
	tracker := NewDPSTracker(units, idf, rule)
	var err error
	if tracker.damageDone, err = restoreTotals(s.value.DamageDone); err != nil {
		return nil, err
	}
	if tracker.rankedDamageDone, err = restoreTotals(s.value.RankedDamageDone); err != nil {
		return nil, err
	}
	if tracker.damageTaken, err = restoreTotals(s.value.DamageTaken); err != nil {
		return nil, err
	}
	if tracker.healingDone, err = restoreTotals(s.value.HealingDone); err != nil {
		return nil, err
	}
	if tracker.absorbDone, err = restoreTotals(s.value.AbsorbDone); err != nil {
		return nil, err
	}
	if s.value.DamageCredits != nil {
		tracker.damageCredits = make(map[*messages.Damage]guid.GUID, len(s.value.DamageCredits))
		for _, credit := range s.value.DamageCredits {
			tracker.damageCredits[resolved[credit.Path]] = credit.Credit
		}
	}
	if s.value.HealingCredits != nil {
		tracker.healingCredits = make([]healingCredit, len(s.value.HealingCredits))
		for i, credit := range s.value.HealingCredits {
			tracker.healingCredits[i] = healingCredit{caster: credit.Caster, at: credit.At, amount: credit.Amount, absorbed: credit.Absorbed}
		}
	}
	tracker.forms = restoreForms(s.value.Forms)
	if s.value.Assembly != nil {
		tracker.assemblyOfIron.phaseDamage = make(map[guid.GUID]map[guid.GUID]int64, len(s.value.Assembly.PhaseDamage))
		for _, target := range s.value.Assembly.PhaseDamage {
			credits, err := restoreTotals(target.Credits)
			if err != nil {
				return nil, err
			}
			tracker.assemblyOfIron.phaseDamage[target.Target] = credits
		}
		if s.value.Assembly.Pending != nil {
			tracker.assemblyPending = make(map[guid.GUID][]*messages.Damage, len(s.value.Assembly.Pending))
			for _, pending := range s.value.Assembly.Pending {
				messages := make([]*messages.Damage, len(pending.Damage))
				for i, ref := range pending.Damage {
					messages[i] = resolved[ref.Path]
				}
				tracker.assemblyPending[pending.Target] = messages
			}
		}
		if s.value.Assembly.Excluded != nil {
			tracker.assemblyExcluded = make(map[*messages.Damage]bool, len(s.value.Assembly.Excluded))
			for _, ref := range s.value.Assembly.Excluded {
				tracker.assemblyExcluded[resolved[ref.Path]] = true
			}
		}
	}
	tracker.results = make(map[uuid.UUID]*DPSResult, len(s.value.Results))
	statsPointers := make(map[unitStatsRef]*UnitCombatStats)
	for _, resultValue := range s.value.Results {
		result := &DPSResult{Units: make(map[guid.GUID]*UnitCombatStats, len(resultValue.Units))}
		for _, unit := range resultValue.Units {
			stats := unit.runtime()
			result.Units[unit.Unit] = stats
			statsPointers[unitStatsRef{EncounterID: resultValue.EncounterID, Unit: unit.Unit}] = stats
		}
		tracker.results[resultValue.EncounterID] = result
	}
	tracker.pendingTalentSnapshots = make(map[guid.GUID][]*UnitCombatStats, len(s.value.PendingTalentSnapshots))
	for _, pending := range s.value.PendingTalentSnapshots {
		var stats []*UnitCombatStats
		if pending.Stats != nil {
			stats = make([]*UnitCombatStats, len(pending.Stats))
		}
		for i, ref := range pending.Stats {
			stats[i] = statsPointers[ref]
		}
		tracker.pendingTalentSnapshots[pending.Player] = stats
	}
	return tracker, nil
}

func restoreTotals(values []guidTotalValue) (map[guid.GUID]int64, error) {
	result := make(map[guid.GUID]int64, len(values))
	for _, value := range values {
		if _, exists := result[value.GUID]; exists {
			return nil, fmt.Errorf("duplicate total for %s", value.GUID)
		}
		result[value.GUID] = value.Total
	}
	return result, nil
}

func restoreForms(value formTrackerStateValue) *druidFormTracker {
	forms := &druidFormTracker{current: make(map[guid.GUID]druidForm, len(value.Current)), encounter: make(map[guid.GUID]*formState, len(value.Encounter)), fightStartedAt: value.FightStartedAt}
	for _, current := range value.Current {
		forms.current[current.Unit] = current.Form
	}
	for _, encounter := range value.Encounter {
		forms.encounter[encounter.Unit] = &formState{active: encounter.Active, activeSince: encounter.ActiveSince, catDuration: encounter.CatDuration, bearDuration: encounter.BearDuration, startedInForm: encounter.StartedInForm}
	}
	return forms
}

func (v unitStatsValue) runtime() *UnitCombatStats {
	stats := &UnitCombatStats{DamageDone: v.DamageDone, RankedDamageDone: v.RankedDamageDone, UnrankedDamageDone: v.UnrankedDamageDone, DamageTaken: v.DamageTaken, HealingDone: v.HealingDone, HealingAbsorbed: v.HealingAbsorbed, IsPlayer: v.IsPlayer, Talents: combatant.CloneTalents(v.Talents), ObservedForm: v.ObservedForm}
	if v.OwnerGUID != nil {
		owner := *v.OwnerGUID
		stats.OwnerGUID = &owner
	}
	return stats
}
