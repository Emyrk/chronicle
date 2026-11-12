package rankings

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"slices"
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/common/unitdb"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
)

const SpeedrunTrackerStateType = "rankings.SpeedrunTracker"
const SpeedrunTrackerStateVersion uint32 = 1

// SpeedrunTrackerState owns incremental proof and timing state. Rules and shared
// tracker dependencies remain trusted session configuration supplied to Restore.
type SpeedrunTrackerState struct{ value speedrunTrackerStateValue }

type speedrunTrackerStateValue struct {
	ConfigSHA256                     string                          `json:"config_sha256"`
	HasUnits                         bool                            `json:"has_units"`
	HasEngagement                    bool                            `json:"has_engagement"`
	Requirements                     []speedrunRequirementStateValue `json:"requirements"`
	Remaining                        int                             `json:"remaining"`
	BossesRemaining                  int                             `json:"bosses_remaining"`
	SeenGUIDs                        []guid.GUID                     `json:"seen_guids"`
	BossCompletionTime               time.Time                       `json:"boss_completion_time"`
	StartTime                        time.Time                       `json:"start_time"`
	CompletionTime                   time.Time                       `json:"completion_time"`
	Completed                        bool                            `json:"completed"`
	CurrentFightStart                time.Time                       `json:"current_fight_start"`
	CurrentFightSatisfiedBoss        bool                            `json:"current_fight_satisfied_boss"`
	CurrentFightSatisfiedRankedStart bool                            `json:"current_fight_satisfied_ranked_start"`
	RankedStartTime                  time.Time                       `json:"ranked_start_time"`
	RankedCompletionTime             time.Time                       `json:"ranked_completion_time"`
	BossToBossStartTime              time.Time                       `json:"boss_to_boss_start_time"`
	BossToBossCompletionTime         time.Time                       `json:"boss_to_boss_completion_time"`
}

type speedrunRequirementStateValue struct {
	Kills     []KillRecord `json:"kills"`
	Satisfied bool         `json:"satisfied"`
}

type speedrunConfigValue struct {
	Requirements                []SpeedrunRequirement  `json:"requirements"`
	LevelRange                  *LevelRangeRequirement `json:"level_range"`
	RankedStartAfterRequirement string                 `json:"ranked_start_after_requirement"`
	ReentryGapNanoseconds       int64                  `json:"reentry_gap_nanoseconds"`
}

func speedrunConfigSHA256(rules SpeedrunRules) (string, error) {
	payload, err := json.Marshal(speedrunConfigValue{
		Requirements:                rules.Requirements,
		LevelRange:                  rules.LevelRange,
		RankedStartAfterRequirement: rules.RankedStartAfterRequirement,
		ReentryGapNanoseconds:       int64(rules.ReentryGap),
	})
	if err != nil {
		return "", fmt.Errorf("encode speedrun configuration identity: %w", err)
	}
	digest := sha256.Sum256(payload)
	return hex.EncodeToString(digest[:]), nil
}

func (t *SpeedrunTracker) CaptureState() (SpeedrunTrackerState, error) {
	if t == nil || t.entryToRule == nil || t.state == nil || t.seenGUIDs == nil {
		return SpeedrunTrackerState{}, fmt.Errorf("incomplete speedrun tracker")
	}
	configSHA256, err := speedrunConfigSHA256(t.rules)
	if err != nil {
		return SpeedrunTrackerState{}, err
	}
	value := speedrunTrackerStateValue{
		ConfigSHA256:                     configSHA256,
		HasUnits:                         t.units != nil,
		HasEngagement:                    t.engagement != nil,
		Requirements:                     make([]speedrunRequirementStateValue, len(t.state)),
		Remaining:                        t.remaining,
		BossesRemaining:                  t.bossesRemaining,
		SeenGUIDs:                        make([]guid.GUID, 0, len(t.seenGUIDs)),
		BossCompletionTime:               t.bossCompletionTime,
		StartTime:                        t.startTime,
		CompletionTime:                   t.completionTime,
		Completed:                        t.completed,
		CurrentFightStart:                t.currentFightStart,
		CurrentFightSatisfiedBoss:        t.currentFightSatisfiedBoss,
		CurrentFightSatisfiedRankedStart: t.currentFightSatisfiedRankedStart,
		RankedStartTime:                  t.rankedStartTime,
		RankedCompletionTime:             t.rankedCompletionTime,
		BossToBossStartTime:              t.bossToBossStartTime,
		BossToBossCompletionTime:         t.bossToBossCompletionTime,
	}
	for i, requirement := range t.state {
		value.Requirements[i] = speedrunRequirementStateValue{Satisfied: requirement.satisfied}
		if requirement.kills != nil {
			value.Requirements[i].Kills = slices.Clone(requirement.kills)
		}
	}
	for id := range t.seenGUIDs {
		value.SeenGUIDs = append(value.SeenGUIDs, id)
	}
	slices.Sort(value.SeenGUIDs)
	state := SpeedrunTrackerState{value: value}
	if err := state.validate(t.rules); err != nil {
		return SpeedrunTrackerState{}, err
	}
	return state, nil
}

