package httpmw_test

import (
	"bytes"
	"context"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/Emyrk/chronicle/api/httpmw"
	"github.com/stretchr/testify/assert"
)

func TestLog500(t *testing.T) {
	t.Parallel()

	t.Run("logs on 500", func(t *testing.T) {
		t.Parallel()
		var buf bytes.Buffer
		logger := slog.New(slog.NewTextHandler(&buf, nil))

		handler := httpmw.Log500(logger)(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
			w.WriteHeader(http.StatusInternalServerError)
			_, _ = w.Write([]byte(`{"message":"something broke"}`))
		}))

		req := httptest.NewRequest(http.MethodGet, "/test", nil)
		rec := httptest.NewRecorder()
		handler.ServeHTTP(rec, req)

		assert.Equal(t, http.StatusInternalServerError, rec.Code)
		logged := buf.String()
		assert.Contains(t, logged, "returned 500")
		assert.Contains(t, logged, "/test")
		assert.Contains(t, logged, "something broke")
	})

	t.Run("no log when request is canceled", func(t *testing.T) {
		t.Parallel()
		var buf bytes.Buffer
		logger := slog.New(slog.NewTextHandler(&buf, nil))

		ctx, cancel := context.WithCancel(context.Background())
		handler := httpmw.Log500(logger)(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
			cancel()
			w.WriteHeader(http.StatusInternalServerError)
			_, _ = w.Write([]byte(`{"message":"request canceled","detail":"conn closed"}`))
		}))

		req := httptest.NewRequest(http.MethodGet, "/canceled", nil).WithContext(ctx)
		rec := httptest.NewRecorder()
		handler.ServeHTTP(rec, req)

		assert.Equal(t, http.StatusInternalServerError, rec.Code)
		assert.Empty(t, buf.String())
	})

	t.Run("no log on 200", func(t *testing.T) {
		t.Parallel()
		var buf bytes.Buffer
		logger := slog.New(slog.NewTextHandler(&buf, nil))

		handler := httpmw.Log500(logger)(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
			w.WriteHeader(http.StatusOK)
		}))

		req := httptest.NewRequest(http.MethodGet, "/ok", nil)
		rec := httptest.NewRecorder()
		handler.ServeHTTP(rec, req)

		assert.Equal(t, http.StatusOK, rec.Code)
		assert.Empty(t, buf.String())
	})
}
