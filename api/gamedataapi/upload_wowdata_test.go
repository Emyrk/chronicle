package gamedataapi

import (
	"bytes"
	"compress/gzip"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/go-chi/chi/v5"
	"github.com/stretchr/testify/require"
)

func TestUploadWowdataSnapshotRejectsInvalidRequests(t *testing.T) {
	t.Parallel()
	h := New(nil, nil, nil, nil)

	t.Run("dataset ID", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodPut, "/datasets/nope/wowdata-snapshot", bytes.NewBufferString(`{}`))
		rec := httptest.NewRecorder()
		r := chi.NewRouter()
		r.Put("/datasets/{datasetID}/wowdata-snapshot", h.UploadWowdataSnapshot)
		r.ServeHTTP(rec, req)
		require.Equal(t, http.StatusBadRequest, rec.Code)
	})

	t.Run("gzip", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodPut, "/datasets/00000000-0000-0000-0000-000000000001/wowdata-snapshot", bytes.NewBufferString("not gzip"))
		req.Header.Set("Content-Encoding", "gzip")
		rec := httptest.NewRecorder()
		r := chi.NewRouter()
		r.Put("/datasets/{datasetID}/wowdata-snapshot", h.UploadWowdataSnapshot)
		r.ServeHTTP(rec, req)
		require.Equal(t, http.StatusBadRequest, rec.Code)
	})

	t.Run("metadata", func(t *testing.T) {
		var body bytes.Buffer
		gz := gzip.NewWriter(&body)
		_, err := gz.Write([]byte(`{"format":"wrong"}`))
		require.NoError(t, err)
		require.NoError(t, gz.Close())
		req := httptest.NewRequest(http.MethodPut, "/datasets/00000000-0000-0000-0000-000000000001/wowdata-snapshot", &body)
		req.Header.Set("Content-Encoding", "gzip")
		rec := httptest.NewRecorder()
		r := chi.NewRouter()
		r.Put("/datasets/{datasetID}/wowdata-snapshot", h.UploadWowdataSnapshot)
		r.ServeHTTP(rec, req)
		require.Equal(t, http.StatusBadRequest, rec.Code)
	})
}
