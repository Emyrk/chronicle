package servicerankings

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/internal/services/servicetenant"
	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

type ratingEvidenceStore struct {
	run          database.GetInstanceRatingEvidenceRunRow
	players      []database.ListInstanceRatingPlayerObservationsRow
	playerRenown []database.ListInstanceRatingPlayerRenownFactsRow
	guildBosses  []database.ListInstanceRatingGuildBossObservationsRow
	guildClears  []database.ListInstanceRatingGuildClearObservationsRow
	guildRenown  []database.ListInstanceRatingGuildRenownFactsRow
}

func (s ratingEvidenceStore) GetInstanceRatingEvidenceRun(context.Context, database.GetInstanceRatingEvidenceRunParams) (database.GetInstanceRatingEvidenceRunRow, error) {
	return s.run, nil
}
func (s ratingEvidenceStore) ListInstanceRatingPlayerObservations(context.Context, database.ListInstanceRatingPlayerObservationsParams) ([]database.ListInstanceRatingPlayerObservationsRow, error) {
	return s.players, nil
}
func (s ratingEvidenceStore) ListInstanceRatingPlayerRenownFacts(context.Context, database.ListInstanceRatingPlayerRenownFactsParams) ([]database.ListInstanceRatingPlayerRenownFactsRow, error) {
	return s.playerRenown, nil
}
func (s ratingEvidenceStore) ListInstanceRatingGuildBossObservations(context.Context, database.ListInstanceRatingGuildBossObservationsParams) ([]database.ListInstanceRatingGuildBossObservationsRow, error) {
	return s.guildBosses, nil
}
func (s ratingEvidenceStore) ListInstanceRatingGuildClearObservations(context.Context, database.ListInstanceRatingGuildClearObservationsParams) ([]database.ListInstanceRatingGuildClearObservationsRow, error) {
	return s.guildClears, nil
}
func (s ratingEvidenceStore) ListInstanceRatingGuildRenownFacts(context.Context, database.ListInstanceRatingGuildRenownFactsParams) ([]database.ListInstanceRatingGuildRenownFactsRow, error) {
	return s.guildRenown, nil
}

func requestRatingEvidence(t *testing.T, store ratingEvidenceQuerier, instanceID uuid.UUID) (int, chroniclesdk.InstanceRatingEvidenceResponse) {
	t.Helper()
	router := chi.NewRouter()
	router.Get("/instances/{instanceID}/rating-evidence", func(w http.ResponseWriter, r *http.Request) {
		handleInstanceRatingEvidenceWithStore(store, w, r)
	})
	request := httptest.NewRequest(http.MethodGet, "/instances/"+instanceID.String()+"/rating-evidence", nil)
	request = request.WithContext(servicetenant.WithTenantID(request.Context(), uuid.New()))
	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, request)

	var response chroniclesdk.InstanceRatingEvidenceResponse
	require.NoError(t, json.Unmarshal(recorder.Body.Bytes(), &response))
	return recorder.Code, response
}

