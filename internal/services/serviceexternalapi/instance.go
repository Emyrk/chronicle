package serviceexternalapi

import (
	"errors"
	"net/http"
	"time"

	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/api/db2sdk"
	"github.com/Emyrk/chronicle/api/httpapi"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/database"
	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
)

type InstanceResponse struct {
	chroniclesdk.WoWInstance
	RealmName  string                                    `json:"realm_name,omitempty"`
	Encounters []InstanceEncounter                       `json:"encounters"`
	Units      map[guid.GUID]chroniclesdk.InstanceUnit   `json:"units"`
	Players    map[guid.GUID]chroniclesdk.InstancePlayer `json:"players"`
}

type InstanceEncounter struct {
	chroniclesdk.WoWEncounter
	Hostiles []InstanceHostile                `json:"hostiles"`
	Phases   []chroniclesdk.WoWEncounterPhase `json:"phases,omitempty"`
}

type InstanceHostile struct {
	ID      guid.GUID               `json:"id"`
	Boss    bool                    `json:"boss"`
	Periods []InstanceHostilePeriod `json:"periods"`
}

// InstanceHostilePeriod retains the useful activity window while omitting
// parser-specific reasons, message types, and raw messages from the public API.
type InstanceHostilePeriod struct {
	Start      *time.Time            `json:"start,omitempty"`
	End        *time.Time            `json:"end,omitempty"`
	LastActive *time.Time            `json:"last_active,omitempty"`
	EndState   chroniclesdk.EndState `json:"end_state,omitempty"`
}

type InstanceRankingRecord struct {
	chroniclesdk.InstanceRankingRecord
	DPSParse *InstanceRankingParse `json:"dps_parse,omitempty"`
	HPSParse *InstanceRankingParse `json:"hps_parse,omitempty"`
}

type InstanceRankingParse struct {
	SnapshotID   *uuid.UUID `json:"snapshot_id,omitempty"`
	MetricValue  float64    `json:"metric_value"`
	PreciseScore float64    `json:"precise_score"`
	DisplayScore int        `json:"display_score"`
	Rank         int        `json:"rank"`
	SampleSize   int        `json:"sample_size"`
	Status       string     `json:"status"`
}

type instanceRankingParseKey struct {
	EncounterName string
	PlayerGUID    string
	Metric        string
}

type instanceRankingParseValue struct {
	parse     InstanceRankingParse
	createdAt time.Time
}

func (s *Service) instanceByIdentifier(r *http.Request) (database.LogInstancesGuild, error) {
	identifier := chi.URLParam(r, "instance_id")
	if instanceID, err := uuid.Parse(identifier); err == nil {
		return s.db.Instance(r.Context(), instanceID)
	}
	return s.db.InstanceBySlug(r.Context(), pgtype.Text{String: identifier, Valid: identifier != ""})
}

func (s *Service) getInstanceBySlug(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	instance, err := s.instanceByIdentifier(r)
	if errors.Is(err, pgx.ErrNoRows) {
		writeNotFound(w, r, "Instance not found")
		return
	}
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}

	encounters, err := s.db.EncountersByInstanceID(ctx, instance.ID)
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}
	units, err := s.db.InstanceUnitsByInstanceID(ctx, instance.ID)
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}
	players, err := s.db.InstancePlayersByInstanceID(ctx, instance.ID)
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}
	hostiles, err := s.db.GetInstanceEncounterCharacterFights(ctx, instance.ID)
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}
	phases, err := s.db.GetEncounterPhasesByInstanceID(ctx, instance.ID)
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}

	decorated := db2sdk.WowDecoratedInstance(instance, units, players, encounters, hostiles, phases)
	response := InstanceResponse{
		WoWInstance: decorated.WoWInstance,
		RealmName:   decorated.RealmName,
		Encounters:  compactInstanceEncounters(decorated.Encounters),
		Units:       decorated.Units,
		Players:     decorated.Players,
	}
	httpapi.Write(ctx, w, http.StatusOK, response)
}

