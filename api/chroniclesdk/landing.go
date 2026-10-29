package chroniclesdk

import "github.com/google/uuid"

// LandingFeaturedResponse is the public payload behind the /start hero.
// Entries is the montage the hero plays in order, looping: the admin-set
// featured instance first when one is configured, then, for each instance
// with a published dungeon mesh, its fastest qualified speedrun among runs
// with unit positions (by the speedrun board's rules, though a run without a
// guild counts), best ranked first (at most six in all). Without
// such ranked runs the montage is the tenant's newest public run with unit
// positions whose last boss pull has a published dungeon mesh. It is empty
// when nothing qualifies or the configured instance cannot be shown (missing,
// unlisted, invalidated); the landing then shows its poster only.
type LandingFeaturedResponse struct {
	Entries []LandingFeaturedRun `json:"entries"`
	// Featured is the first entry, or nil when there is none.
	Featured *LandingFeaturedRun `json:"featured"`
}

type LandingFeaturedRun struct {
	InstanceID   uuid.UUID `json:"instance_id"`
	InstanceName string    `json:"instance_name"`
	// DurationMs spans the instance's first to last event.
	DurationMs  int64                  `json:"duration_ms"`
	PlayerCount int                    `json:"player_count"`
	Bosses      []LandingFeaturedBoss  `json:"bosses"`
	Deaths      []LandingFeaturedDeath `json:"deaths"`
	Upload      LandingFeaturedUpload  `json:"upload"`
	// Encounter is the boss pull the hero plays: the run's last boss kill, or
	// its last wipe when no boss died. Nil when the run has no boss encounter.
	Encounter *LandingFeaturedEncounter `json:"encounter"`
	// Speedrun is the place the run's time takes on its instance's speedrun
	// board, when the montage picked it as that instance's best replayed run.
	Speedrun *LandingFeaturedSpeedrun `json:"speedrun"`
}

// LandingFeaturedSpeedrun is a run's place on the speedrun board (full
// timing, the board's default) for its instance and difficulty.
type LandingFeaturedSpeedrun struct {
	// Rank is the place the run's time takes on the board.
	Rank       int64 `json:"rank"`
	DurationMs int64 `json:"duration_ms"`
}

// LandingFeaturedEncounter is one boss encounter. Offsets are milliseconds
// from the instance start.
type LandingFeaturedEncounter struct {
	ID            uuid.UUID `json:"id"`
	Name          string    `json:"name"`
	Kill          bool      `json:"kill"`
	StartOffsetMs int64     `json:"start_offset_ms"`
	EndOffsetMs   int64     `json:"end_offset_ms"`
}

// LandingFeaturedBoss is one boss encounter (kill or wipe), ordered by pull.
// Offsets are milliseconds from the instance start.
type LandingFeaturedBoss struct {
	ID            uuid.UUID `json:"id"`
	Name          string    `json:"name"`
	Kill          bool      `json:"kill"`
	StartOffsetMs int64     `json:"start_offset_ms"`
	EndOffsetMs   int64     `json:"end_offset_ms"`
}

// LandingFeaturedDeath is a player death, ordered by time.
type LandingFeaturedDeath struct {
	OffsetMs    int64  `json:"offset_ms"`
	VictimName  string `json:"victim_name"`
	VictimClass string `json:"victim_class"`
	// KillerName is empty when the log does not attribute the death.
	KillerName string `json:"killer_name,omitempty"`
}

type LandingUploadSource string

const (
	LandingUploadSourceSidekick LandingUploadSource = "sidekick"
	LandingUploadSourceManual   LandingUploadSource = "manual"
	LandingUploadSourceAPI      LandingUploadSource = "api"
	// LandingUploadSourceUnknown means the upload path was not recorded.
	LandingUploadSourceUnknown LandingUploadSource = "unknown"
)

type LandingFeaturedUpload struct {
	Source LandingUploadSource `json:"source"`
	// DelayMs is the time from the instance's last event to the upload
	// completing. Nil when it cannot be derived.
	DelayMs *int64 `json:"delay_ms"`
}
