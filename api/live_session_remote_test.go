package api

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/Emyrk/chronicle/api/chronauth"
	"github.com/Emyrk/chronicle/api/chronauth/claims"
	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/internal/services/servicelivesession"
	"github.com/coder/websocket"
	"github.com/coder/websocket/wsjson"
	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

func TestLiveSessionRemoteConfiguration(t *testing.T) {
	t.Parallel()
	parse := func(s string) *url.URL { u, err := url.Parse(s); require.NoError(t, err); return u }
	remote, err := newLiveSessionRemote(nil, nil, "", nil)
	require.NoError(t, err)
	require.Nil(t, remote)
	for _, tc := range []struct {
		private, public, secret string
	}{
		{private: "http://localhost:8081", public: "https://live.example.com"},
		{private: "http://localhost:8081", secret: "key"},
		{public: "https://live.example.com", secret: "key"},
		{private: "file:///tmp/private", public: "https://live.example.com", secret: "key"},
	} {
		var private, public *url.URL
		if tc.private != "" {
			private = parse(tc.private)
		}
		if tc.public != "" {
			public = parse(tc.public)
		}
		_, err := newLiveSessionRemote(private, public, tc.secret, nil)
		require.Error(t, err)
	}
}

func TestLiveSessionRemoteRejectsInvalidCodeBeforePrivateRequest(t *testing.T) {
	t.Parallel()
	privateURL, err := url.Parse("http://127.0.0.1:1")
	require.NoError(t, err)
	publicURL, err := url.Parse("https://live.example.com")
	require.NoError(t, err)
	remote, err := newLiveSessionRemote(privateURL, publicURL, "secret", nil)
	require.NoError(t, err)
	router := chi.NewRouter()
	router.Post("/api/v1/live-sessions/{code}/join", remote.Join)
	response := httptest.NewRecorder()
	router.ServeHTTP(response, httptest.NewRequest(http.MethodPost, "/api/v1/live-sessions/AAAA-AAA/join", strings.NewReader(`{}`)))
	require.Equal(t, http.StatusNotFound, response.Code)
}

func TestLiveSessionRemoteAgainstDedicatedService(t *testing.T) {
	t.Parallel()
	accessURL, err := url.Parse("https://chronicle.example")
	require.NoError(t, err)
	signaling := servicelivesession.New(servicelivesession.Options{
		AccessURL: accessURL, OriginPatterns: []string{"https://chronicle.example"},
	})
	defer signaling.Close()
	private := httptest.NewServer(signaling.PrivateHandler("shared-secret"))
	defer private.Close()
	public := httptest.NewServer(signaling.PublicHandler())
	defer public.Close()
	privateURL, err := url.Parse(private.URL)
	require.NoError(t, err)
	publicURL, err := url.Parse(public.URL)
	require.NoError(t, err)
	remote, err := newLiveSessionRemote(privateURL, publicURL, "shared-secret", nil)
	require.NoError(t, err)
	instanceID := uuid.New()
	create := httptest.NewRecorder()
	remote.Create(create, httptest.NewRequest(http.MethodPost, "/api/v1/live-sessions", strings.NewReader(`{"instance_id":"`+instanceID.String()+`"}`)))
	require.Equal(t, http.StatusCreated, create.Code)
	var created chroniclesdk.CreateLiveSessionResponse
	require.NoError(t, json.NewDecoder(create.Body).Decode(&created))
	require.Equal(t, "ws://"+publicURL.Host+"/api/v1/live-sessions/"+created.Code+"/ws", created.WebSocketURL)

	router := chi.NewRouter()
	router.Post("/api/v1/live-sessions/{code}/join", remote.Join)
	join := httptest.NewRecorder()
	router.ServeHTTP(join, httptest.NewRequest(http.MethodPost, "/api/v1/live-sessions/"+created.Code+"/join", strings.NewReader(`{}`)))
	require.Equal(t, http.StatusOK, join.Code)
	var joined chroniclesdk.JoinLiveSessionResponse
	require.NoError(t, json.NewDecoder(join.Body).Decode(&joined))
	require.Equal(t, created.WebSocketURL, joined.WebSocketURL)

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	dial := func(token string) *websocket.Conn {
		t.Helper()
		conn, _, err := websocket.Dial(ctx, created.WebSocketURL+"?token="+url.QueryEscape(token), &websocket.DialOptions{
			HTTPHeader: http.Header{"Origin": []string{"https://chronicle.example"}},
		})
		require.NoError(t, err)
		return conn
	}
	leader := dial(created.LeaderToken)
	defer func() { _ = leader.CloseNow() }()
	guest := dial(joined.ParticipantToken)
	defer func() { _ = guest.CloseNow() }()
	var notice struct {
		Type string `json:"type"`
	}
	require.NoError(t, wsjson.Read(ctx, leader, &notice))
	require.Equal(t, "participant_joined", notice.Type)
}

