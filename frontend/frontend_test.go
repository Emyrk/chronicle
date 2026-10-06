package frontend

import (
	"net/http"
	"net/http/httptest"
	"os"
	"testing"
	"testing/fstest"

	"github.com/stretchr/testify/require"
)

func TestHandlerAdSenseVerificationMetadata(t *testing.T) {
	t.Parallel()

	indexHTML, err := os.ReadFile("chronicle/index.html")
	require.NoError(t, err)
	siteFS := fstest.MapFS{
		"index.html": &fstest.MapFile{Data: indexHTML},
	}

	tests := []struct {
		name       string
		clientID   string
		shouldEmit bool
	}{
		{name: "enabled", clientID: "ca-pub-8208259743822818", shouldEmit: true},
		{name: "disabled", shouldEmit: false},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			t.Parallel()

			handler := Handler(siteFS, nil, func(_ *http.Request) *HTMLBranding {
				if test.clientID == "" {
					return nil
				}
				return &HTMLBranding{AdSenseClientID: test.clientID}
			})
			recorder := httptest.NewRecorder()
			handler.ServeHTTP(recorder, httptest.NewRequest(http.MethodGet, "/", nil))

			if test.shouldEmit {
				require.Contains(t, recorder.Body.String(), `name="google-adsense-account" content="ca-pub-8208259743822818"`)
			} else {
				require.NotContains(t, recorder.Body.String(), "google-adsense-account")
			}
		})
	}
}
