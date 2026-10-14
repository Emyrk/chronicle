package watch_test

import (
	"context"
	"io"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	"github.com/Emyrk/chronicle/cmd/uploader/internal/tenant"
	"github.com/Emyrk/chronicle/cmd/uploader/internal/watch"
)

const fakeGameEnv = "CHRONICLE_TEST_FAKE_GAME"

// TestMain lets the test binary stand in for the game: copied to a file named
// like the client and run with fakeGameEnv set, it lives briefly and exits.
// macOS kills a copied system binary such as sleep (platform-binary
// protection), but a Go test binary is ad-hoc signed and runs when copied.
func TestMain(m *testing.M) {
	if os.Getenv(fakeGameEnv) != "" {
		time.Sleep(1500 * time.Millisecond)
		os.Exit(0)
	}
	os.Exit(m.Run())
}

// An exited client its parent has not waited for is a zombie: the pid still
// exists but the game is gone.
func TestGameZombieIsNotRunning(t *testing.T) {
	t.Parallel()
	self, err := os.Executable()
	require.NoError(t, err)
	src, err := os.Open(self)
	require.NoError(t, err)
	defer src.Close()
	exe := filepath.Join(t.TempDir(), "World of Warcraft")
	dst, err := os.OpenFile(exe, os.O_CREATE|os.O_WRONLY, 0o755)
	require.NoError(t, err)
	_, err = io.Copy(dst, src)
	require.NoError(t, err)
	require.NoError(t, dst.Close())

	child := &os.ProcAttr{
		Env:   append(os.Environ(), fakeGameEnv+"=1"),
		Files: []*os.File{os.Stdin, os.Stdout, os.Stderr},
	}
	proc, err := os.StartProcess(exe, []string{exe}, child)
	require.NoError(t, err)
	waited := false
	t.Cleanup(func() {
		if !waited {
			_, _ = proc.Wait()
		}
	})

	ctx := context.Background()
	g := watch.NewGame(tenant.DefaultLayout, nil)
	require.True(t, g.Running(ctx, nil), "the child is the game (kernel comm is truncated)")
	require.True(t, g.Running(ctx, nil), "a live pid is still the game")

	time.Sleep(2500 * time.Millisecond) // exited, not reaped
	require.True(t, g.Running(ctx, nil), "first miss is debounced")
	require.False(t, g.Running(ctx, nil), "a zombie is not the game")

	waited = true
	_, err = proc.Wait()
	require.NoError(t, err)
}
