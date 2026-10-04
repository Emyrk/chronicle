package api

import (
	"net/http"
	"net/http/httptest"
	"net/url"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestAdsTxtHandler(t *testing.T) {
	t.Parallel()

	t.Run("disabled", func(t *testing.T) {
		t.Parallel()

		recorder := httptest.NewRecorder()
		adsTxtHandler(nil).ServeHTTP(recorder, httptest.NewRequest(http.MethodGet, "/ads.txt", nil))

		require.Equal(t, http.StatusNotFound, recorder.Code)
	})

	t.Run("redirects to canonical file", func(t *testing.T) {
		t.Parallel()

		canonicalURL, err := url.Parse("https://chronicleclassic.com/ads.txt")
		require.NoError(t, err)

		recorder := httptest.NewRecorder()
		adsTxtHandler(canonicalURL).ServeHTTP(recorder, httptest.NewRequest(http.MethodGet, "/ads.txt", nil))

		require.Equal(t, http.StatusTemporaryRedirect, recorder.Code)
		require.Equal(t, canonicalURL.String(), recorder.Header().Get("Location"))
	})
}