func TestLiveSessionRemoteCreateAndJoin(t *testing.T) {
	t.Parallel()
	instanceID, userID := uuid.New(), uuid.New()
	const code = "ABCDEFGH"
	const key = "private-test-key"
	var requests atomic.Int32
	private := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requests.Add(1)
		require.Equal(t, "Bearer "+key, r.Header.Get("Authorization"))
		require.Equal(t, http.MethodPost, r.Method)
		switch r.URL.Path {
		case "/internal/live-sessions":
			var payload chroniclesdk.CreateLiveSessionRequest
			require.NoError(t, json.NewDecoder(r.Body).Decode(&payload))
			require.Equal(t, instanceID, payload.InstanceID)
			w.WriteHeader(http.StatusCreated)
			require.NoError(t, json.NewEncoder(w).Encode(chroniclesdk.CreateLiveSessionResponse{Code: code, LeaderToken: "leader", URL: "https://chronicle.example.com/instances/" + instanceID.String() + "?live=" + code}))
		case "/internal/live-sessions/" + code + "/join":
			var payload struct {
				Password string `json:"password"`
				Username string `json:"username"`
			}
			require.NoError(t, json.NewDecoder(r.Body).Decode(&payload))
			require.Equal(t, "secret", payload.Password)
			require.Equal(t, "player", payload.Username)
			require.NoError(t, json.NewEncoder(w).Encode(chroniclesdk.JoinLiveSessionResponse{ParticipantToken: "guest", InstanceID: instanceID}))
		default:
			t.Errorf("unexpected private request: %s", r.URL.Path)
			w.WriteHeader(http.StatusNotFound)
		}
	}))
	defer private.Close()
	privateURL, err := url.Parse(private.URL)
	require.NoError(t, err)
	publicURL, err := url.Parse("https://live.example.com")
	require.NoError(t, err)
	remote, err := newLiveSessionRemote(privateURL, publicURL, key, func(_ context.Context, got uuid.UUID) (string, error) {
		require.Equal(t, userID, got)
		return "player", nil
	})
	require.NoError(t, err)
	create := httptest.NewRecorder()
	remote.Create(create, httptest.NewRequest(http.MethodPost, "/api/v1/live-sessions", strings.NewReader(`{"instance_id":"`+instanceID.String()+`"}`)))
	require.Equal(t, http.StatusCreated, create.Code)
	var created chroniclesdk.CreateLiveSessionResponse
	require.NoError(t, json.NewDecoder(create.Body).Decode(&created))
	require.Equal(t, "wss://live.example.com/api/v1/live-sessions/"+code+"/ws", created.WebSocketURL)

	router := chi.NewRouter()
	router.Post("/api/v1/live-sessions/{code}/join", remote.Join)
	joinReq := httptest.NewRequest(http.MethodPost, "/api/v1/live-sessions/"+strings.ToLower(code)+"/join", strings.NewReader(`{"password":"secret"}`))
	joinReq = joinReq.WithContext(chronauth.WithClaims(joinReq.Context(), &claims.Claims{Subject: userID}))
	join := httptest.NewRecorder()
	router.ServeHTTP(join, joinReq)
	require.Equal(t, http.StatusOK, join.Code)
	var joined chroniclesdk.JoinLiveSessionResponse
	require.NoError(t, json.NewDecoder(join.Body).Decode(&joined))
	require.Equal(t, "guest", joined.ParticipantToken)
	require.Equal(t, created.WebSocketURL, joined.WebSocketURL)
	require.EqualValues(t, 2, requests.Load())
}
