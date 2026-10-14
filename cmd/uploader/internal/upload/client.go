// Package upload sends combat logs to a Chronicle server.
package upload

import (
	"compress/gzip"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"net/textproto"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"time"
)

const (
	uploadPath = "/api/v1/raidlogs/logs/upload-v2"
	probePath  = "/api/v1/whoami/dump"
)

// Ping checks that baseURL serves the Chronicle API. Without credentials the
// probe endpoint answers 400, 401 or 403 depending on the deployment; a landing
// page answers 404 or 405.
func Ping(ctx context.Context, httpc *http.Client, baseURL string) error {
	if httpc == nil {
		httpc = &http.Client{Timeout: 15 * time.Second}
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, strings.TrimRight(baseURL, "/")+probePath, nil)
	if err != nil {
		return err
	}
	resp, err := httpc.Do(req)
	if err != nil {
		return err
	}
	_ = resp.Body.Close()
	switch resp.StatusCode {
	case http.StatusBadRequest, http.StatusUnauthorized, http.StatusForbidden:
	default:
		return &NotChronicleError{BaseURL: baseURL, Status: resp.StatusCode}
	}
	return nil
}

// NotChronicleError means the host is up but is not a Chronicle API.
type NotChronicleError struct {
	BaseURL string
	Status  int
}

func (e *NotChronicleError) Error() string {
	return fmt.Sprintf("server %s does not look like a Chronicle API (HTTP %d)", e.BaseURL, e.Status)
}

// ErrUnauthorized means the token is missing, expired or revoked.
var ErrUnauthorized = errors.New("not signed in to Chronicle")

// Error is a failed upload that came back from the server.
type Error struct {
	Status  int
	Message string
}

func (e *Error) Error() string {
	return fmt.Sprintf("upload failed (HTTP %d): %s", e.Status, e.Message)
}

// Retryable reports whether the same request may succeed later.
func Retryable(err error) bool {
	var e *Error
	if errors.As(err, &e) {
		return e.Status >= 500 || e.Status == http.StatusTooManyRequests || e.Status == http.StatusRequestTimeout
	}
	// Anything that is not a server answer (DNS, connection reset, timeout) is
	// a connectivity problem.
	return !errors.Is(err, ErrUnauthorized) && !errors.Is(err, context.Canceled) && !errors.Is(err, os.ErrNotExist)
}

// Result is the outcome of one upload.
type Result struct {
	// ReportURL is where the log can be viewed.
	ReportURL string
	// Duplicate is true when the server already had this exact file.
	Duplicate bool
}

// Client uploads logs.
type Client struct {
	// BaseURL is the tenant's Chronicle site.
	BaseURL string
	// Format and Flavor are the tenant's upload-v2 parameters. The server
	// does not sniff them; both are required.
	Format, Flavor string
	// Token returns the current bearer token ("" when signed out).
	Token string
	HTTP  *http.Client
	// Fast compresses at gzip.BestSpeed: ~3x the throughput of the default for a
	// ratio that is irrelevant next to a frame hitch while the game runs.
	Fast bool
}

type uploadResponse struct {
	LogID string `json:"log_id"`
	// URL is sent by servers that support idempotent re-upload; older ones
	// only send log_id.
	URL string `json:"url"`
	// Message and Link come from error responses.
	Message string `json:"message"`
	Link    string `json:"link"`
}

// Upload gzips the first size bytes of path and posts them. Only size bytes are
// read so the upload matches the size the caller recorded even while the
// client keeps appending.
func (c *Client) Upload(ctx context.Context, path string, size int64) (Result, error) {
	if c.Token == "" {
		return Result{}, ErrUnauthorized
	}
	f, err := os.Open(path)
	if err != nil {
		return Result{}, err
	}
	defer func() { _ = f.Close() }()

	pr, pw := io.Pipe()
	mw := multipart.NewWriter(pw)
	go func() {
		_ = pw.CloseWithError(writeForm(mw, f, size, filepath.Base(path), c.Fast))
	}()

	endpoint := strings.TrimRight(c.BaseURL, "/") + uploadPath + "?" + url.Values{"format": {c.Format}, "flavor": {c.Flavor}}.Encode()
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, pr)
	if err != nil {
		_ = pr.Close()
		return Result{}, err
	}
	req.Header.Set("Content-Type", mw.FormDataContentType())
	req.Header.Set("Authorization", "Bearer "+c.Token)

	httpc := c.HTTP
	if httpc == nil {
		httpc = &http.Client{Timeout: 30 * time.Minute}
	}
	resp, err := httpc.Do(req)
	if err != nil {
		_ = pr.CloseWithError(err)
		return Result{}, err
	}
	defer func() { _ = resp.Body.Close() }()

	body, _ := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	var out uploadResponse
	_ = json.Unmarshal(body, &out)

	switch {
	case resp.StatusCode == http.StatusCreated || resp.StatusCode == http.StatusOK:
		return Result{ReportURL: c.reportURL(out)}, nil
	case resp.StatusCode == http.StatusUnauthorized:
		return Result{}, ErrUnauthorized
	case resp.StatusCode == http.StatusBadRequest && strings.Contains(out.Message, "already been uploaded"):
		return Result{ReportURL: c.abs(out.Link), Duplicate: true}, nil
	}
	if resp.StatusCode == http.StatusNotFound || resp.StatusCode == http.StatusMethodNotAllowed {
		return Result{}, &NotChronicleError{BaseURL: c.BaseURL, Status: resp.StatusCode}
	}
	msg := out.Message
	if msg == "" {
		msg = http.StatusText(resp.StatusCode)
	}
	return Result{}, &Error{Status: resp.StatusCode, Message: msg}
}

func writeForm(mw *multipart.Writer, src io.Reader, size int64, name string, fast bool) error {
	// The ".gz" suffix is how the server knows the part is compressed.
	h := textproto.MIMEHeader{}
	h.Set("Content-Disposition", fmt.Sprintf(`form-data; name="combat_log"; filename="%s.gz"`, name))
	h.Set("Content-Type", "application/gzip")
	part, err := mw.CreatePart(h)
	if err != nil {
		return err
	}
	level := gzip.DefaultCompression
	if fast {
		level = gzip.BestSpeed
	}
	zw, err := gzip.NewWriterLevel(part, level)
	if err != nil {
		return err
	}
	if _, err := io.Copy(zw, io.LimitReader(src, size)); err != nil {
		return err
	}
	if err := zw.Close(); err != nil {
		return err
	}
	return mw.Close()
}

func (c *Client) reportURL(r uploadResponse) string {
	if r.URL != "" {
		return c.abs(r.URL)
	}
	if r.LogID != "" {
		return c.abs("/logs/" + r.LogID)
	}
	return ""
}

func (c *Client) abs(ref string) string {
	if ref == "" {
		return ""
	}
	base, err := url.Parse(c.BaseURL)
	if err != nil {
		return ref
	}
	u, err := base.Parse(ref)
	if err != nil {
		return ref
	}
	return u.String()
}
