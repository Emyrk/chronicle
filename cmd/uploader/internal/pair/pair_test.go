package pair_test

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/cmd/uploader/internal/pair"
)

func noSleep(context.Context, time.Duration) error { return nil }

func server(t *testing.T, statuses ...chroniclesdk.DevicePairPollResponse) *httptest.Server {
	var polls atomic.Int32
	mux := http.NewServeMux()
	mux.HandleFunc("/api/v1/devices/pair/start", func(w http.ResponseWriter, r *http.Request) {
		_ = json.NewEncoder(w).Encode(chroniclesdk.DevicePairStartResponse{
			Code: "ABCD-2345", DeviceCode: "dc", ExpiresIn: 600, Interval: 5, VerifyURL: "http://x/pair?code=ABCD-2345",
		})
	})
	mux.HandleFunc("/api/v1/devices/pair/poll", func(w http.ResponseWriter, r *http.Request) {
		var req chroniclesdk.DevicePairPollRequest
		require.NoError(t, json.NewDecoder(r.Body).Decode(&req))
		require.Equal(t, "dc", req.DeviceCode)
		i := int(polls.Add(1)) - 1
		_ = json.NewEncoder(w).Encode(statuses[min(i, len(statuses)-1)])
	})
	mux.HandleFunc("/api/v1/whoami/device", func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") != "Bearer chrdev_x" {
			w.WriteHeader(http.StatusUnauthorized)
			return
		}
		_ = json.NewEncoder(w).Encode(chroniclesdk.DeviceWhoAmIResponse{DeviceName: "My PC"})
	})
	srv := httptest.NewServer(mux)
	t.Cleanup(srv.Close)
	return srv
}

func TestApproved(t *testing.T) {
	t.Parallel()
	srv := server(t,
		chroniclesdk.DevicePairPollResponse{Status: chroniclesdk.DevicePairStatusPending},
		chroniclesdk.DevicePairPollResponse{Status: chroniclesdk.DevicePairStatusOK, Token: "chrdev_x"})
	c := &pair.Client{BaseURL: srv.URL, Sleep: noSleep}
	s, err := c.Start(context.Background(), "My PC")
	require.NoError(t, err)
	out, tok, err := c.Wait(context.Background(), s)
	require.NoError(t, err)
	require.Equal(t, pair.Approved, out)
	require.Equal(t, "chrdev_x", tok)

	name, err := c.WhoAmI(context.Background(), tok)
	require.NoError(t, err)
	require.Equal(t, "My PC", name)
	_, err = c.WhoAmI(context.Background(), "chrdev_bad")
	require.ErrorIs(t, err, pair.ErrUnauthorized)
}

func TestDeniedAndExpired(t *testing.T) {
	t.Parallel()
	for status, want := range map[chroniclesdk.DevicePairStatus]pair.Outcome{
		chroniclesdk.DevicePairStatusDenied:  pair.Denied,
		chroniclesdk.DevicePairStatusExpired: pair.Expired,
	} {
		srv := server(t, chroniclesdk.DevicePairPollResponse{Status: status})
		c := &pair.Client{BaseURL: srv.URL, Sleep: noSleep}
		s, err := c.Start(context.Background(), "")
		require.NoError(t, err)
		out, tok, err := c.Wait(context.Background(), s)
		require.NoError(t, err)
		require.Equal(t, want, out)
		require.Empty(t, tok)
	}
}
