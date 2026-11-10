package httpapi

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

func TestHandleResponseErrorPreservesCleanup(t *testing.T) {
	t.Parallel()
	for _, typed := range []bool{false, true} {
		name := "default"
		if typed {
			name = "typed"
		}
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			report := &chroniclesdk.RawLogCleanup{DeletedLogIDs: []uuid.UUID{uuid.New()}}
			err := errors.New("upload failed")
			status := http.StatusInternalServerError
			if typed {
				err = NewAPIError(err, "quota exceeded", http.StatusBadRequest)
				status = http.StatusBadRequest
			}
			rec := httptest.NewRecorder()
			HandleResponseError(context.Background(), rec, err, APIError{Response: chroniclesdk.Response{Message: "upload failed", Cleanup: report}})
			require.Equal(t, status, rec.Code)
			var response chroniclesdk.Response
			require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &response))
			require.Equal(t, report, response.Cleanup)
		})
	}
}
