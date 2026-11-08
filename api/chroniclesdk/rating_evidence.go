package chroniclesdk

import (
	"time"

	"github.com/google/uuid"
)

// InstanceRatingEvidenceResponse exposes the persisted raw inputs from one
// canonical raid run that feed the V2 Peak, Mastery, and Renown ratings.
type InstanceRatingEvidenceResponse struct {
	Available                bool                         `json:"available"`
	Reason                   string                       `json:"reason,omitempty"`
	RunID                    uuid.UUID                    `json:"run_id,omitempty"`
	RepresentativeInstanceID uuid.UUID                    `json:"representative_instance_id,omitempty"`
	Player                   InstanceRatingPlayerEvidence `json:"player"`
	Guild                    InstanceRatingGuildEvidence  `json:"guild"`
}

type InstanceRatingPlayerEvidence struct {
	Observations []InstanceRatingPlayerObservation `json:"observations"`
	Renown       []InstanceRatingPlayerRenownFact  `json:"renown"`
}

type InstanceRatingPlayerObservation struct {
	EncounterName     string    `json:"encounter_name"`
	PlayerGUID        string    `json:"player_guid"`
	PlayerName        string    `json:"player_name,omitempty"`
	PlayerClass       string    `json:"player_class"`
	PlayerSpec        string    `json:"player_spec"`
	PlayerSubSpec     string    `json:"player_sub_spec,omitempty"`
	Metric            string    `json:"metric"`
	MetricValue       float64   `json:"metric_value"`
	SourceInstanceID  uuid.UUID `json:"source_instance_id"`
	SourceEncounterID uuid.UUID `json:"source_encounter_id"`
	SourceRankingID   uuid.UUID `json:"source_ranking_id"`
	ProjectionVersion int32     `json:"projection_version"`
	ObservedAt        time.Time `json:"observed_at"`
}

type InstanceRatingPlayerRenownFact struct {
	EncounterName     string    `json:"encounter_name"`
	PlayerGUID        string    `json:"player_guid"`
	PlayerName        string    `json:"player_name,omitempty"`
	SourceInstanceID  uuid.UUID `json:"source_instance_id"`
	SourceEncounterID uuid.UUID `json:"source_encounter_id"`
	ProjectionVersion int32     `json:"projection_version"`
	ObservedAt        time.Time `json:"observed_at"`
}

type InstanceRatingGuildEvidence struct {
	BossTimes  []InstanceRatingGuildBossObservation  `json:"boss_times"`
	ClearTimes []InstanceRatingGuildClearObservation `json:"clear_times"`
	Renown     []InstanceRatingGuildRenownFact       `json:"renown"`
}

type InstanceRatingGuildBossObservation struct {
	EncounterName          string    `json:"encounter_name"`
	GuildID                uuid.UUID `json:"guild_id"`
	GuildName              string    `json:"guild_name,omitempty"`
	DurationMs             int64     `json:"duration_ms"`
	SourceInstanceID       uuid.UUID `json:"source_instance_id"`
	SourceEncounterID      uuid.UUID `json:"source_encounter_id"`
	SourceTimeParseScoreID uuid.UUID `json:"source_time_parse_score_id"`
	ProjectionVersion      int32     `json:"projection_version"`
	ObservedAt             time.Time `json:"observed_at"`
}

type InstanceRatingGuildClearObservation struct {
	GuildID                uuid.UUID `json:"guild_id"`
	GuildName              string    `json:"guild_name,omitempty"`
	DurationMs             int64     `json:"duration_ms"`
	SourceInstanceID       uuid.UUID `json:"source_instance_id"`
	SourceTimeParseScoreID uuid.UUID `json:"source_time_parse_score_id"`
	ProjectionVersion      int32     `json:"projection_version"`
	ObservedAt             time.Time `json:"observed_at"`
}

type InstanceRatingGuildRenownFact struct {
	EncounterName     string    `json:"encounter_name"`
	GuildID           uuid.UUID `json:"guild_id"`
	GuildName         string    `json:"guild_name,omitempty"`
	SourceInstanceID  uuid.UUID `json:"source_instance_id"`
	SourceEncounterID uuid.UUID `json:"source_encounter_id"`
	ProjectionVersion int32     `json:"projection_version"`
	ObservedAt        time.Time `json:"observed_at"`
}