func TestHandleInstanceRatingEvidenceReturnsAllPersistedInputs(t *testing.T) {
	t.Parallel()
	runID := uuid.New()
	representativeID := uuid.New()
	sourceInstanceID := uuid.New()
	sourceEncounterID := uuid.New()
	guildID := uuid.New()
	observedAt := time.Date(2026, 11, 8, 12, 0, 0, 0, time.UTC)
	store := ratingEvidenceStore{
		run: database.GetInstanceRatingEvidenceRunRow{
			RunID: runID, RepresentativeInstanceID: uuid.NullUUID{UUID: representativeID, Valid: true},
		},
		players: []database.ListInstanceRatingPlayerObservationsRow{{
			EncounterName: "Ragnaros", PlayerGuid: "Player-1", PlayerName: "Aegwynn",
			PlayerClass: "MAGE", PlayerSpec: "Fire", Metric: "dps", MetricValue: 1234.5,
			SourceInstanceID: sourceInstanceID, SourceEncounterID: sourceEncounterID,
			SourceRankingID: uuid.New(), ProjectionVersion: 1,
			ObservedAt: pgtype.Timestamptz{Time: observedAt, Valid: true},
		}},
		playerRenown: []database.ListInstanceRatingPlayerRenownFactsRow{{
			EncounterName: "Ragnaros", PlayerGuid: "Player-1", PlayerName: "Aegwynn",
			SourceInstanceID: sourceInstanceID, SourceEncounterID: sourceEncounterID,
			ProjectionVersion: 1, ObservedAt: pgtype.Timestamptz{Time: observedAt, Valid: true},
		}},
		guildBosses: []database.ListInstanceRatingGuildBossObservationsRow{{
			EncounterName: "Ragnaros", GuildID: guildID, GuildName: "Example Guild", DurationMs: 90500,
			SourceInstanceID: sourceInstanceID, SourceEncounterID: sourceEncounterID,
			SourceTimeParseScoreID: uuid.New(), ProjectionVersion: 1,
			ObservedAt: pgtype.Timestamptz{Time: observedAt, Valid: true},
		}},
		guildClears: []database.ListInstanceRatingGuildClearObservationsRow{{
			GuildID: guildID, GuildName: "Example Guild", DurationMs: 3600000,
			SourceInstanceID: sourceInstanceID, SourceTimeParseScoreID: uuid.New(),
			ProjectionVersion: 1, ObservedAt: pgtype.Timestamptz{Time: observedAt, Valid: true},
		}},
		guildRenown: []database.ListInstanceRatingGuildRenownFactsRow{{
			EncounterName: "Ragnaros", GuildID: guildID, GuildName: "Example Guild",
			SourceInstanceID: sourceInstanceID, SourceEncounterID: sourceEncounterID,
			ProjectionVersion: 1, ObservedAt: pgtype.Timestamptz{Time: observedAt, Valid: true},
		}},
	}

	status, response := requestRatingEvidence(t, store, uuid.New())
	require.Equal(t, http.StatusOK, status)
	assert.True(t, response.Available)
	assert.Equal(t, runID, response.RunID)
	assert.Equal(t, representativeID, response.RepresentativeInstanceID)
	require.Len(t, response.Player.Observations, 1)
	assert.Equal(t, "dps", response.Player.Observations[0].Metric)
	assert.Equal(t, 1234.5, response.Player.Observations[0].MetricValue)
	require.Len(t, response.Player.Renown, 1)
	require.Len(t, response.Guild.BossTimes, 1)
	require.Len(t, response.Guild.ClearTimes, 1)
	require.Len(t, response.Guild.Renown, 1)
}

func TestHandleInstanceRatingEvidenceUnavailableStates(t *testing.T) {
	t.Parallel()
	for _, testCase := range []struct {
		name   string
		store  ratingEvidenceStore
		reason string
	}{
		{name: "invalid", store: ratingEvidenceStore{run: database.GetInstanceRatingEvidenceRunRow{Invalidated: true}}, reason: "invalid"},
		{name: "not projected", store: ratingEvidenceStore{run: database.GetInstanceRatingEvidenceRunRow{RunID: uuid.New()}}, reason: "not_projected"},
		{name: "no evidence", store: ratingEvidenceStore{run: database.GetInstanceRatingEvidenceRunRow{RunID: uuid.New(), RepresentativeInstanceID: uuid.NullUUID{UUID: uuid.New(), Valid: true}}}, reason: "no_evidence"},
	} {
		t.Run(testCase.name, func(t *testing.T) {
			t.Parallel()
			status, response := requestRatingEvidence(t, testCase.store, uuid.New())
			assert.Equal(t, http.StatusOK, status)
			assert.False(t, response.Available)
			assert.Equal(t, testCase.reason, response.Reason)
			assert.Empty(t, response.Player.Observations)
			assert.Empty(t, response.Guild.BossTimes)
		})
	}
}
