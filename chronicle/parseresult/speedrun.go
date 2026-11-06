package parseresult

import (
	"slices"
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/common/encounter"
	"github.com/Emyrk/chronicle/combatlog/parser/common/instances"
	"github.com/Emyrk/chronicle/combatlog/parser/common/instances/rankings"
)

// Speedrun keeps parser observations and the legacy insertion eligibility inputs.
// A non-nil value can be ineligible (for example a trash-only run); the primary
// applies rankability and resolves instance, realm and guild IDs at write time.
type Speedrun struct {
	Qualified      bool                          `json:"qualified"`
	HasBossKill    bool                          `json:"has_boss_kill"`
	ServerSide     bool                          `json:"server_side"`
	AddonVersion   string                        `json:"addon_version"`
	StartTime      time.Time                     `json:"start_time"`
	CompletionTime time.Time                     `json:"completion_time"`
	DurationMs     int64                         `json:"duration_ms"`
	Ranked         *SpeedrunTiming               `json:"ranked,omitempty"`
	BossToBoss     *SpeedrunTiming               `json:"boss_to_boss,omitempty"`
	Proof          rankings.SpeedrunProofPayload `json:"proof"`
}

// SpeedrunTiming exists only when both endpoints are present. A zero duration
// is still valid and must not be confused with an absent timing window.
type SpeedrunTiming struct {
	StartTime      time.Time `json:"start_time"`
	CompletionTime time.Time `json:"completion_time"`
	DurationMs     int64     `json:"duration_ms"`
}

func buildSpeedrun(fin *instances.FinalizedInstance, capabilities []string) *Speedrun {
	if fin.Rankings == nil || fin.Rankings.Speedrun == nil {
		return nil
	}
	sr := fin.Rankings.Speedrun
	out := &Speedrun{
		Qualified: sr.Qualified, ServerSide: slices.Contains(capabilities, "server-side"),
		AddonVersion: fin.Versions["addon"], StartTime: sr.StartTime,
		CompletionTime: sr.CompletionTime, DurationMs: sr.Duration.Milliseconds(),
		Proof: rankings.SpeedrunProofPayload{LevelRange: cloneLevelRange(sr.LevelRange)},
	}
	for _, enc := range fin.Encounters {
		if enc.Boss && (enc.KillType == encounter.KillTypeClean || enc.KillType == encounter.KillTypePartial) {
			out.HasBossKill = true
			break
		}
	}
	if !sr.RankedStartTime.IsZero() && !sr.RankedCompletionTime.IsZero() {
		out.Ranked = &SpeedrunTiming{StartTime: sr.RankedStartTime, CompletionTime: sr.RankedCompletionTime, DurationMs: sr.RankedDuration.Milliseconds()}
	}
	if !sr.BossToBossStartTime.IsZero() && !sr.BossToBossCompletionTime.IsZero() {
		out.BossToBoss = &SpeedrunTiming{StartTime: sr.BossToBossStartTime, CompletionTime: sr.BossToBossCompletionTime, DurationMs: sr.BossToBossDuration.Milliseconds()}
	}
	if sr.Proof != nil {
		out.Proof.Proof = make([]rankings.SpeedrunProof, len(sr.Proof))
		for i, proof := range sr.Proof {
			out.Proof.Proof[i] = proof
			out.Proof.Proof[i].Requirement.EntryIDs = slices.Clone(proof.Requirement.EntryIDs)
			out.Proof.Proof[i].Kills = slices.Clone(proof.Kills)
		}
	}
	return out
}

func cloneLevelRange(in *rankings.LevelRangeResult) *rankings.LevelRangeResult {
	if in == nil {
		return nil
	}
	out := *in
	out.Violators = slices.Clone(in.Violators)
	return &out
}