func (s SpeedrunTrackerState) Encode() ([]byte, error) {
	if err := s.validateShape(); err != nil {
		return nil, err
	}
	return json.Marshal(s.value)
}

func DecodeSpeedrunTrackerState(version uint32, payload []byte) (SpeedrunTrackerState, error) {
	if version != SpeedrunTrackerStateVersion {
		return SpeedrunTrackerState{}, fmt.Errorf("unsupported %s version %d", SpeedrunTrackerStateType, version)
	}
	if err := validateUniqueJSON(payload); err != nil {
		return SpeedrunTrackerState{}, err
	}
	var fields map[string]json.RawMessage
	if err := json.Unmarshal(payload, &fields); err != nil || fields == nil {
		return SpeedrunTrackerState{}, fmt.Errorf("speedrun tracker state must be an object")
	}
	names := []string{
		"config_sha256", "has_units", "has_engagement", "requirements", "remaining", "bosses_remaining", "seen_guids",
		"boss_completion_time", "start_time", "completion_time", "completed", "current_fight_start",
		"current_fight_satisfied_boss", "current_fight_satisfied_ranked_start", "ranked_start_time",
		"ranked_completion_time", "boss_to_boss_start_time", "boss_to_boss_completion_time",
	}
	if len(fields) != len(names) {
		return SpeedrunTrackerState{}, fmt.Errorf("speedrun tracker state requires %d fields", len(names))
	}
	for _, name := range names {
		raw, exists := fields[name]
		if !exists || bytes.Equal(bytes.TrimSpace(raw), []byte("null")) {
			return SpeedrunTrackerState{}, fmt.Errorf("speedrun tracker field %q is missing or null", name)
		}
	}
	var requirements []json.RawMessage
	if err := json.Unmarshal(fields["requirements"], &requirements); err != nil {
		return SpeedrunTrackerState{}, fmt.Errorf("decode speedrun requirements: %w", err)
	}
	for i, requirement := range requirements {
		var entry map[string]json.RawMessage
		if err := json.Unmarshal(requirement, &entry); err != nil || entry == nil || len(entry) != 2 {
			return SpeedrunTrackerState{}, fmt.Errorf("speedrun requirement state %d requires kills and satisfied", i)
		}
		killsRaw, hasKills := entry["kills"]
		satisfiedRaw, hasSatisfied := entry["satisfied"]
		if !hasKills || !hasSatisfied || bytes.Equal(bytes.TrimSpace(satisfiedRaw), []byte("null")) {
			return SpeedrunTrackerState{}, fmt.Errorf("speedrun requirement state %d has missing or null fields", i)
		}
		if bytes.Equal(bytes.TrimSpace(killsRaw), []byte("null")) {
			continue
		}
		var kills []json.RawMessage
		if err := json.Unmarshal(entry["kills"], &kills); err != nil {
			return SpeedrunTrackerState{}, fmt.Errorf("decode speedrun requirement %d kills: %w", i, err)
		}
		for j, kill := range kills {
			if _, err := requiredJSONFields(kill, "speedrun kill", "entry_id", "guid", "timestamp"); err != nil {
				return SpeedrunTrackerState{}, fmt.Errorf("speedrun requirement %d kill %d: %w", i, j, err)
			}
		}
	}
	var value speedrunTrackerStateValue
	decoder := json.NewDecoder(bytes.NewReader(payload))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&value); err != nil {
		return SpeedrunTrackerState{}, fmt.Errorf("decode speedrun tracker state: %w", err)
	}
	if err := decoder.Decode(new(any)); err != io.EOF {
		return SpeedrunTrackerState{}, fmt.Errorf("trailing speedrun tracker state")
	}
	state := SpeedrunTrackerState{value: value}
	if err := state.validateShape(); err != nil {
		return SpeedrunTrackerState{}, err
	}
	return state, nil
}

