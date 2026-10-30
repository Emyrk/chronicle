package servicelivesession

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
	"time"

	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/coder/websocket"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

func TestDaemonPrivateAuthAndLifecycle(t *testing.T) {
	t.Parallel()
	accessURL, err := url.Parse("https://chronicle.example")
	require.NoError(t, err)
	service := New(Options{AccessURL: accessURL, OriginPatterns: []string{"https://chronicle.example"}})
	private := service.PrivateHandler("test-secret")
	public := service.PublicHandler()
	post := func(handler http.Handler, route, auth, body string) *httptest.ResponseRecorder {
		t.Helper()
		req := httptest.NewRequest(http.MethodPost, route, strings.NewReader(body))
		if auth != "" {
			req.Header.Set("Authorization", auth)
		}
		res := httptest.NewRecorder()
		handler.ServeHTTP(res, req)
		return res
	}
	id := uuid.New()
	createBody := `{"instance_id":"` + id.String() + `","password":"pwd"}`
	require.Equal(t, http.StatusUnauthorized, post(private, "/internal/live-sessions", "", createBody).Code)
	require.Equal(t, http.StatusUnauthorized, post(private, "/internal/live-sessions", "Bearer wrong", createBody).Code)
	require.Equal(t, http.StatusUnauthorized, post(private, "/internal/live-sessions", "test-secret", createBody).Code)
	require.Equal(t, http.StatusNotFound, post(public, "/internal/live-sessions", "Bearer test-secret", createBody).Code)
	require.Equal(t, http.StatusNotFound, post(public, "/api/v1/live-sessions", "", createBody).Code)
	require.Equal(t, http.StatusBadRequest, post(private, "/internal/live-sessions", "Bearer test-secret", strings.Repeat("x", maxPrivateBodyBytes+1)).Code)
	createdRes := post(private, "/internal/live-sessions", "Bearer test-secret", createBody)
	require.Equal(t, http.StatusCreated, createdRes.Code)
	var created chroniclesdk.CreateLiveSessionResponse
	require.NoError(t, json.NewDecoder(createdRes.Body).Decode(&created))
	require.Equal(t, "https://chronicle.example/instances/"+id.String()+"?live="+created.Code, created.URL)
	route := "/internal/live-sessions/" + created.Code + "/join"
	require.Equal(t, http.StatusUnauthorized, post(private, route, "", `{}`).Code)
	require.Equal(t, http.StatusForbidden, post(private, route, "Bearer test-secret", `{"password":"wrong"}`).Code)
	joinedRes := post(private, route, "Bearer test-secret", `{"password":"pwd","username":"RaidLead"}`)
	require.Equal(t, http.StatusOK, joinedRes.Code)
	var joined chroniclesdk.JoinLiveSessionResponse
	require.NoError(t, json.NewDecoder(joinedRes.Body).Decode(&joined))
	require.Equal(t, id, joined.InstanceID)
	service.mu.Lock()
	leaderID := service.rooms[created.Code].participants[joined.ParticipantToken].id
	service.mu.Unlock()
	require.Equal(t, "user:RaidLead", leaderID)
	guestRes := post(private, route, "Bearer test-secret", `{"password":"pwd"}`)
	require.Equal(t, http.StatusOK, guestRes.Code)
	var guest chroniclesdk.JoinLiveSessionResponse
	require.NoError(t, json.NewDecoder(guestRes.Body).Decode(&guest))
	service.mu.Lock()
	guestID := service.rooms[created.Code].participants[guest.ParticipantToken].id
	service.mu.Unlock()
	require.NotContains(t, guestID, "user:")
	health := httptest.NewRecorder()
	public.ServeHTTP(health, httptest.NewRequest(http.MethodGet, "/healthz", nil))
	require.Equal(t, http.StatusOK, health.Code)
	service.Close()
	service.mu.Lock()
	require.Empty(t, service.rooms)
	service.mu.Unlock()
}

func TestDaemonOriginAndPeriodicCleanup(t *testing.T) {
	t.Parallel()
	service := New(Options{OriginPatterns: []string{"https://chronicle.example"}})
	room, err := service.create(uuid.New(), "")
	require.NoError(t, err)
	participant, _, err := service.join(room.code, "")
	require.NoError(t, err)
	server := httptest.NewServer(service.PublicHandler())
	defer server.Close()
	wsURL := "ws" + strings.TrimPrefix(server.URL, "http") + "/api/v1/live-sessions/" + room.code + "/ws?token=" + url.QueryEscape(room.leaderToken)
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	_, response, err := websocket.Dial(ctx, wsURL, &websocket.DialOptions{HTTPHeader: http.Header{"Origin": []string{"https://evil.example"}}})
	require.Error(t, err)
	require.Equal(t, http.StatusForbidden, response.StatusCode)
	_ = response.Body.Close()
	conn, _, err := websocket.Dial(ctx, wsURL, &websocket.DialOptions{HTTPHeader: http.Header{"Origin": []string{"https://chronicle.example"}}})
	require.NoError(t, err)
	defer func() { _ = conn.CloseNow() }()
	require.Eventually(t, func() bool {
		service.mu.Lock()
		defer service.mu.Unlock()
		return room.leader != nil
	}, time.Second, time.Millisecond)
	service.mu.Lock()
	participant.reservedAt = time.Now().Add(-joinReservationTTL - time.Second)
	service.mu.Unlock()
	cleanupCtx, stop := context.WithCancel(context.Background())
	done := make(chan struct{})
	go func() { service.RunCleanup(cleanupCtx, time.Millisecond); close(done) }()
	require.Eventually(t, func() bool {
		service.mu.Lock()
		defer service.mu.Unlock()
		return room.participants[participant.token] == nil
	}, time.Second, time.Millisecond)
	stop()
	<-done
	service.Close()
	service.mu.Lock()
	require.Empty(t, service.rooms)
	service.mu.Unlock()
	err = conn.Ping(ctx)
	require.Error(t, err)

	stale, err := service.create(uuid.New(), "")
	require.NoError(t, err)
	service.mu.Lock()
	stale.createdAt = time.Now().Add(-unstartedRoomTTL - time.Second)
	service.mu.Unlock()
	cleanupCtx, stop = context.WithCancel(context.Background())
	done = make(chan struct{})
	go func() { service.RunCleanup(cleanupCtx, time.Millisecond); close(done) }()
	require.Eventually(t, func() bool {
		service.mu.Lock()
		defer service.mu.Unlock()
		return service.rooms[stale.code] == nil
	}, time.Second, time.Millisecond)
	stop()
	<-done
}
