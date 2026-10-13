package httpmw_test

import (
	"bufio"
	"bytes"
	"errors"
	"log/slog"
	"net"
	"net/http"
	"testing"

	"github.com/Emyrk/chronicle/api/httpmw"
	"github.com/stretchr/testify/require"
)

var errHijackedForTest = errors.New("hijacked for test")

type hijackResponseWriter struct {
	header http.Header
}

func (w *hijackResponseWriter) Header() http.Header {
	return w.header
}

func (*hijackResponseWriter) Write(body []byte) (int, error) {
	return len(body), nil
}

func (*hijackResponseWriter) WriteHeader(int) {}

func (*hijackResponseWriter) Hijack() (net.Conn, *bufio.ReadWriter, error) {
	return nil, nil, errHijackedForTest
}

func TestLog500PreservesHijacker(t *testing.T) {
	t.Parallel()

	logger := slog.New(slog.NewTextHandler(&bytes.Buffer{}, nil))
	handler := httpmw.Log500(logger)(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		hijacker, ok := w.(http.Hijacker)
		require.True(t, ok)
		_, _, err := hijacker.Hijack()
		require.ErrorIs(t, err, errHijackedForTest)
	}))

	handler.ServeHTTP(&hijackResponseWriter{header: make(http.Header)}, &http.Request{})
}
