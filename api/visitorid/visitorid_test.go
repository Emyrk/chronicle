package visitorid

import (
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestEnsure(t *testing.T) {
	t.Parallel()

	t.Run("creates and reuses visitor cookie", func(t *testing.T) {
		t.Parallel()

		firstRequest := httptest.NewRequest("GET", "http://example.com/g/guild", nil)
		firstResponse := httptest.NewRecorder()
		firstID := Ensure(firstResponse, firstRequest)

		cookies := firstResponse.Result().Cookies()
		require.Len(t, cookies, 1)
		require.Equal(t, CookieName, cookies[0].Name)
		require.True(t, cookies[0].HttpOnly)
		require.False(t, cookies[0].Secure)

		secondRequest := httptest.NewRequest("GET", "http://example.com/g/guild", nil)
		secondRequest.AddCookie(cookies[0])
		secondResponse := httptest.NewRecorder()
		secondID := Ensure(secondResponse, secondRequest)

		require.Equal(t, firstID, secondID)
		require.Empty(t, secondResponse.Result().Cookies())
	})

	t.Run("marks proxy HTTPS cookies secure", func(t *testing.T) {
		t.Parallel()

		request := httptest.NewRequest("GET", "http://example.com/g/guild", nil)
		request.Header.Set("X-Forwarded-Proto", "https")
		response := httptest.NewRecorder()
		Ensure(response, request)

		cookies := response.Result().Cookies()
		require.Len(t, cookies, 1)
		require.True(t, cookies[0].Secure)
	})
}
