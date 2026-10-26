package chroniclesdk

import "github.com/google/uuid"

// LandingFeaturedResponse is the public payload behind the /start hero.
// Featured is nil when no featured instance is configured or it cannot be
// shown (missing, unlisted, invalidated); the landing then shows its poster only.
type LandingFeaturedResponse struct {
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
}

// LandingFeaturedBoss is one boss encounter (kill or wipe), ordered by pull.
// Offsets are milliseconds from the instance start.
type LandingFeaturedBoss struct {
	Name          string `json:"name"`
	StartOffsetMs int64  `json:"start_offset_ms"`
	EndOffsetMs   int64  `json:"end_offset_ms"`
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
