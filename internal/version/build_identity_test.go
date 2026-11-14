package version

import (
	"io"
	"runtime"
	"strings"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestBinaryIdentityContent(t *testing.T) {
	t.Parallel()
	first, err := binaryIdentity(strings.NewReader("abc"))
	require.NoError(t, err)
	require.Equal(t, "sha256:ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad", first)
	again, err := binaryIdentity(strings.NewReader("abc"))
	require.NoError(t, err)
	require.Equal(t, first, again)
	changed, err := binaryIdentity(strings.NewReader("abcd"))
	require.NoError(t, err)
	require.NotEqual(t, first, changed)
}

func TestBinaryIdentityFailsClosed(t *testing.T) {
	t.Parallel()
	value, err := binaryIdentity(strings.NewReader(""))
	require.Error(t, err)
	require.Empty(t, value)
	value, err = binaryIdentity(identityErrorReader{})
	require.ErrorIs(t, err, io.ErrUnexpectedEOF)
	require.Empty(t, value)
}

type identityErrorReader struct{}

func (identityErrorReader) Read([]byte) (int, error) { return 0, io.ErrUnexpectedEOF }

func TestRunningBinaryIdentity(t *testing.T) {
	t.Parallel()
	first, err := BinaryIdentity()
	if runtime.GOOS != "linux" {
		require.Error(t, err)
		require.Empty(t, first)
		return
	}
	require.NoError(t, err)
	require.Len(t, first, len("sha256:")+64)
	require.True(t, strings.HasPrefix(first, "sha256:"))
	again, err := BinaryIdentity()
	require.NoError(t, err)
	require.Equal(t, first, again)
}
