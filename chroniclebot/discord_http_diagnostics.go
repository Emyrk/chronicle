package chroniclebot

import (
	"bytes"
	"fmt"
	"io"
	"net/http"
	"strings"
	"sync"
	"unicode"
)

const discordDiagnosticBodyLimit = 512

type discordHTTPDiagnostics struct {
	base  http.RoundTripper
	token string

	mu   sync.Mutex
	last string
}

func newDiscordHTTPDiagnostics(base http.RoundTripper, token string) *discordHTTPDiagnostics {
	if base == nil {
		base = http.DefaultTransport
	}
	return &discordHTTPDiagnostics{base: base, token: token}
}

func (d *discordHTTPDiagnostics) RoundTrip(req *http.Request) (*http.Response, error) {
	resp, err := d.base.RoundTrip(req)
	if err != nil {
		return nil, err
	}
	if resp.StatusCode < http.StatusBadRequest || resp.Body == nil {
		return resp, nil
	}

	prefix, readErr := io.ReadAll(io.LimitReader(resp.Body, discordDiagnosticBodyLimit+1))
	resp.Body = &readCloser{
		Reader: io.MultiReader(bytes.NewReader(prefix), resp.Body),
		Closer: resp.Body,
	}

	preview := prefix
	truncated := len(preview) > discordDiagnosticBodyLimit
	if truncated {
		preview = preview[:discordDiagnosticBodyLimit]
	}
	body := strings.TrimSpace(strings.Map(func(r rune) rune {
		if unicode.IsControl(r) && !unicode.IsSpace(r) {
			return unicode.ReplacementChar
		}
		return r
	}, strings.ToValidUTF8(string(preview), "�")))
	body = strings.Join(strings.Fields(body), " ")
	if d.token != "" {
		body = strings.ReplaceAll(body, d.token, "[REDACTED]")
	}
	if truncated {
		body += "…"
	}

	endpoint := req.URL.Scheme + "://" + req.URL.Host + req.URL.EscapedPath()
	diagnostic := fmt.Sprintf(
		"discord HTTP response method=%s endpoint=%s status=%q content_type=%q retry_after=%q server=%q cf_ray=%q body=%q",
		req.Method,
		endpoint,
		resp.Status,
		resp.Header.Get("Content-Type"),
		resp.Header.Get("Retry-After"),
		resp.Header.Get("Server"),
		resp.Header.Get("CF-Ray"),
		body,
	)
	if readErr != nil {
		diagnostic += fmt.Sprintf(" body_read_error=%q", readErr.Error())
	}

	d.mu.Lock()
	d.last = diagnostic
	d.mu.Unlock()
	return resp, nil
}

func (d *discordHTTPDiagnostics) reset() {
	d.mu.Lock()
	d.last = ""
	d.mu.Unlock()
}

func (d *discordHTTPDiagnostics) annotate(err error) error {
	if err == nil {
		return nil
	}
	d.mu.Lock()
	last := d.last
	d.mu.Unlock()
	if last == "" {
		return err
	}
	return fmt.Errorf("%w; %s", err, last)
}

type readCloser struct {
	io.Reader
	io.Closer
}
