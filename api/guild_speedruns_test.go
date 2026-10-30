package api

import (
	"context"
	"net/http"
	"net/http/httptest"
	"net/url"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestOptionalInt32QueryAllowsZero(t *testing.T) {
	t.Parallel()

	recorder := httptest.NewRecorder()
	value, present, ok := optionalInt32Query(
		context.Background(),
		recorder,
		url.Values{"max_players": {"0"}},
		"max_players",
		true,
	)

	require.True(t, ok)
	require.True(t, present)
	require.Zero(t, value)
	require.Equal(t, http.StatusOK, recorder.Code)
}
