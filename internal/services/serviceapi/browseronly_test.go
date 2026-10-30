package serviceapi

import (
	"net/http"
	"net/http/httptest"
	"net/url"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestOAuthBrowserOnlyMiddleware(t *testing.T) {
	t.Parallel()

	accessURL, err := url.Parse("https://legacy.chronicleclassic.com")
	require.NoError(t, err)

	handler := oauthBrowserOnlyMiddleware(accessURL)(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))

	for _, testCase := range []struct {
		name       string
		method     string
		path       string
		wantStatus int
	}{
		{name: "device approval navigation", method: http.MethodGet, path: oauthDeviceApprovalPath, wantStatus: http.StatusOK},
		{name: "device approval submission", method: http.MethodPost, path: oauthDeviceApprovalPath, wantStatus: http.StatusForbidden},
		{name: "unrelated cross-site navigation", method: http.MethodGet, path: "/oauth/token", wantStatus: http.StatusForbidden},
	} {
		t.Run(testCase.name, func(t *testing.T) {
			t.Parallel()

			req := httptest.NewRequest(testCase.method, testCase.path, nil)
			req.Header.Set("Sec-Fetch-Site", "cross-site")
			rec := httptest.NewRecorder()
			handler.ServeHTTP(rec, req)

			require.Equal(t, testCase.wantStatus, rec.Code)
		})
	}
}
