package serviceexternalapi

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/Emyrk/chronicle/database"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/stretchr/testify/require"
)

func TestGetInstanceEventsBySlug(t *testing.T) {
	t.Parallel()

	instanceID := uuid.New()
	payload := []byte{0x1f, 0x8b, 0x08, 0x00, 0x01, 0x02, 0x03}
	store := &fakeExternalAPIStore{
		instance: database.LogInstancesGuild{
			ID:         instanceID,
			HashedSlug: pgtype.Text{String: "example-instance", Valid: true},
		},
		event: database.LogInstanceEvent{
			InstanceID: instanceID,
			Type:       database.LogInstanceEventTypeDamage,
			Events:     payload,
		},
	}
	service := &Service{db: store}
	service.setupRoutes()

	req := httptest.NewRequest(http.MethodGet, "/raidlogs/instances/example-instance/events/damage", nil)
	rec := httptest.NewRecorder()
	service.ServeHTTP(rec, req)

	require.Equal(t, http.StatusOK, rec.Code)
	require.Equal(t, "application/octet-stream", rec.Header().Get("Content-Type"))
	require.Equal(t, payload, rec.Body.Bytes())
	require.Equal(t, pgtype.Text{String: "example-instance", Valid: true}, store.instanceSlug)
	require.Equal(t, database.InstanceEventParams{InstanceID: instanceID, Type: "damage"}, store.eventParams)
}

func TestGetInstanceEventsBySlugRejectsInvalidType(t *testing.T) {
	t.Parallel()

	service := &Service{db: &fakeExternalAPIStore{}}
	service.setupRoutes()

	req := httptest.NewRequest(http.MethodGet, "/raidlogs/instances/example-instance/events/not-a-stream", nil)
	rec := httptest.NewRecorder()
	service.ServeHTTP(rec, req)

	require.Equal(t, http.StatusBadRequest, rec.Code)
}

func TestGetInstanceEventsBySlugNotFound(t *testing.T) {
	t.Parallel()

	service := &Service{db: &fakeExternalAPIStore{
		instance: database.LogInstancesGuild{ID: uuid.New()},
		eventErr: pgx.ErrNoRows,
	}}
	service.setupRoutes()

	req := httptest.NewRequest(http.MethodGet, "/raidlogs/instances/example-instance/events/damage", nil)
	rec := httptest.NewRecorder()
	service.ServeHTTP(rec, req)

	require.Equal(t, http.StatusNotFound, rec.Code)
}
