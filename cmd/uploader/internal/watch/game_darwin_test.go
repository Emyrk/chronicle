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
// like the client and run with fakeGameEnv set, it reports ready on stdout,
// lives until stdin is closed, and exits. macOS kills a copied system binary
// such as sleep (platform-binary protection), but a Go test binary is ad-hoc
// signed and runs when copied.
func TestMain(m *testing.M) {
	if os.Getenv(fakeGameEnv) != "" {
		_, _ = os.Stdout.Write([]byte{1})
		_, _ = io.Copy(io.Discard, os.Stdin)
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

	// The child's stdin is the parent's to close (the child exits on EOF) and
	// its stdout closes when it exits, so neither step depends on how long a
	// freshly copied binary takes to launch.
	stdinR, stdinW, err := os.Pipe()
	require.NoError(t, err)
	stdoutR, stdoutW, err := os.Pipe()
	require.NoError(t, err)
	defer stdinW.Close()
	defer stdoutR.Close()

	proc, err := os.StartProcess(exe, []string{exe}, &os.ProcAttr{
		Env:   append(os.Environ(), fakeGameEnv+"=1"),
		Files: []*os.File{stdinR, stdoutW, os.Stderr},
	})
	require.NoError(t, err)
	require.NoError(t, stdinR.Close())
	require.NoError(t, stdoutW.Close())
	waited := false
	t.Cleanup(func() {
		if !waited {
			_ = proc.Kill()
			_, _ = proc.Wait()
		}
	})

	// Ready: the child is running, however long Gatekeeper took.
	require.NoError(t, stdoutR.SetReadDeadline(time.Now().Add(time.Minute)))
	_, err = io.ReadFull(stdoutR, make([]byte, 1))
	require.NoError(t, err)

	ctx := context.Background()
	g := watch.NewGame(tenant.DefaultLayout, nil)
	require.True(t, g.Running(ctx, nil), "the child is the game (kernel comm is truncated)")
	require.True(t, g.Running(ctx, nil), "a live pid is still the game")

	// Tell it to exit; its stdout closes when it does, and nobody has waited.
	require.NoError(t, stdinW.Close())
	require.NoError(t, stdoutR.SetReadDeadline(time.Now().Add(time.Minute)))
	_, err = io.Copy(io.Discard, stdoutR)
	require.NoError(t, err)
	// The kernel closes the child's files before it becomes a zombie, so wait
	// for the table to show it.
	require.Eventually(t, func() bool {
		return !watch.NewGame(tenant.DefaultLayout, nil).Running(ctx, nil)
	}, 30*time.Second, 10*time.Millisecond)

	require.True(t, g.Running(ctx, nil), "first miss is debounced")
	require.False(t, g.Running(ctx, nil), "a zombie is not the game")

	waited = true
	_, err = proc.Wait()
	require.NoError(t, err)
}
