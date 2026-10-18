package servicelivesession

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
	"time"

	"github.com/Emyrk/chronicle/api/chronauth"
	"github.com/Emyrk/chronicle/api/chronauth/claims"
	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/coder/websocket"
	"github.com/coder/websocket/wsjson"
	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

type fakeHeartbeatConnection struct {
	pinged chan struct{}
	err    error
}

func (c *fakeHeartbeatConnection) Ping(context.Context) error {
	select {
	case c.pinged <- struct{}{}:
	default:
	}
	return c.err
}

func TestRunHeartbeat(t *testing.T) {
	t.Parallel()

	t.Run("stops when canceled", func(t *testing.T) {
		ctx, cancel := context.WithCancel(context.Background())
		conn := &fakeHeartbeatConnection{pinged: make(chan struct{}, 1)}
		done := make(chan error, 1)
		go func() {
			done <- runHeartbeat(ctx, conn, time.Millisecond, time.Second)
		}()

		select {
		case <-conn.pinged:
		case <-time.After(time.Second):
			t.Fatal("heartbeat did not ping")
		}
		cancel()

		select {
		case err := <-done:
			require.NoError(t, err)
		case <-time.After(time.Second):
			t.Fatal("heartbeat did not stop after cancellation")
		}
	})

	t.Run("returns ping errors", func(t *testing.T) {
		expectedErr := errors.New("ping failed")
		conn := &fakeHeartbeatConnection{
			pinged: make(chan struct{}, 1),
			err:    expectedErr,
		}
		done := make(chan error, 1)
		go func() {
			done <- runHeartbeat(context.Background(), conn, time.Millisecond, time.Second)
		}()

		select {
		case err := <-done:
			require.ErrorIs(t, err, expectedErr)
		case <-time.After(time.Second):
			t.Fatal("heartbeat did not return the ping error")
		}
	})
}

func TestLiveSessionHubPasswordCapacityAndLifecycle(t *testing.T) {
	t.Parallel()

	hub := New(Options{})
	instanceID := uuid.New()
	room, err := hub.create(instanceID, "secret")
	require.NoError(t, err)
	require.NotEmpty(t, room.passwordHash)
	require.NotEqual(t, "secret", string(room.passwordHash))

	_, _, err = hub.join(room.code, "wrong")
	require.ErrorIs(t, err, errInvalidPassword)
	_, gotInstanceID, err := hub.join(room.code, "secret")
	require.NoError(t, err)
	require.Equal(t, instanceID, gotInstanceID)

	capacityRoom, err := hub.create(instanceID, "")
	require.NoError(t, err)
	for range maxParticipants - 1 {
		_, gotInstanceID, err = hub.join(strings.ToLower(capacityRoom.code), "")
		require.NoError(t, err)
		require.Equal(t, instanceID, gotInstanceID)
	}
	_, _, err = hub.join(capacityRoom.code, "")
	require.ErrorIs(t, err, errFull)

	connection, _, err := hub.attach(capacityRoom.code, capacityRoom.leaderToken, nil)
	require.NoError(t, err)
	hub.disconnect(connection)

	_, _, err = hub.join(capacityRoom.code, "")
	require.ErrorIs(t, err, errNotFound)
}

