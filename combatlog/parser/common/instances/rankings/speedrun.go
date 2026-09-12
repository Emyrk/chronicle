package rankings

import (
	"context"
	"sort"
	"time"

	"github.com/google/uuid"

	"github.com/Emyrk/chronicle/combatlog/parser/common/characters"
	"github.com/Emyrk/chronicle/combatlog/parser/common/characters/period"
	"github.com/Emyrk/chronicle/combatlog/parser/common/instances/instancehook"
	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/common/unitdb"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
)

var (
	_ instancehook.Hook  = (*SpeedrunTracker)(nil)
	_ characters.SetHook = (*SpeedrunTracker)(nil)
)

type requirementState struct {
	kills     []KillRecord
	satisfied bool
}

// SpeedrunTracker watches character activity changes and fight lifecycle events
// to determine whether all speedrun requirements have been met and how long it
// took. It implements both instancehook.Hook (fight start/end) and
// characters.SetHook (kill detection via EndStateSlain).
type SpeedrunTracker struct {
	instancehook.BaseHook

	rules       SpeedrunRules
	entryToRule map[uint32]int // entry ID → index into rules.Requirements
	state       []requirementState
	remaining   int // unsatisfied requirements remaining
	seenGUIDs   map[guid.GUID]struct{}

	units      *unitdb.Units      // may be nil in tests
	engagement *EngagementTracker // may be nil in tests

	startTime      time.Time
	completionTime time.Time
	completed      bool

	currentFightStart                time.Time
	currentFightSatisfiedBoss        bool
	currentFightSatisfiedRankedStart bool
	rankedStartAfterRequirementIndex int
	rankedStartTime                  time.Time
	rankedCompletionTime             time.Time
	bossToBossStartTime              time.Time
	bossToBossCompletionTime         time.Time
}

func NewSpeedrunTracker(rules SpeedrunRules, units *unitdb.Units, engagement *EngagementTracker) *SpeedrunTracker {
	entryToRule := make(map[uint32]int)
	rankedStartAfterRequirementIndex := -1
	for i, req := range rules.Requirements {
		for _, eid := range req.EntryIDs {
			entryToRule[eid] = i
		}
		if req.Name == rules.RankedStartAfterRequirement {
			rankedStartAfterRequirementIndex = i
		}
	}
	return &SpeedrunTracker{
		rules:                            rules,
		entryToRule:                      entryToRule,
		state:                            make([]requirementState, len(rules.Requirements)),
		remaining:                        len(rules.Requirements),
		seenGUIDs:                        make(map[guid.GUID]struct{}),
		units:                            units,
		engagement:                       engagement,
		rankedStartAfterRequirementIndex: rankedStartAfterRequirementIndex,
	}
}

// --- characters.SetHook implementation ---

// ActivityChange is called whenever characters' activity status changes. We look
// for characters that just went inactive with EndStateSlain and check whether
// their entry ID matches a tracked requirement.
func (t *SpeedrunTracker) ActivityChange(m messages.Message, chars ...characters.Character) {
	if t.completed {
		return
	}

	for _, c := range chars {
		if c.IsActive() {
			continue
		}

		p, ok := c.CurrentPeriod()
		if !ok || p.EndState != period.EndStateSlain {
			continue
		}

		entry, ok := c.ID().GetEntry()
		if !ok {
			continue
		}

		ruleIdx, tracked := t.entryToRule[entry]
		if !tracked {
			continue
		}

		// Deduplicate: same creature GUID only counted once.
		if _, seen := t.seenGUIDs[c.ID()]; seen {
			continue
		}
		t.seenGUIDs[c.ID()] = struct{}{}

		rs := &t.state[ruleIdx]
		if rs.satisfied {
			continue
		}

		rs.kills = append(rs.kills, KillRecord{
			EntryID:   entry,
			GUID:      c.ID(),
			Timestamp: m.Date(),
		})
		if len(rs.kills) >= t.rules.Requirements[ruleIdx].Count {
			rs.satisfied = true
			t.remaining--
			if t.rules.Requirements[ruleIdx].Category != SpeedrunCategoryTrash {
				t.currentFightSatisfiedBoss = true
				if ruleIdx == t.rankedStartAfterRequirementIndex {
					t.currentFightSatisfiedRankedStart = true
				}
			}
		}
	}
}

func (t *SpeedrunTracker) CharacterAdded(_ messages.Message, _ ...characters.Character) {}

// --- instancehook.Hook implementation ---

func (t *SpeedrunTracker) ProcessMessage(_ bool, _ uuid.UUID, _ messages.Message) error {
	return nil
}

// FightStarted records the raw and default ranked clear start on the first fight,
// and retains each fight start so boss-to-boss timing can begin on a boss pull.
func (t *SpeedrunTracker) FightStarted(_ uuid.UUID, m messages.Message) {
	t.currentFightStart = m.Date()
	t.currentFightSatisfiedBoss = false
	t.currentFightSatisfiedRankedStart = false
	if t.startTime.IsZero() {
		t.startTime = m.Date()
		if t.rankedStartAfterRequirementIndex < 0 {
			t.rankedStartTime = m.Date()
		}
	}
}

