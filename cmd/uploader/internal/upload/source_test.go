package upload_test

import (
	"bytes"
	"os"
	"path/filepath"
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/Emyrk/chronicle/cmd/uploader/internal/upload"
)

func TestIdentify(t *testing.T) {
	t.Parallel()
	dir := t.TempDir()
	write := func(name string, b []byte) string {
		p := filepath.Join(dir, name)
		require.NoError(t, os.WriteFile(p, b, 0o644))
		return p
	}
	// Longer than the hashed prefix, so appending cannot change the id.
	log := bytes.Repeat([]byte("1/1 20:00:00.000  SWING_DAMAGE,x\n"), 4000)
	require.Greater(t, len(log), upload.SourcePrefix)

	id, err := upload.Identify(write("a.txt", log))
	require.NoError(t, err)
	require.NotEmpty(t, id)
	require.LessOrEqual(t, len(id), 256) // the server's header limit

	t.Run("same bytes at another path", func(t *testing.T) {
		other, err := upload.Identify(write("b.txt", log))
		require.NoError(t, err)
		require.Equal(t, id, other)
	})

	t.Run("survives growth", func(t *testing.T) {
		grown, err := upload.Identify(write("c.txt", append(append([]byte{}, log...), "more\n"...)))
		require.NoError(t, err)
		require.Equal(t, id, grown)
	})

	t.Run("different content", func(t *testing.T) {
		other, err := upload.Identify(write("d.txt", append([]byte("x"), log...)))
		require.NoError(t, err)
		require.NotEqual(t, id, other)
	})

	t.Run("short log is not confused with a long one", func(t *testing.T) {
		short, err := upload.Identify(write("e.txt", log[:100]))
		require.NoError(t, err)
		require.NotEqual(t, id, short)
	})

	t.Run("missing file", func(t *testing.T) {
		_, err := upload.Identify(filepath.Join(dir, "nope.txt"))
		require.ErrorIs(t, err, os.ErrNotExist)
	})
}
