package upload_test

import (
	"compress/gzip"
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/Emyrk/chronicle/cmd/uploader/internal/upload"
)

func TestUpload(t *testing.T) {
	t.Parallel()
	path := filepath.Join(t.TempDir(), "WoWCombatLog.txt")
	require.NoError(t, os.WriteFile(path, []byte("1/1 20:00:00.000  COMBAT_LOG_VERSION,22\nmore bytes appended later"), 0o644))
	const size = 42 // only this much is sent even though the file is larger

	respond := func(status int, body string) (*upload.Client, *http.Request, *string) {
		var gotReq http.Request
		var gotBody string
		srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			gotReq = *r.Clone(context.Background())
			require.NoError(t, r.ParseMultipartForm(1<<20))
			f, h, err := r.FormFile("combat_log")
			require.NoError(t, err)
			require.Equal(t, "WoWCombatLog.txt.gz", h.Filename)
			zr, err := gzip.NewReader(f)
			require.NoError(t, err)
			b, err := io.ReadAll(zr)
			require.NoError(t, err)
			gotBody = string(b)
			w.WriteHeader(status)
			_, _ = w.Write([]byte(body))
		}))
		t.Cleanup(srv.Close)
		return &upload.Client{BaseURL: srv.URL, Token: "tok", Format: "v22-cleu", Flavor: "vanilla,wow-forever"}, &gotReq, &gotBody
	}

	t.Run("created", func(t *testing.T) {
		t.Parallel()
		c, req, body := respond(201, `{"log_id":"abc","file_ids":[]}`)
		res, err := c.Upload(context.Background(), path, "chr1-11-abcd", size)
		require.NoError(t, err)
		require.Equal(t, c.BaseURL+"/logs/abc", res.ReportURL)
		require.False(t, res.Duplicate)
		require.Equal(t, "Bearer tok", req.Header.Get("Authorization"))
		require.Equal(t, "/api/v1/raidlogs/logs/upload-v2", req.URL.Path)
		require.Equal(t, "v22-cleu", req.URL.Query().Get("format"))
		require.Equal(t, "vanilla,wow-forever", req.URL.Query().Get("flavor"))
		require.Equal(t, "chr1-11-abcd", req.Header.Get("X-Chronicle-Source-Id"))
		require.Len(t, *body, size)
	})

	t.Run("server provided url wins", func(t *testing.T) {
		t.Parallel()
		c, _, _ := respond(200, `{"log_id":"abc","url":"/logs/abc?x=1"}`)
		res, err := c.Upload(context.Background(), path, "", size)
		require.NoError(t, err)
		require.Equal(t, c.BaseURL+"/logs/abc?x=1", res.ReportURL)
	})

	t.Run("no source id sends no header", func(t *testing.T) {
		t.Parallel()
		c, req, _ := respond(201, `{"log_id":"abc"}`)
		_, err := c.Upload(context.Background(), path, "", size)
		require.NoError(t, err)
		require.Empty(t, req.Header.Values("X-Chronicle-Source-Id"))
	})

	t.Run("duplicate in a 200", func(t *testing.T) {
		t.Parallel()
		c, _, _ := respond(200, `{"log_id":"abc","url":"/logs/abc","duplicate":true}`)
		res, err := c.Upload(context.Background(), path, "chr1-11-abcd", size)
		require.NoError(t, err)
		require.True(t, res.Duplicate)
		require.Equal(t, c.BaseURL+"/logs/abc", res.ReportURL)
	})

	t.Run("duplicate", func(t *testing.T) {
		t.Parallel()
		c, _, _ := respond(400, `{"message":"A log file with the same contents has already been uploaded by you","link":"/logs/file/deadbeef"}`)
		res, err := c.Upload(context.Background(), path, "", size)
		require.NoError(t, err)
		require.True(t, res.Duplicate)
		require.Equal(t, c.BaseURL+"/logs/file/deadbeef", res.ReportURL)
	})

	t.Run("unauthorized", func(t *testing.T) {
		t.Parallel()
		c, _, _ := respond(401, `{"message":"nope"}`)
		_, err := c.Upload(context.Background(), path, "", size)
		require.ErrorIs(t, err, upload.ErrUnauthorized)
		require.False(t, upload.Retryable(err))
	})

	t.Run("server error is retryable, bad request is not", func(t *testing.T) {
		t.Parallel()
		c, _, _ := respond(503, ``)
		_, err := c.Upload(context.Background(), path, "", size)
		require.True(t, upload.Retryable(err))

		c, _, _ = respond(400, `{"message":"bad log"}`)
		_, err = c.Upload(context.Background(), path, "", size)
		require.Error(t, err)
		require.False(t, upload.Retryable(err))
	})

	t.Run("offline is retryable", func(t *testing.T) {
		t.Parallel()
		srv := httptest.NewServer(http.NotFoundHandler())
		url := srv.URL
		srv.Close()
		c := &upload.Client{BaseURL: url, Token: "tok"}
		_, err := c.Upload(context.Background(), path, "", size)
		require.Error(t, err)
		require.True(t, upload.Retryable(err))
	})

	t.Run("no token", func(t *testing.T) {
		t.Parallel()
		c := &upload.Client{BaseURL: "http://127.0.0.1:1"}
		_, err := c.Upload(context.Background(), path, "", size)
		require.ErrorIs(t, err, upload.ErrUnauthorized)
	})
}