func TestLiveSessionJoinUsesAuthenticatedUsernameWithCollisionSuffix(t *testing.T) {
	t.Parallel()

	userID := uuid.New()
	service := New(Options{
		ResolveUsername: func(_ context.Context, gotUserID uuid.UUID) (string, error) {
			require.Equal(t, userID, gotUserID)
			return "Emyrk", nil
		},
	})
	room, err := service.create(uuid.New(), "")
	require.NoError(t, err)

	router := chi.NewRouter()
	router.Post("/api/v1/live-sessions/{code}/join", service.Join)
	join := func(authenticated bool) string {
		t.Helper()
		req := httptest.NewRequest(http.MethodPost, "/api/v1/live-sessions/"+room.code+"/join", strings.NewReader(`{}`))
		if authenticated {
			req = req.WithContext(chronauth.WithClaims(req.Context(), &claims.Claims{Subject: userID}))
		}
		res := httptest.NewRecorder()
		router.ServeHTTP(res, req)
		require.Equal(t, http.StatusOK, res.Code)
		var joined chroniclesdk.JoinLiveSessionResponse
		require.NoError(t, json.NewDecoder(res.Body).Decode(&joined))

		service.mu.Lock()
		participantID := room.participants[joined.ParticipantToken].id
		service.mu.Unlock()
		return participantID
	}

	require.Equal(t, "user:Emyrk", join(true))
	require.Equal(t, "user:Emyrk-2", join(true))
	require.NotContains(t, join(false), "user:")
}

func TestLiveSessionHubCleansExpiredReservationsAndUnstartedRooms(t *testing.T) {
	t.Parallel()

	hub := New(Options{})
	room, err := hub.create(uuid.New(), "")
	require.NoError(t, err)
	peer, _, err := hub.join(room.code, "")
	require.NoError(t, err)

	hub.mu.Lock()
	peer.reservedAt = time.Now().Add(-joinReservationTTL - time.Second)
	hub.mu.Unlock()

	_, _, err = hub.join(room.code, "")
	require.NoError(t, err)
	hub.mu.Lock()
	_, staleReservationExists := room.participants[peer.token]
	hub.mu.Unlock()
	require.False(t, staleReservationExists)

	staleRoom, err := hub.create(uuid.New(), "")
	require.NoError(t, err)
	hub.mu.Lock()
	staleRoom.createdAt = time.Now().Add(-unstartedRoomTTL - time.Second)
	hub.mu.Unlock()
	_, err = hub.create(uuid.New(), "")
	require.NoError(t, err)
	hub.mu.Lock()
	_, staleRoomExists := hub.rooms[staleRoom.code]
	hub.mu.Unlock()
	require.False(t, staleRoomExists)
}

func TestLiveSessionHandlers(t *testing.T) {
	t.Parallel()

	accessURL, err := url.Parse("https://chronicle.example.com")
	require.NoError(t, err)
	service := New(Options{AccessURL: accessURL})
	instanceID := uuid.New()

	createReq := httptest.NewRequest(http.MethodPost, "/api/v1/live-sessions", strings.NewReader(`{"instance_id":"`+instanceID.String()+`","password":"secret"}`))
	createRes := httptest.NewRecorder()
	service.Create(createRes, createReq)
	require.Equal(t, http.StatusCreated, createRes.Code)
	var created chroniclesdk.CreateLiveSessionResponse
	require.NoError(t, json.NewDecoder(createRes.Body).Decode(&created))
	require.NotEmpty(t, created.Code)
	require.NotEmpty(t, created.LeaderToken)
	require.Equal(t, "https://chronicle.example.com/instances/"+instanceID.String()+"?live="+created.Code, created.URL)

	joinRouter := chi.NewRouter()
	joinRouter.Post("/api/v1/live-sessions/{code}/join", service.Join)

	wrongReq := httptest.NewRequest(http.MethodPost, "/api/v1/live-sessions/"+strings.ToLower(created.Code)+"/join", strings.NewReader(`{"password":"wrong"}`))
	wrongRes := httptest.NewRecorder()
	joinRouter.ServeHTTP(wrongRes, wrongReq)
	require.Equal(t, http.StatusForbidden, wrongRes.Code)

	joinReq := httptest.NewRequest(http.MethodPost, "/api/v1/live-sessions/"+created.Code+"/join", strings.NewReader(`{"password":"secret"}`))
	joinRes := httptest.NewRecorder()
	joinRouter.ServeHTTP(joinRes, joinReq)
	require.Equal(t, http.StatusOK, joinRes.Code)
	var joined chroniclesdk.JoinLiveSessionResponse
	require.NoError(t, json.NewDecoder(joinRes.Body).Decode(&joined))
	require.NotEmpty(t, joined.ParticipantToken)
	require.Equal(t, instanceID, joined.InstanceID)
}

