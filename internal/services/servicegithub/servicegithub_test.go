package servicegithub

import (
	"context"
	"io"
	"net/http"
	"strings"
	"testing"

	"github.com/Emyrk/chronicle/internal/services"
	"github.com/stretchr/testify/require"
)

type roundTripFunc func(*http.Request) (*http.Response, error)

func (f roundTripFunc) RoundTrip(req *http.Request) (*http.Response, error) {
	return f(req)
}

func response() *http.Response {
	return &http.Response{
		StatusCode: http.StatusOK,
		Header:     make(http.Header),
		Body:       io.NopCloser(strings.NewReader("{}")),
	}
}

func TestServiceOAuthAppAuthentication(t *testing.T) {
	t.Parallel()

	var authorization string
	service := New(services.New())
	service.clientID = "client-id"
	service.clientSecret = "client-secret"
	service.baseTransport = roundTripFunc(func(req *http.Request) (*http.Response, error) {
		authorization = req.Header.Get("Authorization")
		return response(), nil
	})
	require.NoError(t, service.Start(context.Background()))

	req, err := http.NewRequest(http.MethodGet, "https://api.github.com/meta", nil)
	require.NoError(t, err)
	resp, err := service.Client().Do(req)
	require.NoError(t, err)
	require.NoError(t, resp.Body.Close())

	username, password, ok := (&http.Request{Header: http.Header{"Authorization": []string{authorization}}}).BasicAuth()
	require.True(t, ok)
	require.Equal(t, "client-id", username)
	require.Equal(t, "client-secret", password)
	require.Empty(t, req.Header.Get("Authorization"), "transport must not mutate the caller's request")
}

func TestServiceDoesNotAuthenticateUnapprovedURLs(t *testing.T) {
	t.Parallel()

	for _, target := range []string{
		"https://raw.githubusercontent.com/owner/repo/commit/chronicle-panel.json",
		"http://api.github.com/meta",
		"https://api.github.com.example.com/meta",
	} {
		t.Run(target, func(t *testing.T) {
			t.Parallel()

			var authorization string
			service := New(services.New())
			service.clientID = "client-id"
			service.clientSecret = "client-secret"
			service.baseTransport = roundTripFunc(func(req *http.Request) (*http.Response, error) {
				authorization = req.Header.Get("Authorization")
				return response(), nil
			})
			require.NoError(t, service.Start(context.Background()))

			req, err := http.NewRequest(http.MethodGet, target, nil)
			require.NoError(t, err)
			req.SetBasicAuth("should", "be-removed")
			resp, err := service.Client().Do(req)
			require.NoError(t, err)
			require.NoError(t, resp.Body.Close())
			require.Empty(t, authorization)
		})
	}
}

func TestServiceAnonymousFallback(t *testing.T) {
	t.Parallel()

	var authorization string
	service := New(services.New())
	service.baseTransport = roundTripFunc(func(req *http.Request) (*http.Response, error) {
		authorization = req.Header.Get("Authorization")
		return response(), nil
	})
	require.NoError(t, service.Start(context.Background()))

	req, err := http.NewRequest(http.MethodGet, "https://api.github.com/meta", nil)
	require.NoError(t, err)
	resp, err := service.Client().Do(req)
	require.NoError(t, err)
	require.NoError(t, resp.Body.Close())
	require.Empty(t, authorization)
}

func TestServiceRejectsPartialCredentials(t *testing.T) {
	t.Parallel()

	for _, tc := range []struct {
		name         string
		clientID     string
		clientSecret string
	}{
		{name: "missing secret", clientID: "client-id"},
		{name: "missing id", clientSecret: "client-secret"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			service := New(services.New())
			service.clientID = tc.clientID
			service.clientSecret = tc.clientSecret
			require.ErrorContains(t, service.Start(context.Background()), "must be configured together")
		})
	}
}
