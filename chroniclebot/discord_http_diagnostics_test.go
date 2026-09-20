package chroniclebot

import (
	"errors"
	"io"
	"net/http"
	"strings"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestDiscordHTTPDiagnosticsAnnotatesFailureAndPreservesBody(t *testing.T) {
	t.Parallel()

	const token = "super-secret-token"
	const responseBody = "error code: 1015 token=" + token
	diagnostics := newDiscordHTTPDiagnostics(roundTripFunc(func(*http.Request) (*http.Response, error) {
		return &http.Response{
			StatusCode: http.StatusTooManyRequests,
			Status:     "429 Too Many Requests",
			Header: http.Header{
				"Content-Type": []string{"text/plain; charset=UTF-8"},
				"Retry-After":  []string{"17"},
				"Server":       []string{"cloudflare"},
				"Cf-Ray":       []string{"abc123-IAD"},
			},
			Body: io.NopCloser(strings.NewReader(responseBody)),
		}, nil
	}), token)

	req, err := http.NewRequest(http.MethodGet, "https://discord.com/api/v9/gateway?secret=query", nil)
	require.NoError(t, err)
	resp, err := diagnostics.RoundTrip(req)
	require.NoError(t, err)

	body, err := io.ReadAll(resp.Body)
	require.NoError(t, err)
	require.Equal(t, responseBody, string(body), "diagnostic capture must not consume the response body")

	annotated := diagnostics.annotate(errors.New("invalid character 'e' looking for beginning of value"))
	require.ErrorContains(t, annotated, "status=\"429 Too Many Requests\"")
	require.ErrorContains(t, annotated, "endpoint=https://discord.com/api/v9/gateway")
	require.ErrorContains(t, annotated, "content_type=\"text/plain; charset=UTF-8\"")
	require.ErrorContains(t, annotated, "retry_after=\"17\"")
	require.ErrorContains(t, annotated, "server=\"cloudflare\"")
	require.ErrorContains(t, annotated, "cf_ray=\"abc123-IAD\"")
	require.ErrorContains(t, annotated, "body=\"error code: 1015 token=[REDACTED]\"")
	require.NotContains(t, annotated.Error(), token)
	require.NotContains(t, annotated.Error(), "secret=query")
}

func TestDiscordHTTPDiagnosticsIgnoresSuccessfulResponses(t *testing.T) {
	t.Parallel()

	diagnostics := newDiscordHTTPDiagnostics(roundTripFunc(func(*http.Request) (*http.Response, error) {
		return &http.Response{
			StatusCode: http.StatusOK,
			Status:     "200 OK",
			Header:     make(http.Header),
			Body:       io.NopCloser(strings.NewReader(`{"url":"wss://gateway.discord.gg"}`)),
		}, nil
	}), "")

	req, err := http.NewRequest(http.MethodGet, "https://discord.com/api/v9/gateway", nil)
	require.NoError(t, err)
	_, err = diagnostics.RoundTrip(req)
	require.NoError(t, err)

	original := errors.New("websocket dial failed")
	require.Equal(t, original, diagnostics.annotate(original))
}

type roundTripFunc func(*http.Request) (*http.Response, error)

func (f roundTripFunc) RoundTrip(req *http.Request) (*http.Response, error) {
	return f(req)
}
