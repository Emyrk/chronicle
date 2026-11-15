package serviceclientip_test

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/coder/serpent"
	"github.com/stretchr/testify/require"

	"github.com/Emyrk/chronicle/internal/services"
	"github.com/Emyrk/chronicle/internal/services/serviceclientip"
)

// resolveWith runs the real option set with args and env, as the server command
// does, and returns the client key the broker's resolver gives for a request
// carrying both a Cloudflare header and a forged forwarded-for.
func resolveWith(t *testing.T, env []string, args ...string) string {
	t.Helper()

	srvs := services.New()
	require.NoError(t, srvs.Register(serviceclientip.New(srvs)))

	var got string
	cmd := &serpent.Command{
		Use:     "server",
		Options: srvs.OptionSet(),
		Handler: func(*serpent.Invocation) error {
			req := httptest.NewRequest(http.MethodGet, "/", nil)
			req.RemoteAddr = "10.0.0.1:1234"
			req.Header.Set("CF-Connecting-IP", "203.0.113.7")
			req.Header.Set("X-Forwarded-For", "198.51.100.9")
			got = serviceclientip.Resolver(srvs).Key(req)
			return nil
		},
	}
	inv := cmd.Invoke(args...)
	inv.Environ = serpent.ParseEnviron(env, "")
	require.NoError(t, inv.Run())
	return got
}

func TestBehindCloudflareReachesResolver(t *testing.T) {
	t.Parallel()

	t.Run("off by default, the forwarded-for hop wins", func(t *testing.T) {
		t.Parallel()
		require.Equal(t, "198.51.100.9", resolveWith(t, nil))
	})
	t.Run("flag", func(t *testing.T) {
		t.Parallel()
		require.Equal(t, "203.0.113.7", resolveWith(t, nil, "--behind-cloudflare"))
	})
	t.Run("environment", func(t *testing.T) {
		t.Parallel()
		require.Equal(t, "203.0.113.7", resolveWith(t, []string{"CHRONICLE_BEHIND_CLOUDFLARE=true"}))
	})
	t.Run("explicitly false", func(t *testing.T) {
		t.Parallel()
		require.Equal(t, "198.51.100.9", resolveWith(t, []string{"CHRONICLE_BEHIND_CLOUDFLARE=false"}))
	})
}