func TestUploadFast(t *testing.T) {
	t.Parallel()
	path := filepath.Join(t.TempDir(), "WoWCombatLog.txt")
	require.NoError(t, os.WriteFile(path, []byte("some combat"), 0o644))
	// Byte 8 of a gzip stream is XFL: 4 is "fastest", 0 is the default level.
	xfl := func(fast bool) byte {
		var got byte
		srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			require.NoError(t, r.ParseMultipartForm(1<<20))
			f, _, err := r.FormFile("combat_log")
			require.NoError(t, err)
			b, err := io.ReadAll(f)
			require.NoError(t, err)
			got = b[8]
			w.WriteHeader(http.StatusCreated)
		}))
		defer srv.Close()
		c := upload.Client{BaseURL: srv.URL, Token: "tok", Fast: fast}
		_, err := c.Upload(context.Background(), path, "", 11)
		require.NoError(t, err)
		return got
	}
	require.Equal(t, byte(4), xfl(true))
	require.Equal(t, byte(0), xfl(false))
}

func TestPing(t *testing.T) {
	t.Parallel()
	for status, ok := range map[int]bool{400: true, 401: true, 403: true, 404: false, 405: false, 503: false} {
		srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(status) }))
		t.Cleanup(srv.Close)
		err := upload.Ping(context.Background(), nil, srv.URL)
		if ok {
			require.NoError(t, err, "HTTP %d", status)
			continue
		}
		var nc *upload.NotChronicleError
		require.ErrorAs(t, err, &nc, "HTTP %d", status)
	}
}

func TestHave(t *testing.T) {
	t.Parallel()

	respond := func(status int, body string) (*upload.Client, *http.Request) {
		var gotReq http.Request
		srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			gotReq = *r.Clone(context.Background())
			w.WriteHeader(status)
			_, _ = w.Write([]byte(body))
		}))
		t.Cleanup(srv.Close)
		return &upload.Client{BaseURL: srv.URL, Token: "tok"}, &gotReq
	}

	t.Run("found", func(t *testing.T) {
		t.Parallel()
		c, req := respond(200, `{"log_id":"abc","size":4096,"url":"/logs/abc"}`)
		have, err := c.Have(context.Background(), "chr1-11-abcd")
		require.NoError(t, err)
		require.Equal(t, int64(4096), have.Size)
		require.Equal(t, c.BaseURL+"/logs/abc", have.ReportURL)
		require.Equal(t, "/api/v1/raidlogs/logs/by-source-id/chr1-11-abcd", req.URL.Path)
		require.Equal(t, "Bearer tok", req.Header.Get("Authorization"))
	})

	t.Run("server has nothing", func(t *testing.T) {
		t.Parallel()
		c, _ := respond(404, `{"message":"No log has been uploaded under that source id."}`)
		have, err := c.Have(context.Background(), "chr1-11-abcd")
		require.NoError(t, err)
		require.Zero(t, have.Size)
		require.Empty(t, have.ReportURL)
	})

	t.Run("server without the route", func(t *testing.T) {
		t.Parallel()
		c, _ := respond(405, ``)
		have, err := c.Have(context.Background(), "chr1-11-abcd")
		require.NoError(t, err)
		require.Zero(t, have.Size)
	})

	t.Run("unauthorized", func(t *testing.T) {
		t.Parallel()
		c, _ := respond(401, `{"message":"nope"}`)
		_, err := c.Have(context.Background(), "chr1-11-abcd")
		require.ErrorIs(t, err, upload.ErrUnauthorized)
	})

	t.Run("server error", func(t *testing.T) {
		t.Parallel()
		c, _ := respond(503, ``)
		_, err := c.Have(context.Background(), "chr1-11-abcd")
		require.Error(t, err)
		require.True(t, upload.Retryable(err))
	})

	t.Run("no token, no source id", func(t *testing.T) {
		t.Parallel()
		c, req := respond(200, `{"size":1}`)
		c.Token = ""
		_, err := c.Have(context.Background(), "chr1-11-abcd")
		require.ErrorIs(t, err, upload.ErrUnauthorized)

		c.Token = "tok"
		have, err := c.Have(context.Background(), "")
		require.NoError(t, err)
		require.Zero(t, have.Size)
		require.Empty(t, req.URL, "neither case reaches the server")
	})
}
