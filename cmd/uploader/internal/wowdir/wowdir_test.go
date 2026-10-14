package wowdir_test

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/Emyrk/chronicle/cmd/uploader/internal/wowdir"
)

// fakeInstall builds <root>/<flavor>/.flavor.info and returns the root.
func fakeInstall(t *testing.T, flavors ...string) string {
	t.Helper()
	root := filepath.Join(t.TempDir(), "World of Warcraft")
	for _, f := range flavors {
		require.NoError(t, os.MkdirAll(filepath.Join(root, f, "Logs"), 0o755))
		require.NoError(t, os.WriteFile(filepath.Join(root, f, ".flavor.info"), []byte("Product Flavor!STRING:0:\n"), 0o644))
		require.NoError(t, os.WriteFile(filepath.Join(root, f, "Wow.exe"), nil, 0o644))
	}
	// Noise that must not be treated as a flavor.
	require.NoError(t, os.MkdirAll(filepath.Join(root, "_unrelated_"), 0o755))
	require.NoError(t, os.MkdirAll(filepath.Join(root, "Data"), 0o755))
	return root
}

func TestDetect(t *testing.T) {
	t.Parallel()
	root := fakeInstall(t, "_classic_beta_")
	got := wowdir.Detect([]string{filepath.Join(t.TempDir(), "missing"), root})
	require.Len(t, got, 1)
	require.Equal(t, "_classic_beta_", got[0].Flavor)
	require.Equal(t, filepath.Join(root, "_classic_beta_", "Logs"), got[0].LogDir)
}

func TestResolve(t *testing.T) {
	t.Parallel()
	// The flavor folder name must never matter.
	root := fakeInstall(t, "_renamed_at_launch_")
	flavor := filepath.Join(root, "_renamed_at_launch_")
	app := filepath.Join(flavor, "World of Warcraft.app")
	require.NoError(t, os.MkdirAll(filepath.Join(app, "Contents", "MacOS"), 0o755))

	for name, path := range map[string]string{
		"install root": root,
		"flavor dir":   flavor,
		"logs dir":     filepath.Join(flavor, "Logs"),
		"exe":          filepath.Join(flavor, "Wow.exe"),
		"app bundle":   app,
		"inside app":   filepath.Join(app, "Contents", "MacOS"),
	} {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			got, err := wowdir.Resolve(path)
			require.NoError(t, err)
			require.Len(t, got, 1)
			require.Equal(t, flavor, got[0].Dir)
			require.Equal(t, filepath.Join(flavor, "Logs"), got[0].LogDir)
		})
	}
}

func TestResolveNotFound(t *testing.T) {
	t.Parallel()
	_, err := wowdir.Resolve(t.TempDir())
	require.ErrorIs(t, err, wowdir.ErrNotFound)
	_, err = wowdir.Resolve(filepath.Join(t.TempDir(), "nope"))
	require.Error(t, err)
}
