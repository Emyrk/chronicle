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

func TestGetInstanceBySlugNotFound(t *testing.T) {
	t.Parallel()

	service := &Service{db: &fakeExternalAPIStore{instanceErr: pgx.ErrNoRows}}
	service.setupRoutes()

	req := httptest.NewRequest(http.MethodGet, "/raidlogs/instances/missing", nil)
	rec := httptest.NewRecorder()
	service.ServeHTTP(rec, req)

	require.Equal(t, http.StatusNotFound, rec.Code)
}
