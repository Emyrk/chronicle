package servicelivesession

import (
	"context"
	"errors"
	"net/http"
	"net/url"
	"path"
	"strings"
	"time"

	"github.com/Emyrk/chronicle/api/chronauth"
	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/api/httpapi"
	"github.com/coder/websocket"
	"github.com/coder/websocket/wsjson"
	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
)

type heartbeatConnection interface {
	Ping(context.Context) error
}

func runHeartbeat(ctx context.Context, conn heartbeatConnection, interval, timeout time.Duration) error {
	ticker := time.NewTicker(interval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return nil
		case <-ticker.C:
			pingCtx, cancel := context.WithTimeout(ctx, timeout)
			err := conn.Ping(pingCtx)
			cancel()
			if err != nil {
				if ctx.Err() != nil {
					return nil
				}
				return err
			}
		}
	}
}

// Create creates an ephemeral room for an authenticated leader.
func (s *Service) Create(w http.ResponseWriter, r *http.Request) {
	var req chroniclesdk.CreateLiveSessionRequest
	if !httpapi.Read(r.Context(), w, r, &req) {
		return
	}
	if req.InstanceID == uuid.Nil {
		httpapi.Write(r.Context(), w, http.StatusBadRequest, chroniclesdk.Response{Message: "instance_id is required."})
		return
	}

	room, err := s.create(req.InstanceID, req.Password)
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}
	liveURL := s.accessURL.ResolveReference(&url.URL{
		Path:     "/instances/" + room.instanceID.String(),
		RawQuery: "live=" + url.QueryEscape(room.code),
	}).String()
	httpapi.Write(r.Context(), w, http.StatusCreated, chroniclesdk.CreateLiveSessionResponse{
		Code:        room.code,
		LeaderToken: room.leaderToken,
		URL:         liveURL,
	})
}

// Join reserves a participant slot and returns its credentials.
func (s *Service) Join(w http.ResponseWriter, r *http.Request) {
	var req chroniclesdk.JoinLiveSessionRequest
	if !httpapi.Read(r.Context(), w, r, &req) {
		return
	}

	username := ""
	if claims, authenticated := chronauth.AuthenticatedClaims(r.Context()); authenticated && s.resolveUsername != nil {
		var err error
		username, err = s.resolveUsername(r.Context(), claims.Subject)
		if err != nil {
			httpapi.InternalServerError(w, err)
			return
		}
	}

	peer, instanceID, err := s.joinAs(chi.URLParam(r, "code"), req.Password, username)
	if err != nil {
		switch {
		case errors.Is(err, errNotFound):
			httpapi.Write(r.Context(), w, http.StatusNotFound, chroniclesdk.Response{Message: "Live session not found."})
		case errors.Is(err, errInvalidPassword):
			httpapi.Write(r.Context(), w, http.StatusForbidden, chroniclesdk.Response{Message: "Incorrect live session password."})
		case errors.Is(err, errFull):
			httpapi.Write(r.Context(), w, http.StatusConflict, chroniclesdk.Response{Message: "Live session is full."})
		default:
			httpapi.InternalServerError(w, err)
		}
		return
	}

	httpapi.Write(r.Context(), w, http.StatusOK, chroniclesdk.JoinLiveSessionResponse{
		ParticipantToken: peer.token,
		InstanceID:       instanceID,
	})
}

// WebSocket relays WebRTC signaling messages for a live session.
func (s *Service) WebSocket(w http.ResponseWriter, r *http.Request) {
	code := chi.URLParam(r, "code")
	token := r.URL.Query().Get("token")
	if token == "" {
		httpapi.Write(r.Context(), w, http.StatusUnauthorized, chroniclesdk.Response{Message: "Live session token is required."})
		return
	}

	// Validate before accepting so invalid tokens receive an HTTP error. The real
	// attachment happens immediately after acceptance while the service lock serializes it.
	exists, validToken := s.validateToken(code, token)
	if !exists {
		httpapi.Write(r.Context(), w, http.StatusNotFound, chroniclesdk.Response{Message: "Live session not found."})
		return
	}
	if !validToken {
		httpapi.Write(r.Context(), w, http.StatusUnauthorized, chroniclesdk.Response{Message: "Invalid live session token."})
		return
	}

	var acceptOptions *websocket.AcceptOptions
	if len(s.originPatterns) > 0 {
		origin := r.Header.Get("Origin")
		allowed := false
		for _, pattern := range s.originPatterns {
			if matched, _ := path.Match(strings.ToLower(pattern), strings.ToLower(origin)); matched {
				allowed = true
				break
			}
		}
		if !allowed {
			httpapi.Write(r.Context(), w, http.StatusForbidden, chroniclesdk.Response{Message: "Live session origin is not allowed."})
			return
		}
		acceptOptions = &websocket.AcceptOptions{OriginPatterns: s.originPatterns}
	}
	conn, err := websocket.Accept(w, r, acceptOptions)
	if err != nil {
		return
	}
	defer func() { _ = conn.CloseNow() }()
	conn.SetReadLimit(maxMessageBytes)

	connection, notifyPeers, err := s.attach(code, token, conn)
	if err != nil {
		_ = conn.Close(websocket.StatusPolicyViolation, err.Error())
		return
	}
	defer s.disconnect(connection)

	heartbeatCtx, stopHeartbeat := context.WithCancel(r.Context())
	defer stopHeartbeat()
	go func() {
		if err := runHeartbeat(heartbeatCtx, conn, heartbeatInterval, heartbeatTimeout); err != nil {
			_ = conn.CloseNow()
		}
	}()

	if connection.role == leaderID {
		for _, guest := range notifyPeers {
			_ = connection.peer.writeJSON(serverMessage{Type: "participant_joined", ParticipantID: guest.id})
		}
	} else {
		for _, leader := range notifyPeers {
			_ = leader.writeJSON(serverMessage{Type: "participant_joined", ParticipantID: connection.peer.id})
		}
	}

	for {
		var message clientMessage
		if err := wsjson.Read(context.Background(), conn, &message); err != nil {
			return
		}
		if err := s.relay(connection, message); err != nil {
			_ = conn.Close(websocket.StatusPolicyViolation, err.Error())
			return
		}
	}
}
