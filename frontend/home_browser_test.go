package frontend

import (
	"net/http"
	"net/http/httptest"
	"os"
	"os/exec"
	"testing"

	"github.com/stretchr/testify/require"
)

// Opt-in integration test against built assets and a real Chromium installation.
// pnpm build; CHRONICLE_HOME_BROWSER_TEST=1 go test ./frontend -run TestHomeBrowserHydration -count=1
// Set CHROMIUM_PATH to an installed browser, or install Playwright Chromium.
func TestHomeBrowserHydration(t *testing.T) {
	t.Parallel()
	if os.Getenv("CHRONICLE_HOME_BROWSER_TEST") != "1" {
		t.Skip("requires built frontend and Chromium")
	}
	server := httptest.NewServer(Handler(os.DirFS("chronicle/dist"), nil, func(r *http.Request) *HTMLBranding {
		config := &HomeConfig{}
		switch r.URL.Query().Get("variant") {
		case "epoch", "warmane":
			config.Flavor = []string{r.URL.Query().Get("variant")}
		case "forever":
			config.Flavor = []string{"wow-forever"}
			config.ForeverLandingEnabled = true
		case "forever-disabled":
			config.Flavor = []string{"wow-forever"}
		}
		return &HTMLBranding{Home: config}
	}, nil))
	t.Cleanup(server.Close)
	command := exec.CommandContext(t.Context(), "node", "chronicle/scripts/verify-home-hydration.mjs", server.URL)
	output, err := command.CombinedOutput()
	t.Log(string(output))
	require.NoError(t, err)
}
