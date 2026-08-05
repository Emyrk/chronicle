package chroniclesdk

import (
	"time"

	"github.com/google/uuid"
)

type GuildInfo struct {
	ID          uuid.UUID `json:"id"`
	Name        string    `json:"name"`
	RealmID     uuid.UUID `json:"realm_id"`
	RealmName   string    `json:"realm_name"`
	HasPage     bool      `json:"has_page"`
	PlayerCount int64     `json:"player_count"`
	LogoURL     string    `json:"logo_url"`
	CanEdit       bool `json:"can_edit"`
	CanViewRoster bool `json:"can_view_roster"`
}

type GuildPageConfig struct {
	ID      uuid.UUID       `json:"id"`
	GuildID uuid.UUID       `json:"guild_id"`
	Guild   GuildInfo       `json:"guild"`
	Theme   GuildPageTheme  `json:"theme"`
	Tabs    []GuildPageTab  `json:"tabs"`
}

type GuildPageTheme struct {
	PrimaryColor  string            `json:"primary_color,omitempty"`
	BannerURL     string            `json:"banner_url,omitempty"`
	BackgroundURL string            `json:"background_url,omitempty"`
	LogoURL       string            `json:"logo_url,omitempty"`
	Description   string            `json:"description,omitempty"`
	Tags          []GuildTag               `json:"tags,omitempty"`
	Socials       map[SocialPlatform]string `json:"socials,omitempty"` // platform key -> URL
}

const MaxDescriptionLength = 500
const MaxTags = 10

// SocialURLPrefixes maps each platform to its valid URL prefixes.
var SocialURLPrefixes = map[SocialPlatform][]string{
	SocialPlatformDiscord: {"https://discord.gg/", "https://discord.com/"},
	SocialPlatformYoutube: {"https://youtube.com/", "https://www.youtube.com/"},
	SocialPlatformTwitch:  {"https://twitch.tv/", "https://www.twitch.tv/"},
	SocialPlatformTwitter: {"https://twitter.com/", "https://x.com/"},
	SocialPlatformWebsite: {"https://", "http://"},
}

// DeviceVisibility controls which devices can see a tab or panel
// Valid values: "all" (default), "desktop", "mobile"
type DeviceVisibility string

const (
	VisibilityAll     DeviceVisibility = "all"
	VisibilityDesktop DeviceVisibility = "desktop"
	VisibilityMobile  DeviceVisibility = "mobile"
)

type GuildPageTab struct {
	ID         uuid.UUID        `json:"id"`
	Label      string           `json:"label"`
	Slug       string           `json:"slug"`
	SortOrder  int              `json:"sort_order"`
	Visibility DeviceVisibility `json:"visibility"` // "all", "desktop", or "mobile"
	Panels     []GuildPagePanel `json:"panels"`
}

type GuildPagePanel struct {
	ID         uuid.UUID          `json:"id"`
	PanelType  string             `json:"panel_type"`
	Config     map[string]any     `json:"config"`
	Position   GuildPanelPosition `json:"position"`
	Visibility DeviceVisibility   `json:"visibility"` // "all", "desktop", or "mobile"
}

type GuildPanelPosition struct {
	X int `json:"x"`
	Y int `json:"y"`
	W int `json:"w"`
	H int `json:"h"`
}

// Request types

type UpdateGuildPageRequest struct {
	Theme GuildPageTheme `json:"theme"`
}

type CreateTabRequest struct {
	Label string `json:"label"`
	Slug  string `json:"slug"`
}

type UpdateTabRequest struct {
	Label  string           `json:"label"`
	Panels []GuildPagePanel `json:"panels"`
}

type ReorderTabsRequest struct {
	TabIDs []uuid.UUID `json:"tab_ids"`
}

// Response types

type ListGuildsResponse struct {
	Guilds []GuildInfo `json:"guilds"`
	Total  int         `json:"total"`
}

type AddGuildMemberRequest struct {
	UserID uuid.UUID `json:"user_id"`
}

type UpdateGuildMemberRoleRequest struct {
	Role string `json:"role"` // "member" or "leader"
}
type GuildRosterMember struct {
	UserID   uuid.UUID `json:"user_id"`
	Username string    `json:"username"`
	Roles    []string  `json:"roles"` // "member", "leader", etc.
}


type GuildPageOptionsResponse struct {
	AllowedTags     []GuildTag       `json:"allowed_tags"`
	SocialPlatforms []SocialPlatform `json:"social_platforms"`
}

// Guild Settings

type GuildSettings struct {
	GuildID                uuid.UUID  `json:"guild_id"`
	AllowJoinRequestsUntil *time.Time `json:"allow_join_requests_until"`
	IsMember               bool       `json:"is_member"`
}

type UpdateGuildSettingsRequest struct {
	AllowJoinRequestsUntil *time.Time `json:"allow_join_requests_until"`
}

// Guild Join Requests

type GuildJoinRequest struct {
	ID        uuid.UUID `json:"id"`
	GuildID   uuid.UUID `json:"guild_id"`
	UserID    uuid.UUID `json:"user_id"`
	Username  string    `json:"username"`
	Message   string    `json:"message"`
	CreatedAt time.Time `json:"created_at"`
}