// FightEnded updates all timing boundaries, then checks whether all requirements
// are satisfied. Timings end with the final required boss even when trailing trash
// requirements qualify the run later.
func (t *SpeedrunTracker) FightEnded(encounterID uuid.UUID, m messages.Message) {
	if t.completed {
		return
	}

	if t.bossToBossStartTime.IsZero() && (t.encounterIncludesRequiredBoss(encounterID) || t.currentFightSatisfiedBoss) {
		t.bossToBossStartTime = t.currentFightStart
	}
	if t.rankedStartTime.IsZero() && t.currentFightSatisfiedRankedStart {
		t.rankedStartTime = m.Date()
	}
	if t.currentFightSatisfiedBoss {
		t.completionTime = m.Date()
		t.rankedCompletionTime = m.Date()
		t.bossToBossCompletionTime = m.Date()
	}

	if t.remaining != 0 {
		return
	}
	if t.completionTime.IsZero() {
		t.completionTime = m.Date()
	}
	t.completed = true
}

func (t *SpeedrunTracker) encounterIncludesRequiredBoss(encounterID uuid.UUID) bool {
	if t.engagement == nil {
		return false
	}
	for gid := range t.engagement.EncounterEngaged(encounterID) {
		entry, ok := gid.GetEntry()
		if !ok {
			continue
		}
		ruleIdx, ok := t.entryToRule[entry]
		if ok && t.rules.Requirements[ruleIdx].Category != SpeedrunCategoryTrash {
			return true
		}
	}
	return false
}

func (t *SpeedrunTracker) Finalize(_ context.Context) error { return nil }

// CompletedAt returns the completion timestamp and whether the run completed.
func (t *SpeedrunTracker) CompletedAt() (time.Time, bool) {
	return t.completionTime, t.completed
}

// ReentryGap returns the inactivity gap required before a later entry starts a
// new run. Raids default to 24 hours; dungeon rules opt into a shorter gap.
func (t *SpeedrunTracker) ReentryGap() time.Duration {
	if t.rules.ReentryGap > 0 {
		return t.rules.ReentryGap
	}
	return DefaultReentryGap
}

// --- Output ---

// Result builds the SpeedrunResult with proof for every requirement.
func (t *SpeedrunTracker) Result() *SpeedrunResult {
	proof := make([]SpeedrunProof, len(t.rules.Requirements))
	for i, req := range t.rules.Requirements {
		kills := t.state[i].kills
		if kills == nil {
			kills = []KillRecord{}
		}
		proof[i] = SpeedrunProof{
			Requirement: req,
			Kills:       kills,
			Satisfied:   t.state[i].satisfied,
		}
	}

	rankedDuration := time.Duration(0)
	if !t.rankedStartTime.IsZero() && !t.rankedCompletionTime.IsZero() {
		rankedDuration = t.rankedCompletionTime.Sub(t.rankedStartTime)
	}
	bossToBossDuration := time.Duration(0)
	if !t.bossToBossStartTime.IsZero() && !t.bossToBossCompletionTime.IsZero() {
		bossToBossDuration = t.bossToBossCompletionTime.Sub(t.bossToBossStartTime)
	}
	result := &SpeedrunResult{
		Qualified:                t.completed,
		StartTime:                t.startTime,
		CompletionTime:           t.completionTime,
		Duration:                 t.completionTime.Sub(t.startTime),
		RankedStartTime:          t.rankedStartTime,
		RankedCompletionTime:     t.rankedCompletionTime,
		RankedDuration:           rankedDuration,
		BossToBossStartTime:      t.bossToBossStartTime,
		BossToBossCompletionTime: t.bossToBossCompletionTime,
		BossToBossDuration:       bossToBossDuration,
		Proof:                    proof,
	}

	// Check the level range against engaged players only. Player metadata can come
	// from UNIT_INFO or COMBATANT_INFO depending on the log format, so consult both.
	if t.rules.LevelRange != nil && t.units != nil && t.engagement != nil {
		lr := &LevelRangeResult{
			Requirement: *t.rules.LevelRange,
			Satisfied:   true,
			Violators:   []LevelViolation{},
		}
		engagedPlayers := t.engagement.AllEngagedPlayers()
		for gid := range engagedPlayers {
			// A zero GUID can represent unattributed damage, such as reflected
			// Shadow Word: Death damage. It is not a player to level-check.
			if gid.IsZero() || !gid.IsPlayer() {
				continue
			}

			var playerName string
			var level int32
			if info, ok := t.units.Get(gid); ok {
				playerName = info.Name
				level = info.Level
			}
			if player, ok := t.units.GetPlayer(gid); ok {
				if player.Name != "" {
					playerName = player.Name
				}
				if player.Level != nil {
					level = *player.Level
				}
			}

			if level == 0 || level < t.rules.LevelRange.MinLevel || level > t.rules.LevelRange.MaxLevel {
				lr.Satisfied = false
				lr.Violators = append(lr.Violators, LevelViolation{
					PlayerName: playerName,
					PlayerGUID: gid,
					Level:      level,
				})
			}
		}
		sort.Slice(lr.Violators, func(i, j int) bool {
			return lr.Violators[i].PlayerName < lr.Violators[j].PlayerName
		})
		result.LevelRange = lr
		if !lr.Satisfied {
			result.Qualified = false
		}
	}

	return result
}
