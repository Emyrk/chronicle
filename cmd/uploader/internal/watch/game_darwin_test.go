package watch_test

import (
	"context"
	"os"
	"os/exec"
	"path/filepath"
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	"github.com/Emyrk/chronicle/cmd/uploader/internal/tenant"
	"github.com/Emyrk/chronicle/cmd/uploader/internal/watch"
)

// An exited client its parent has not waited for is a zombie: the pid still
// exists but the game is gone.
func TestGameZombieIsNotRunning(t *testing.T) {
	t.Parallel()
	sleep, err := exec.LookPath("sleep")
	require.NoError(t, err)
	data, err := os.ReadFile(sleep)
	require.NoError(t, err)
	exe := filepath.Join(t.TempDir(), "World of Warcraft")
	require.NoError(t, os.WriteFile(exe, data, 0o755))

	cmd := exec.Command(exe, "0.3")
	require.NoError(t, cmd.Start())
	waited := false
	t.Cleanup(func() {
		if !waited {
			_ = cmd.Wait()
		}
	})

	ctx := context.Background()
	g := watch.NewGame(tenant.DefaultLayout, nil)
	require.True(t, g.Running(ctx, nil))

	time.Sleep(time.Second) // exited, not reaped
	require.True(t, g.Running(ctx, nil), "first miss is debounced")
	require.False(t, g.Running(ctx, nil), "a zombie is not the game")

	waited = true
	require.NoError(t, cmd.Wait())
}