type CreateJoinRequestBody struct {
	Message string `json:"message"`
}

// Guild Speedruns (guild page panels)

// GuildRaidClear is a per-instance clear summary for a guild.
type GuildRaidClear struct {
	InstanceName   string    `json:"instance_name"`
	ClearCount     int64     `json:"clear_count"`
	BestDurationMs int64     `json:"best_duration_ms"`
	AvgDurationMs  int64     `json:"avg_duration_ms"`
	LastClearedAt  time.Time `json:"last_cleared_at"`
}

type GuildRaidClearsResponse struct {
	Clears []GuildRaidClear `json:"clears"`
}

// Guild character roster (guild page "Roster" panel)

// GuildRosterCharacter is a guild character seen in raid logs. LastSeenAt is
// the last time a log updated the character. AvgParse is -1 when the
// character has no parses in the scoring window.
type GuildRosterCharacter struct {
	ID         GUIDString `json:"id"`
	Name       string     `json:"name"`
	Class      string     `json:"class"`
	Race       string     `json:"race"`
	Level      int32      `json:"level"`
	Spec       string     `json:"spec,omitempty"`
	Role       string     `json:"role,omitempty"` // "tank", "heal", or "dps"
	AvgParse   float64    `json:"avg_parse"`
	LastSeenAt time.Time  `json:"last_seen_at"`
	RealmName  string     `json:"realm_name"`
}

type GuildCharacterRosterResponse struct {
	Members []GuildRosterCharacter `json:"members"`
}

// Guild top parses (guild page "Top Parses" panel)

// GuildTopParse is one ranked parse on a guild's top parses board.
// InstanceID/InstanceSlug identify the raid log the parse came from.
type GuildTopParse struct {
	PlayerGUID     string    `json:"player_guid"`
	PlayerName     string    `json:"player_name"`
	PlayerClass    string    `json:"player_class"`
	PlayerSpec     string    `json:"player_spec"`
	PlayerRole     string    `json:"player_role"`
	EncounterName  string    `json:"encounter_name"`
	InstanceID     uuid.UUID `json:"instance_id"`
	InstanceSlug   string    `json:"instance_slug,omitempty"`
	InstanceName   string    `json:"instance_name"`
	DifficultyName string    `json:"difficulty_name"`
	MaxPlayers     int16     `json:"max_players"`
	Metric         string    `json:"metric"`
	MetricValue    float64   `json:"metric_value"`
	DisplayScore   int       `json:"display_score"`
	KilledAt       time.Time `json:"killed_at"`
}

type GuildTopParsesResponse struct {
	Metric string          `json:"metric"`
	Parses []GuildTopParse `json:"parses"`
}

// Guild best runs (guild page "Best Performance" panel)

// GuildBestRun is the guild's best full clear of one instance within the
// requested window — fastest, or highest average parse when ranked by parse.
// AvgParse is -1 when the run has no parses.
type GuildBestRun struct {
	RunID          uuid.UUID `json:"run_id"`
	InstanceID     uuid.UUID `json:"instance_id"`
	InstanceSlug   string    `json:"instance_slug,omitempty"`
	InstanceName   string    `json:"instance_name"`
	DifficultyName string    `json:"difficulty_name"`
	MaxPlayers     int32     `json:"max_players"`
	DurationMs     int64     `json:"duration_ms"`
	CompletedAt    time.Time `json:"completed_at"`
	AvgParse       float64   `json:"avg_parse"`
	ParseCount     int64     `json:"parse_count"`
}

type GuildBestRunsResponse struct {
	Runs []GuildBestRun `json:"runs"`
}

// Guild encounter kills (guild page "Progression" panel)

// GuildEncounterKill aggregates a guild's kills of one encounter across all
// time. Duplicate uploads of the same raid night count once.
type GuildEncounterKill struct {
	InstanceName   string    `json:"instance_name"`
	EncounterName  string    `json:"encounter_name"`
	DifficultyName string    `json:"difficulty_name"`
	MaxPlayers     int32     `json:"max_players"`
	Kills          int32     `json:"kills"`
	FirstKilledAt  time.Time `json:"first_killed_at"`
	LastKilledAt   time.Time `json:"last_killed_at"`
}

type GuildEncounterKillsResponse struct {
	Encounters []GuildEncounterKill `json:"encounters"`
}

// Guild per-run parse averages (guild page "Recent" panel)

// GuildRunEncounterParse is the guild's average parse for one encounter of
// one raid night (run). Encounters are returned in kill order; callers weight
// by ParseCount for a whole-run average. KillDurationMs is the fight length
// of the kill (0 when unknown).
type GuildRunEncounterParse struct {
	RunID          uuid.UUID `json:"run_id"`
	EncounterName  string    `json:"encounter_name"`
	AvgParse       float64   `json:"avg_parse"`
	ParseCount     int64     `json:"parse_count"`
	KilledAt       time.Time `json:"killed_at"`
	KillDurationMs int64     `json:"kill_duration_ms"`
}

type GuildRunParsesResponse struct {
	Encounters []GuildRunEncounterParse `json:"encounters"`
}
