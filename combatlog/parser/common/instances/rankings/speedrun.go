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
}

func NewSpeedrunTracker(rules SpeedrunRules, units *unitdb.Units, engagement *EngagementTracker) *SpeedrunTracker {
	entryToRule := make(map[uint32]int)
	for i, req := range rules.Requirements {
		for _, eid := range req.EntryIDs {
			entryToRule[eid] = i
		}
	}
	return &SpeedrunTracker{
		rules:       rules,
		entryToRule: entryToRule,
		state:       make([]requirementState, len(rules.Requirements)),
		remaining:   len(rules.Requirements),
		seenGUIDs:   make(map[guid.GUID]struct{}),
		units:       units,
		engagement:  engagement,
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
		}
	}
}

func (t *SpeedrunTracker) CharacterAdded(_ messages.Message, _ ...characters.Character) {}

// --- instancehook.Hook implementation ---

func (t *SpeedrunTracker) ProcessMessage(_ bool, _ uuid.UUID, _ messages.Message) error {
	return nil
}

// FightStarted records the start time on the very first fight only.
func (t *SpeedrunTracker) FightStarted(_ uuid.UUID, m messages.Message) {
	if t.startTime.IsZero() {
		t.startTime = m.Date()
	}
}

// FightEnded checks whether all requirements are now satisfied. If so, it marks
// the speedrun as completed with this fight's end timestamp.
func (t *SpeedrunTracker) FightEnded(_ uuid.UUID, m messages.Message) {
	if t.completed || t.remaining != 0 {
		return
	}
	t.completed = true
	t.completionTime = m.Date()
}

func (t *SpeedrunTracker) Finalize(_ context.Context) error { return nil }

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

	result := &SpeedrunResult{
		Qualified:      t.completed,
		StartTime:      t.startTime,
		CompletionTime: t.completionTime,
		Duration:       t.completionTime.Sub(t.startTime),
		Proof:          proof,
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
