package api

import (
	"context"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/internal/services/serviceeventrepair"
	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

func TestEventRepairErrors(t *testing.T) {
	t.Parallel()
	for _, tc := range []struct {
		name   string
		err    error
		status int
	}{
		{"invalid", serviceeventrepair.ErrInvalid, http.StatusBadRequest},
		{"conflict", serviceeventrepair.ErrConflict, http.StatusConflict},
		{"not found", serviceeventrepair.ErrNotFound, http.StatusNotFound},
	} {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			recorder := httptest.NewRecorder()
			writeEventRepairError(recorder, httptest.NewRequest(http.MethodGet, "/", nil), fmt.Errorf("wrapped: %w", tc.err))
			require.Equal(t, tc.status, recorder.Code)
		})
	}
}

func TestEventRepairID(t *testing.T) {
	t.Parallel()
	id := uuid.New()
	for _, value := range []string{id.String(), "invalid"} {
		t.Run(value, func(t *testing.T) {
			t.Parallel()
			request := httptest.NewRequest(http.MethodGet, "/", nil)
			route := chi.NewRouteContext()
			route.URLParams.Add("operationID", value)
			request = request.WithContext(context.WithValue(request.Context(), chi.RouteCtxKey, route))
			recorder := httptest.NewRecorder()
			got, ok := eventRepairID(recorder, request)
			if value == "invalid" {
				require.False(t, ok)
				require.Equal(t, http.StatusBadRequest, recorder.Code)
			} else {
				require.True(t, ok)
				require.Equal(t, id, got)
			}
		})
	}
}

func TestEventRepairConversion(t *testing.T) {
	t.Parallel()
	request := chroniclesdk.CreateEventRepairRequest{Operation: "repair", Instance: "instance", TenantID: uuid.New(), RealmID: uuid.New(), Limit: 10}
	operation := serviceeventrepair.Operation{ID: uuid.New(), Selection: eventRepairRequest(request), Items: []serviceeventrepair.Item{{InstanceID: uuid.New(), Changes: []string{"change"}}}}
	result := eventRepairOperation(operation)
	require.Equal(t, request, result.Selection)
	require.Equal(t, operation.ID, result.ID)
	require.Equal(t, operation.Items[0].InstanceID, result.Items[0].InstanceID)
	require.Equal(t, []string{"change"}, result.Items[0].Changes)
	result.Items[0].Changes[0] = "mutated"
	require.Equal(t, "change", operation.Items[0].Changes[0])
	require.NotNil(t, eventRepairOperation(serviceeventrepair.Operation{}).Items)
}
