package chroniclesdk

import "time"

// Achievement API contract. See docs/achievement-system.md.
//
// The Storybook stories under frontend/chronicle/src/features/achievements
// render the real achievements page against mocked responses of these types.
// Change these types and the stories together.

// AchievementVisibility controls how an achievement appears before it is earned.
type AchievementVisibility string

const (
	// AchievementVisibilityVisible achievements show name and criteria to everyone.
	AchievementVisibilityVisible AchievementVisibility = "visible"
	// AchievementVisibilityHidden achievements omit name, description, and
	// criteria until the viewer earns them. Completion rate is still shown.
	AchievementVisibilityHidden AchievementVisibility = "hidden"
	// AchievementVisibilityFeatOfStrength achievements are listed only after
	// they are earned and award no points unless explicitly configured.
	AchievementVisibilityFeatOfStrength AchievementVisibility = "feat_of_strength"
)

// AchievementRequirementKind is the kind of prerequisite gating an achievement.
// A requirement is not progress: it says whether the viewer can work on it.
type AchievementRequirementKind string

const (
	AchievementRequirementReputation AchievementRequirementKind = "reputation"
	AchievementRequirementPermission AchievementRequirementKind = "permission"
	AchievementRequirementCapability AchievementRequirementKind = "capability"
	AchievementRequirementUnreleased AchievementRequirementKind = "unreleased"
)

// AchievementRewardKind is the presentation slot an achievement reward unlocks.
type AchievementRewardKind string

const (
	AchievementRewardName       AchievementRewardKind = "name"
	AchievementRewardBackground AchievementRewardKind = "background"
	AchievementRewardBorder     AchievementRewardKind = "border"
	AchievementRewardTitle      AchievementRewardKind = "title"
	AchievementRewardBadge      AchievementRewardKind = "badge"
)

// AchievementCategory is a WoW-style navigation group.
type AchievementCategory struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	Description string `json:"description"`
	// Icon is a frontend icon key, such as "book-open" or "keyboard".
	Icon string `json:"icon"`
}

// AchievementSeries groups achievements that represent increasing
// proficiency in one concept, displayed as tiers.
type AchievementSeries struct {
	ID          string `json:"id"`
	CategoryID  string `json:"category_id"`
	Name        string `json:"name"`
	Description string `json:"description"`
}

// AchievementRequirement is a structured prerequisite, shown wherever the
// achievement is shown.
type AchievementRequirement struct {
	Kind AchievementRequirementKind `json:"kind"`
	// Label is user-facing, such as "Requires Honored reputation".
	Label string `json:"label"`
	// Met is whether the current viewer satisfies the requirement. Always
	// false for anonymous viewers.
	Met bool `json:"met"`
}

// AchievementReward is a cosmetic or presentation reward.
type AchievementReward struct {
	ID   string                `json:"id"`
	Kind AchievementRewardKind `json:"kind"`
	Name string                `json:"name"`
}

// AchievementCompletionRate is the share of the catalog-wide account cohort
// that has earned an achievement. Computed asynchronously and cached.
type AchievementCompletionRate struct {
	EarnedAccountCount   int64      `json:"earned_account_count"`
	EligibleAccountCount int64      `json:"eligible_account_count"`
	CalculatedAt         time.Time  `json:"calculated_at"`
	FrozenAt             *time.Time `json:"frozen_at,omitempty"`
}

// Achievement is one versioned achievement definition.
type Achievement struct {
	ID         string `json:"id"`
	Version    int32  `json:"version"`
	CategoryID string `json:"category_id"`
	SeriesID   string `json:"series_id,omitempty"`
	// Tier is the 1-based tier within SeriesID, or 0 when not in a series.
	Tier       int32                 `json:"tier"`
	Visibility AchievementVisibility `json:"visibility"`
	// Name and Description are empty for unearned hidden achievements.
	Name        string `json:"name"`
	Description string `json:"description"`
	// Icon is a frontend icon key. Defaults to the category icon when empty.
	Icon   string `json:"icon,omitempty"`
	Points int32  `json:"points"`
	// Keybind is the key sequence for keybind achievements, such as "Shift+E".
	// The frontend renders it platform-aware.
	Keybind      string                   `json:"keybind,omitempty"`
	Requirements []AchievementRequirement `json:"requirements"`
	// RequiredAchievementIDs is set only for set achievements.
	RequiredAchievementIDs []string            `json:"required_achievement_ids,omitempty"`
	Rewards                []AchievementReward `json:"rewards"`
	// FeatureURL is an optional in-app link to where the achievement is earned.
	FeatureURL     string                    `json:"feature_url,omitempty"`
	CompletionRate AchievementCompletionRate `json:"completion_rate"`
	IntroducedAt   time.Time                 `json:"introduced_at"`
	RetiredAt      *time.Time                `json:"retired_at,omitempty"`
}

// AchievementProgress is the viewer's state for one achievement. Absent
// entries mean not started.
type AchievementProgress struct {
	AchievementID string     `json:"achievement_id"`
	Version       int32      `json:"version"`
	EarnedAt      *time.Time `json:"earned_at,omitempty"`
	// Retroactive is true when the award came from backfilled evidence; EarnedAt
	// is then the earliest evidence timestamp or the migration award time.
	Retroactive bool `json:"retroactive"`
	// Current and Required describe multi-action or counter progress. Both are
	// 0 for one-shot achievements.
	Current  int32 `json:"current"`
	Required int32 `json:"required"`
}

// AchievementViewer is the signed-in account's achievement state.
type AchievementViewer struct {
	EarnedPoints int32                 `json:"earned_points"`
	Progress     []AchievementProgress `json:"progress"`
}

// AchievementsResponse is returned by GET /api/v1/achievements.
type AchievementsResponse struct {
	Categories   []AchievementCategory `json:"categories"`
	Series       []AchievementSeries   `json:"series"`
	Achievements []Achievement         `json:"achievements"`
	// TotalPoints is the sum of points across active, non-Feat achievements.
	TotalPoints int32 `json:"total_points"`
	// Viewer is nil for anonymous requests.
	Viewer *AchievementViewer `json:"viewer"`
}
