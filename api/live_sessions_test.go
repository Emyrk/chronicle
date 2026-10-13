package api

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
	"time"

	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/gorilla/websocket"
	"github.com/stretchr/testify/require"
)

func TestLiveSessionHubPasswordCapacityAndLifecycle(t *testing.T) {
	t.Parallel()

	hub := newLiveSessionHub()
	instanceID := uuid.New()
	room, err := hub.create(instanceID, "secret")
	require.NoError(t, err)
	require.NotEmpty(t, room.passwordHash)
	require.NotEqual(t, "secret", string(room.passwordHash))

	_, _, err = hub.join(room.code, "wrong")
	require.ErrorIs(t, err, errLiveSessionInvalidPassword)
	_, gotInstanceID, err := hub.join(room.code, "secret")
	require.NoError(t, err)
	require.Equal(t, instanceID, gotInstanceID)

	capacityRoom, err := hub.create(instanceID, "")
	require.NoError(t, err)
	for range liveSessionMaxParticipants - 1 {
		_, gotInstanceID, err = hub.join(strings.ToLower(capacityRoom.code), "")
		require.NoError(t, err)
		require.Equal(t, instanceID, gotInstanceID)
	}
	_, _, err = hub.join(capacityRoom.code, "")
	require.ErrorIs(t, err, errLiveSessionFull)

	connection, _, err := hub.attach(capacityRoom.code, capacityRoom.leaderToken, nil)
	require.NoError(t, err)
	hub.disconnect(connection)

	_, _, err = hub.join(capacityRoom.code, "")
	require.ErrorIs(t, err, errLiveSessionNotFound)
}

func TestLiveSessionHubCleansExpiredReservationsAndUnstartedRooms(t *testing.T) {
	t.Parallel()

	hub := newLiveSessionHub()
	room, err := hub.create(uuid.New(), "")
	require.NoError(t, err)
	peer, _, err := hub.join(room.code, "")
	require.NoError(t, err)

	hub.mu.Lock()
	peer.reservedAt = time.Now().Add(-liveSessionJoinReservationTTL - time.Second)
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
	staleRoom.createdAt = time.Now().Add(-liveSessionUnstartedRoomTTL - time.Second)
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
	api := &API{Opts: &Options{AccessURL: accessURL}, liveSessions: newLiveSessionHub()}
	instanceID := uuid.New()

	createReq := httptest.NewRequest(http.MethodPost, "/api/v1/live-sessions", strings.NewReader(`{"instance_id":"`+instanceID.String()+`","password":"secret"}`))
	createRes := httptest.NewRecorder()
	api.CreateLiveSession(createRes, createReq)
	require.Equal(t, http.StatusCreated, createRes.Code)
	var created chroniclesdk.CreateLiveSessionResponse
	require.NoError(t, json.NewDecoder(createRes.Body).Decode(&created))
	require.NotEmpty(t, created.Code)
	require.NotEmpty(t, created.LeaderToken)
	require.Equal(t, "https://chronicle.example.com/instances/"+instanceID.String()+"?live="+created.Code, created.URL)

	joinRouter := chi.NewRouter()
	joinRouter.Post("/api/v1/live-sessions/{code}/join", api.JoinLiveSession)

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

	api := &API{liveSessions: newLiveSessionHub()}
	room, err := api.liveSessions.create(uuid.New(), "")
	require.NoError(t, err)
	participant, _, err := api.liveSessions.join(room.code, "")
	require.NoError(t, err)

	router := chi.NewRouter()
	router.Get("/api/v1/live-sessions/{code}/ws", api.LiveSessionWebSocket)
	server := httptest.NewServer(router)
	t.Cleanup(server.Close)

	dial := func(t *testing.T, token string) *websocket.Conn {
		t.Helper()
		wsURL := "ws" + strings.TrimPrefix(server.URL, "http") + "/api/v1/live-sessions/" + room.code + "/ws?token=" + url.QueryEscape(token)
		conn, response, err := websocket.DefaultDialer.Dial(wsURL, nil)
		if response != nil {
			t.Cleanup(func() { _ = response.Body.Close() })
		}
		require.NoError(t, err)
		t.Cleanup(func() { _ = conn.Close() })
		return conn
	}
	read := func(t *testing.T, conn *websocket.Conn) liveSessionServerMessage {
		t.Helper()
		require.NoError(t, conn.SetReadDeadline(time.Now().Add(5*time.Second)))
		var message liveSessionServerMessage
		require.NoError(t, conn.ReadJSON(&message))
		return message
	}

	leaderConn := dial(t, room.leaderToken)
	participantConn := dial(t, participant.token)

	joined := read(t, leaderConn)
	require.Equal(t, "participant_joined", joined.Type)
	require.Equal(t, participant.id, joined.ParticipantID)

	guestPayload := json.RawMessage(`{"sdp":"guest-offer"}`)
	require.NoError(t, participantConn.WriteJSON(liveSessionClientMessage{Type: "signal", Payload: guestPayload}))
	toLeader := read(t, leaderConn)
	require.Equal(t, "signal", toLeader.Type)
	require.Equal(t, participant.id, toLeader.ParticipantID)
	require.JSONEq(t, string(guestPayload), string(toLeader.Payload))

	leaderPayload := json.RawMessage(`{"candidate":"leader-candidate"}`)
	require.NoError(t, leaderConn.WriteJSON(liveSessionClientMessage{Type: "signal", TargetID: participant.id, Payload: leaderPayload}))
	toParticipant := read(t, participantConn)
	require.Equal(t, "signal", toParticipant.Type)
	require.Equal(t, liveSessionLeaderID, toParticipant.ParticipantID)
	require.JSONEq(t, string(leaderPayload), string(toParticipant.Payload))

	require.NoError(t, participantConn.Close())
	left := read(t, leaderConn)
	require.Equal(t, "participant_left", left.Type)
	require.Equal(t, participant.id, left.ParticipantID)

	participant2, _, err := api.liveSessions.join(room.code, "")
	require.NoError(t, err)
	participant2Conn := dial(t, participant2.token)
	joined = read(t, leaderConn)
	require.Equal(t, "participant_joined", joined.Type)
	require.Equal(t, participant2.id, joined.ParticipantID)

	require.NoError(t, leaderConn.Close())
	ended := read(t, participant2Conn)
	require.Equal(t, "session_ended", ended.Type)
	require.Equal(t, "leader_disconnected", ended.Reason)
	require.NoError(t, participant2Conn.SetReadDeadline(time.Now().Add(5*time.Second)))
	_, _, err = participant2Conn.ReadMessage()
	require.Error(t, err, "session_ended must be the terminal message")

	_, _, err = api.liveSessions.join(room.code, "")
	require.ErrorIs(t, err, errLiveSessionNotFound)
}