func TestLiveSessionWebSocketRoutingAndLeaderDisconnect(t *testing.T) {
	t.Parallel()

	service := New(Options{})
	room, err := service.create(uuid.New(), "")
	require.NoError(t, err)
	participant, _, err := service.join(room.code, "")
	require.NoError(t, err)

	router := chi.NewRouter()
	router.Get("/api/v1/live-sessions/{code}/ws", service.WebSocket)
	server := httptest.NewServer(router)
	t.Cleanup(server.Close)

	dial := func(t *testing.T, token string) *websocket.Conn {
		t.Helper()
		wsURL := "ws" + strings.TrimPrefix(server.URL, "http") + "/api/v1/live-sessions/" + room.code + "/ws?token=" + url.QueryEscape(token)
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		conn, response, err := websocket.Dial(ctx, wsURL, nil)
		if response != nil && response.Body != nil {
			t.Cleanup(func() { _ = response.Body.Close() })
		}
		require.NoError(t, err)
		t.Cleanup(func() { _ = conn.CloseNow() })
		return conn
	}
	read := func(t *testing.T, conn *websocket.Conn) serverMessage {
		t.Helper()
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		var message serverMessage
		require.NoError(t, wsjson.Read(ctx, conn, &message))
		return message
	}
	write := func(t *testing.T, conn *websocket.Conn, message clientMessage) {
		t.Helper()
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		require.NoError(t, wsjson.Write(ctx, conn, message))
	}

	leaderConn := dial(t, room.leaderToken)
	participantConn := dial(t, participant.token)

	joined := read(t, leaderConn)
	require.Equal(t, "participant_joined", joined.Type)
	require.Equal(t, participant.id, joined.ParticipantID)

	guestPayload := json.RawMessage(`{"sdp":"guest-offer"}`)
	write(t, participantConn, clientMessage{Type: "signal", Payload: guestPayload})
	toLeader := read(t, leaderConn)
	require.Equal(t, "signal", toLeader.Type)
	require.Equal(t, participant.id, toLeader.ParticipantID)
	require.JSONEq(t, string(guestPayload), string(toLeader.Payload))

	leaderPayload := json.RawMessage(`{"candidate":"leader-candidate"}`)
	write(t, leaderConn, clientMessage{Type: "signal", TargetID: participant.id, Payload: leaderPayload})
	toParticipant := read(t, participantConn)
	require.Equal(t, "signal", toParticipant.Type)
	require.Equal(t, leaderID, toParticipant.ParticipantID)
	require.JSONEq(t, string(leaderPayload), string(toParticipant.Payload))

	require.NoError(t, participantConn.Close(websocket.StatusNormalClosure, ""))
	left := read(t, leaderConn)
	require.Equal(t, "participant_left", left.Type)
	require.Equal(t, participant.id, left.ParticipantID)

	participant2, _, err := service.join(room.code, "")
	require.NoError(t, err)
	participant2Conn := dial(t, participant2.token)
	joined = read(t, leaderConn)
	require.Equal(t, "participant_joined", joined.Type)
	require.Equal(t, participant2.id, joined.ParticipantID)

	require.NoError(t, leaderConn.Close(websocket.StatusNormalClosure, ""))
	ended := read(t, participant2Conn)
	require.Equal(t, "session_ended", ended.Type)
	require.Equal(t, "leader_disconnected", ended.Reason)
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	var terminal serverMessage
	err = wsjson.Read(ctx, participant2Conn, &terminal)
	require.Error(t, err, "session_ended must be the terminal message")

	_, _, err = service.join(room.code, "")
	require.ErrorIs(t, err, errNotFound)
}