func (s *Service) getInstanceRankingRecordsBySlug(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	instance, err := s.instanceByIdentifier(r)
	if errors.Is(err, pgx.ErrNoRows) {
		writeNotFound(w, r, "Instance not found")
		return
	}
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}

	records, err := s.db.InstanceRankingRecords(ctx, instance.ID)
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}
	parseScores, err := s.db.GetParseScoreResultsForInstance(ctx, instance.ID)
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}

	httpapi.Write(ctx, w, http.StatusOK, instanceRankingRecords(records, parseScores))
}

func instanceRankingRecords(records []database.EncounterDpsRanking, parseScores []database.ParseScoreResult) []InstanceRankingRecord {
	parses := make(map[instanceRankingParseKey]instanceRankingParseValue, len(parseScores))
	for _, score := range parseScores {
		key := instanceRankingParseKey{
			EncounterName: score.EncounterName,
			PlayerGUID:    score.PlayerGuid,
			Metric:        score.Metric,
		}
		createdAt := score.CreatedAt.Time
		if existing, ok := parses[key]; ok && !createdAt.After(existing.createdAt) {
			continue
		}

		var snapshotID *uuid.UUID
		if score.SnapshotID.Valid {
			id := score.SnapshotID.UUID
			snapshotID = &id
		}
		parses[key] = instanceRankingParseValue{
			parse: InstanceRankingParse{
				SnapshotID:   snapshotID,
				MetricValue:  score.MetricValue,
				PreciseScore: score.PreciseScore,
				DisplayScore: int(score.DisplayScore),
				Rank:         int(score.Rank),
				SampleSize:   int(score.SampleSize),
				Status:       score.Status,
			},
			createdAt: createdAt,
		}
	}

	baseRecords := db2sdk.InstanceRankingRecords(records)
	result := make([]InstanceRankingRecord, 0, len(baseRecords))
	for _, record := range baseRecords {
		out := InstanceRankingRecord{InstanceRankingRecord: record}
		if score, ok := parses[instanceRankingParseKey{
			EncounterName: record.EncounterName,
			PlayerGUID:    record.PlayerGUID,
			Metric:        "dps",
		}]; ok {
			parse := score.parse
			out.DPSParse = &parse
		}
		if score, ok := parses[instanceRankingParseKey{
			EncounterName: record.EncounterName,
			PlayerGUID:    record.PlayerGUID,
			Metric:        "hps",
		}]; ok {
			parse := score.parse
			out.HPSParse = &parse
		}
		result = append(result, out)
	}
	return result
}

func compactInstanceEncounters(encounters []chroniclesdk.WoWEncounterWithHostiles) []InstanceEncounter {
	result := make([]InstanceEncounter, 0, len(encounters))
	for _, encounter := range encounters {
		compacted := InstanceEncounter{
			WoWEncounter: encounter.WoWEncounter,
			Hostiles:     make([]InstanceHostile, 0, len(encounter.Hostiles)),
			Phases:       encounter.Phases,
		}
		for _, hostile := range encounter.Hostiles {
			periods := make([]InstanceHostilePeriod, 0, len(hostile.Periods))
			for _, period := range hostile.Periods {
				periods = append(periods, InstanceHostilePeriod{
					Start:      periodTimestamp(period.Start),
					End:        periodTimestamp(period.End),
					LastActive: periodTimestamp(period.LastActive),
					EndState:   period.EndState,
				})
			}
			compacted.Hostiles = append(compacted.Hostiles, InstanceHostile{
				ID: hostile.ID, Boss: hostile.Boss, Periods: periods,
			})
		}
		result = append(result, compacted)
	}
	return result
}

func periodTimestamp(moment *chroniclesdk.PeriodMoment) *time.Time {
	if moment == nil {
		return nil
	}
	return &moment.Timestamp
}