func (s SpeedrunTrackerState) validateShape() error {
	if len(s.value.ConfigSHA256) != sha256.Size*2 {
		return fmt.Errorf("invalid speedrun configuration identity")
	}
	if _, err := hex.DecodeString(s.value.ConfigSHA256); err != nil {
		return fmt.Errorf("invalid speedrun configuration identity: %w", err)
	}
	if s.value.Requirements == nil || s.value.SeenGUIDs == nil {
		return fmt.Errorf("speedrun tracker collections are nil")
	}
	seen := make(map[guid.GUID]struct{}, len(s.value.SeenGUIDs))
	for _, id := range s.value.SeenGUIDs {
		if id.IsZero() {
			return fmt.Errorf("zero seen speedrun GUID")
		}
		if _, exists := seen[id]; exists {
			return fmt.Errorf("duplicate seen speedrun GUID %s", id)
		}
		seen[id] = struct{}{}
	}
	proofGUIDs := make(map[guid.GUID]struct{})
	for i, requirement := range s.value.Requirements {
		for j, kill := range requirement.Kills {
			if kill.EntryID == 0 || kill.GUID.IsZero() || kill.Timestamp.IsZero() {
				return fmt.Errorf("invalid speedrun requirement %d kill %d", i, j)
			}
			entryID, ok := kill.GUID.GetEntry()
			if !ok || entryID != kill.EntryID {
				return fmt.Errorf("speedrun requirement %d kill %d GUID entry mismatch", i, j)
			}
			if _, exists := proofGUIDs[kill.GUID]; exists {
				return fmt.Errorf("duplicate speedrun proof GUID %s", kill.GUID)
			}
			proofGUIDs[kill.GUID] = struct{}{}
			if _, exists := seen[kill.GUID]; !exists {
				return fmt.Errorf("speedrun proof GUID %s is not seen", kill.GUID)
			}
		}
	}
	if s.value.Remaining < 0 || s.value.BossesRemaining < 0 {
		return fmt.Errorf("negative speedrun requirement counters")
	}
	if s.value.Completed && s.value.Remaining != 0 {
		return fmt.Errorf("completed speedrun has remaining requirements")
	}
	return nil
}

func (s SpeedrunTrackerState) validate(rules SpeedrunRules) error {
	if err := s.validateShape(); err != nil {
		return err
	}
	identity, err := speedrunConfigSHA256(rules)
	if err != nil {
		return err
	}
	if identity != s.value.ConfigSHA256 {
		return fmt.Errorf("speedrun configuration identity mismatch")
	}
	if len(s.value.Requirements) != len(rules.Requirements) {
		return fmt.Errorf("speedrun requirement state count mismatch")
	}
	entryToRule := make(map[uint32]int)
	remaining, bossesRemaining := 0, 0
	for i, requirement := range rules.Requirements {
		for _, entryID := range requirement.EntryIDs {
			entryToRule[entryID] = i
		}
		state := s.value.Requirements[i]
		if state.Satisfied && len(state.Kills) < requirement.Count {
			return fmt.Errorf("speedrun requirement %d satisfaction mismatch", i)
		}
		if !state.Satisfied && requirement.Count > 0 && len(state.Kills) >= requirement.Count {
			return fmt.Errorf("speedrun requirement %d satisfaction mismatch", i)
		}
		if !state.Satisfied {
			remaining++
			if requirement.Category != SpeedrunCategoryTrash {
				bossesRemaining++
			}
		}
	}
	if s.value.Remaining != remaining || s.value.BossesRemaining != bossesRemaining {
		return fmt.Errorf("speedrun requirement counters mismatch")
	}
	for i, requirement := range s.value.Requirements {
		for _, kill := range requirement.Kills {
			ruleIndex, exists := entryToRule[kill.EntryID]
			if !exists || ruleIndex != i {
				return fmt.Errorf("speedrun proof entry %d belongs to another requirement", kill.EntryID)
			}
		}
	}
	return nil
}

// Restore rebuilds configuration-derived indexes, injects canonical shared
// dependencies, and copies owner state without replaying kills or fight hooks.
func (s SpeedrunTrackerState) Restore(rules SpeedrunRules, units *unitdb.Units, engagement *EngagementTracker) (*SpeedrunTracker, error) {
	if err := s.validate(rules); err != nil {
		return nil, err
	}
	if s.value.HasUnits != (units != nil) || s.value.HasEngagement != (engagement != nil) {
		return nil, fmt.Errorf("speedrun dependency presence mismatch")
	}
	tracker := NewSpeedrunTracker(rules, units, engagement)
	tracker.remaining = s.value.Remaining
	tracker.bossesRemaining = s.value.BossesRemaining
	tracker.bossCompletionTime = s.value.BossCompletionTime
	tracker.startTime = s.value.StartTime
	tracker.completionTime = s.value.CompletionTime
	tracker.completed = s.value.Completed
	tracker.currentFightStart = s.value.CurrentFightStart
	tracker.currentFightSatisfiedBoss = s.value.CurrentFightSatisfiedBoss
	tracker.currentFightSatisfiedRankedStart = s.value.CurrentFightSatisfiedRankedStart
	tracker.rankedStartTime = s.value.RankedStartTime
	tracker.rankedCompletionTime = s.value.RankedCompletionTime
	tracker.bossToBossStartTime = s.value.BossToBossStartTime
	tracker.bossToBossCompletionTime = s.value.BossToBossCompletionTime
	for i, requirement := range s.value.Requirements {
		tracker.state[i].satisfied = requirement.Satisfied
		if requirement.Kills != nil {
			tracker.state[i].kills = slices.Clone(requirement.Kills)
		}
	}
	clear(tracker.seenGUIDs)
	for _, id := range s.value.SeenGUIDs {
		tracker.seenGUIDs[id] = struct{}{}
	}
	return tracker, nil
}
