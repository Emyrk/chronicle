package serviceexternalapi

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/database"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/stretchr/testify/require"
)

func TestGetInstanceBySlugCompactsHostilePeriods(t *testing.T) {
	t.Parallel()

	instanceID := uuid.New()
	encounterID := uuid.New()
	start := time.Date(2026, time.August, 30, 12, 0, 0, 0, time.UTC)
	end := start.Add(5 * time.Minute)
	store := &fakeExternalAPIStore{
		instance: database.LogInstancesGuild{
			ID: instanceID, RealmID: uuid.New(), LogGroupID: uuid.New(),
			Name: "Molten Core", HashedSlug: pgtype.Text{String: "example-instance", Valid: true},
			RealmName: "Example Realm", DifficultyName: "Normal", MaxPlayers: 40,
		},
		encounters: []database.LogInstanceEncounter{{
			ID: encounterID, InstanceID: instanceID, Name: "Ragnaros", Boss: true,
			StartTime: pgtype.Timestamptz{Time: start, Valid: true},
			EndTime:   pgtype.Timestamptz{Time: end, Valid: true},
			KillType:  database.KillTypeClean,
		}},
		hostiles: []database.LogInstanceEncounterHostile{{
			EncounterID: encounterID, ID: guid.GUID(1234), Boss: true,
			Periods: database.Periods{{
				Start:      &database.PeriodMoment{Timestamp: start, Reason: "combat start", MessageType: "SPELL_DAMAGE", Message: json.RawMessage(`{"secret":"large parser payload"}`)},
				End:        &database.PeriodMoment{Timestamp: end, Reason: "unit slain"},
				LastActive: &database.PeriodMoment{Timestamp: end.Add(-time.Second), Reason: "damage"},
				EndState:   database.EndStateSlain,
			}},
		}},
	}
	service := &Service{db: store}
	service.setupRoutes()

	req := httptest.NewRequest(http.MethodGet, "/raidlogs/instances/example-instance", nil)
	rec := httptest.NewRecorder()
	service.ServeHTTP(rec, req)

	require.Equal(t, http.StatusOK, rec.Code)
	require.Equal(t, pgtype.Text{String: "example-instance", Valid: true}, store.instanceSlug)

	body := rec.Body.Bytes()
	var response InstanceResponse
	require.NoError(t, json.Unmarshal(body, &response))
	require.Equal(t, "example-instance", response.Slug)
	require.Len(t, response.Encounters, 1)
	require.Len(t, response.Encounters[0].Hostiles, 1)
	require.Len(t, response.Encounters[0].Hostiles[0].Periods, 1)
	period := response.Encounters[0].Hostiles[0].Periods[0]
	require.Equal(t, start, *period.Start)
	require.Equal(t, end, *period.End)
	require.Equal(t, end.Add(-time.Second), *period.LastActive)
	require.Equal(t, "slain", string(period.EndState))

	require.NotContains(t, string(body), "combat start")
	require.NotContains(t, string(body), "SPELL_DAMAGE")
	require.NotContains(t, string(body), "large parser payload")
}

func TestGetInstanceRankingRecordsBySlug(t *testing.T) {
	t.Parallel()

	instanceID := uuid.New()
	encounterID := uuid.New()
	recordID := uuid.New()
	killedAt := time.Date(2026, time.August, 30, 12, 0, 0, 0, time.UTC)
	store := &fakeExternalAPIStore{
		instance: database.LogInstancesGuild{
			ID: instanceID, HashedSlug: pgtype.Text{String: "example-instance", Valid: true},
		},
		rankingRecords: []database.EncounterDpsRanking{{
			ID:            recordID,
			EncounterID:   uuid.NullUUID{UUID: encounterID, Valid: true},
			InstanceID:    instanceID,
			EncounterName: "Ragnaros",
			PlayerGuid:    "Player-00000001",
			PlayerName:    "Example",
			PlayerClass:   "WARRIOR",
			PlayerSpec:    "Fury",
			PlayerRole:    "dps",
			PlayerLevel:   60,
			DamageDone:    123456,
			HealingDone:   789,
			AbsorbedDone:  100,
			DurationSecs:  120.5,
			Dps:           1024.53,
			Hps:           6.55,
			LogHashedSlug: "example-log",
			KilledAt:      pgtype.Timestamptz{Time: killedAt, Valid: true},
		}},
	}
	store.parseScores = []database.ParseScoreResult{
		{
			InstanceID: instanceID, SnapshotID: uuid.NullUUID{UUID: uuid.New(), Valid: true},
			EncounterName: "Ragnaros", PlayerGuid: "Player-00000001", Metric: "dps",
			MetricValue: 1024.53, PreciseScore: 91.72, DisplayScore: 92,
			Rank: 18, SampleSize: 842, Status: "ok",
			CreatedAt: pgtype.Timestamptz{Time: killedAt.Add(time.Minute), Valid: true},
		},
		{
			InstanceID: instanceID, SnapshotID: uuid.NullUUID{UUID: uuid.New(), Valid: true},
			EncounterName: "Ragnaros", PlayerGuid: "Player-00000001", Metric: "hps",
			MetricValue: 6.55, PreciseScore: 24.11, DisplayScore: 24,
			Rank: 638, SampleSize: 842, Status: "low_confidence",
			CreatedAt: pgtype.Timestamptz{Time: killedAt.Add(time.Minute), Valid: true},
		},
	}
	service := &Service{db: store}
	service.setupRoutes()

	req := httptest.NewRequest(http.MethodGet, "/raidlogs/instances/"+instanceID.String()+"/ranking-records", nil)
	rec := httptest.NewRecorder()
	service.ServeHTTP(rec, req)

	require.Equal(t, http.StatusOK, rec.Code)
	require.Equal(t, instanceID, store.instanceID)
	require.False(t, store.instanceSlug.Valid)
	require.Equal(t, instanceID, store.rankingInstanceID)
	require.Equal(t, instanceID, store.parseScoresInstanceID)

	var response []InstanceRankingRecord
	require.NoError(t, json.NewDecoder(rec.Body).Decode(&response))
	require.Len(t, response, 1)
	require.Equal(t, recordID, response[0].ID)
	require.Equal(t, encounterID, *response[0].EncounterID)
	require.Equal(t, "Ragnaros", response[0].EncounterName)
	require.Equal(t, 1024.53, response[0].DPS)
	require.Equal(t, 6.55, response[0].HPS)
	require.Equal(t, killedAt, response[0].KilledAt)
	require.NotNil(t, response[0].DPSParse)
	require.Equal(t, 91.72, response[0].DPSParse.PreciseScore)
	require.Equal(t, 92, response[0].DPSParse.DisplayScore)
	require.Equal(t, "ok", response[0].DPSParse.Status)
	require.NotNil(t, response[0].HPSParse)
	require.Equal(t, 24.11, response[0].HPSParse.PreciseScore)
	require.Equal(t, 24, response[0].HPSParse.DisplayScore)
	require.Equal(t, "low_confidence", response[0].HPSParse.Status)
}

func TestGetInstanceBySlugNotFound(t *testing.T) {
	t.Parallel()

	service := &Service{db: &fakeExternalAPIStore{instanceErr: pgx.ErrNoRows}}
	service.setupRoutes()

	req := httptest.NewRequest(http.MethodGet, "/raidlogs/instances/missing", nil)
	rec := httptest.NewRecorder()
	service.ServeHTTP(rec, req)

	require.Equal(t, http.StatusNotFound, rec.Code)
}
