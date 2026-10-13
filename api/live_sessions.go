package api

import (
	"encoding/json"
	"errors"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"

	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/api/httpapi"
	"github.com/Emyrk/chronicle/internal/cryptorand"
	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/gorilla/websocket"
	"golang.org/x/crypto/bcrypt"
)

const (
	liveSessionCodeLength          = 8
	liveSessionTokenLength         = 32
	liveSessionParticipantIDLength = 12
	liveSessionMaxParticipants     = 40
	liveSessionMaxMessageBytes     = 64 << 10
	liveSessionJoinReservationTTL  = 2 * time.Minute
	liveSessionUnstartedRoomTTL    = 10 * time.Minute
	liveSessionLeaderID            = "leader"
)

var (
	errLiveSessionNotFound         = errors.New("live session not found")
	errLiveSessionInvalidPassword  = errors.New("invalid live session password")
	errLiveSessionFull             = errors.New("live session is full")
	errLiveSessionInvalidToken     = errors.New("invalid live session token")
	errLiveSessionAlreadyConnected = errors.New("live session token is already connected")
)

type liveSessionHub struct {
	mu    sync.Mutex
	rooms map[string]*liveSession
}

type liveSession struct {
	code             string
	instanceID       uuid.UUID
	passwordHash     []byte
	leaderToken      string
	leader           *liveSessionPeer
	participants     map[string]*liveSessionPeer
	participantsByID map[string]*liveSessionPeer
	createdAt        time.Time
}

type liveSessionPeer struct {
	id         string
	token      string
	conn       *websocket.Conn
	reservedAt time.Time
	writeMu    sync.Mutex
}

type liveSessionClientMessage struct {
	Type     string          `json:"type"`
	TargetID string          `json:"target_id,omitempty"`
	Payload  json.RawMessage `json:"payload"`
}

type liveSessionServerMessage struct {
	Type          string          `json:"type"`
	ParticipantID string          `json:"participant_id,omitempty"`
	Reason        string          `json:"reason,omitempty"`
	Payload       json.RawMessage `json:"payload,omitempty"`
}

type liveSessionConnection struct {
	room *liveSession
	peer *liveSessionPeer
	role string
}

func newLiveSessionHub() *liveSessionHub {
	return &liveSessionHub{rooms: make(map[string]*liveSession)}
}

func (h *liveSessionHub) cleanupLocked(now time.Time) {
	for code, room := range h.rooms {
		hasConnectedParticipant := false
		for _, peer := range room.participants {
			if peer.conn != nil {
				hasConnectedParticipant = true
				break
			}
		}
		if room.leader == nil && !hasConnectedParticipant && now.Sub(room.createdAt) >= liveSessionUnstartedRoomTTL {
			delete(h.rooms, code)
			continue
		}
		for token, peer := range room.participants {
			if peer.conn == nil && now.Sub(peer.reservedAt) >= liveSessionJoinReservationTTL {
				delete(room.participants, token)
				delete(room.participantsByID, peer.id)
			}
		}
	}
}

func (h *liveSessionHub) create(instanceID uuid.UUID, password string) (*liveSession, error) {
	var passwordHash []byte
	var err error
	if password != "" {
		passwordHash, err = bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
		if err != nil {
			return nil, err
		}
	}

	leaderToken, err := cryptorand.String(liveSessionTokenLength)
	if err != nil {
		return nil, err
	}

	for {
		code, err := cryptorand.StringCharset(cryptorand.Human, liveSessionCodeLength)
		if err != nil {
			return nil, err
		}
		code = strings.ToUpper(code)

		h.mu.Lock()
		h.cleanupLocked(time.Now())
		if _, exists := h.rooms[code]; !exists {
			room := &liveSession{
				code:             code,
				instanceID:       instanceID,
				passwordHash:     passwordHash,
				leaderToken:      leaderToken,
				participants:     make(map[string]*liveSessionPeer),
				participantsByID: make(map[string]*liveSessionPeer),
				createdAt:        time.Now(),
			}
			h.rooms[code] = room
			h.mu.Unlock()
			return room, nil
		}
		h.mu.Unlock()
	}
}

func (h *liveSessionHub) join(code, password string) (*liveSessionPeer, uuid.UUID, error) {
	code = strings.ToUpper(code)

	h.mu.Lock()
	defer h.mu.Unlock()

	h.cleanupLocked(time.Now())
	room, ok := h.rooms[code]
	if !ok {
		return nil, uuid.Nil, errLiveSessionNotFound
	}
	if len(room.passwordHash) > 0 && bcrypt.CompareHashAndPassword(room.passwordHash, []byte(password)) != nil {
		return nil, uuid.Nil, errLiveSessionInvalidPassword
	}
	// Capacity includes the leader.
	if len(room.participants)+1 >= liveSessionMaxParticipants {
		return nil, uuid.Nil, errLiveSessionFull
	}

	for {
		token, err := cryptorand.String(liveSessionTokenLength)
		if err != nil {
			return nil, uuid.Nil, err
		}
		participantID, err := cryptorand.StringCharset(cryptorand.Human, liveSessionParticipantIDLength)
		if err != nil {
			return nil, uuid.Nil, err
		}
		if _, exists := room.participants[token]; exists {
			continue
		}
		if _, exists := room.participantsByID[participantID]; exists {
			continue
		}

		peer := &liveSessionPeer{id: participantID, token: token, reservedAt: time.Now()}
		room.participants[token] = peer
		room.participantsByID[participantID] = peer
		return peer, room.instanceID, nil
	}
}

func (h *liveSessionHub) attach(code, token string, conn *websocket.Conn) (*liveSessionConnection, []*liveSessionPeer, error) {
	code = strings.ToUpper(code)

	h.mu.Lock()
	defer h.mu.Unlock()

	room, ok := h.rooms[code]
	if !ok {
		return nil, nil, errLiveSessionNotFound
	}
	if token == room.leaderToken {
		if room.leader != nil {
			return nil, nil, errLiveSessionAlreadyConnected
		}
		peer := &liveSessionPeer{id: liveSessionLeaderID, token: token, conn: conn}
		room.leader = peer
		connectedGuests := make([]*liveSessionPeer, 0, len(room.participants))
		for _, guest := range room.participants {
			if guest.conn != nil {
				connectedGuests = append(connectedGuests, guest)
			}
		}
		return &liveSessionConnection{room: room, peer: peer, role: liveSessionLeaderID}, connectedGuests, nil
	}

	peer, ok := room.participants[token]
	if !ok {
		return nil, nil, errLiveSessionInvalidToken
	}
	if peer.conn != nil {
		return nil, nil, errLiveSessionAlreadyConnected
	}
	peer.conn = conn
	var leader []*liveSessionPeer
	if room.leader != nil {
		leader = append(leader, room.leader)
	}
	return &liveSessionConnection{room: room, peer: peer, role: "participant"}, leader, nil
}

func (h *liveSessionHub) disconnect(connection *liveSessionConnection) {
	if connection.role == liveSessionLeaderID {
		h.end(connection)
		return
	}

	h.mu.Lock()
	room, exists := h.rooms[connection.room.code]
	if !exists || room != connection.room {
		h.mu.Unlock()
		return
	}
	peer, exists := room.participants[connection.peer.token]
	if !exists || peer != connection.peer {
		h.mu.Unlock()
		return
	}
	delete(room.participants, connection.peer.token)
	delete(room.participantsByID, connection.peer.id)
	leader := room.leader
	h.mu.Unlock()

	if leader != nil {
		_ = leader.writeJSON(liveSessionServerMessage{
			Type:          "participant_left",
			ParticipantID: connection.peer.id,
		})
	}
}

func (h *liveSessionHub) end(connection *liveSessionConnection) {
	h.mu.Lock()
	room, exists := h.rooms[connection.room.code]
	if !exists || room != connection.room || room.leader != connection.peer {
		h.mu.Unlock()
		return
	}
	delete(h.rooms, room.code)
	guests := make([]*liveSessionPeer, 0, len(room.participants))
	for _, guest := range room.participants {
		if guest.conn != nil {
			guests = append(guests, guest)
		}
	}
	h.mu.Unlock()

	message := liveSessionServerMessage{Type: "session_ended", Reason: "leader_disconnected"}
	for _, guest := range guests {
		_ = guest.writeJSON(message)
		guest.close()
	}
}

func (h *liveSessionHub) relay(connection *liveSessionConnection, message liveSessionClientMessage) error {
	if message.Type != "signal" || len(message.Payload) == 0 {
		return errors.New("invalid live session message")
	}

	h.mu.Lock()
	room, exists := h.rooms[connection.room.code]
	if !exists || room != connection.room {
		h.mu.Unlock()
		return errLiveSessionNotFound
	}

	var target *liveSessionPeer
	if connection.role == liveSessionLeaderID {
		if message.TargetID == "" {
			h.mu.Unlock()
			return errors.New("leader signal requires target_id")
		}
		target = room.participantsByID[message.TargetID]
	} else {
		if message.TargetID != "" {
			h.mu.Unlock()
			return errors.New("participant signal must not include target_id")
		}
		target = room.leader
	}
	if target == nil || target.conn == nil {
		h.mu.Unlock()
		return errors.New("signal target is not connected")
	}
	forwarded := liveSessionServerMessage{
		Type:          "signal",
		ParticipantID: connection.peer.id,
		Payload:       append(json.RawMessage(nil), message.Payload...),
	}
	h.mu.Unlock()

	return target.writeJSON(forwarded)
}

func (p *liveSessionPeer) writeJSON(message liveSessionServerMessage) error {
	p.writeMu.Lock()
	defer p.writeMu.Unlock()
	if p.conn == nil {
		return errors.New("live session peer is not connected")
	}
	_ = p.conn.SetWriteDeadline(time.Now().Add(5 * time.Second))
	return p.conn.WriteJSON(message)
}

func (p *liveSessionPeer) close() {
	p.writeMu.Lock()
	defer p.writeMu.Unlock()
	if p.conn != nil {
		_ = p.conn.Close()
	}
}

// CreateLiveSession creates an ephemeral room for an authenticated leader.
func (api *API) CreateLiveSession(w http.ResponseWriter, r *http.Request) {
	var req chroniclesdk.CreateLiveSessionRequest
	if !httpapi.Read(r.Context(), w, r, &req) {
		return
	}
	if req.InstanceID == uuid.Nil {
		httpapi.Write(r.Context(), w, http.StatusBadRequest, chroniclesdk.Response{Message: "instance_id is required."})
		return
	}

	room, err := api.liveSessions.create(req.InstanceID, req.Password)
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}
	liveURL := api.Opts.AccessURL.ResolveReference(&url.URL{
		Path:     "/instances/" + room.instanceID.String(),
		RawQuery: "live=" + url.QueryEscape(room.code),
	}).String()
	httpapi.Write(r.Context(), w, http.StatusCreated, chroniclesdk.CreateLiveSessionResponse{
		Code:        room.code,
		LeaderToken: room.leaderToken,
		URL:         liveURL,
	})
}

// JoinLiveSession reserves a participant slot and returns its credentials.
func (api *API) JoinLiveSession(w http.ResponseWriter, r *http.Request) {
	var req chroniclesdk.JoinLiveSessionRequest
	if !httpapi.Read(r.Context(), w, r, &req) {
		return
	}

	peer, instanceID, err := api.liveSessions.join(chi.URLParam(r, "code"), req.Password)
	if err != nil {
		switch {
		case errors.Is(err, errLiveSessionNotFound):
			httpapi.Write(r.Context(), w, http.StatusNotFound, chroniclesdk.Response{Message: "Live session not found."})
		case errors.Is(err, errLiveSessionInvalidPassword):
			httpapi.Write(r.Context(), w, http.StatusForbidden, chroniclesdk.Response{Message: "Incorrect live session password."})
		case errors.Is(err, errLiveSessionFull):
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

var liveSessionUpgrader = websocket.Upgrader{
	// The browser-only middleware validates the request origin before this handler.
	CheckOrigin: func(*http.Request) bool { return true },
}

// LiveSessionWebSocket relays WebRTC signaling messages for a live session.
func (api *API) LiveSessionWebSocket(w http.ResponseWriter, r *http.Request) {
	code := chi.URLParam(r, "code")
	token := r.URL.Query().Get("token")
	if token == "" {
		httpapi.Write(r.Context(), w, http.StatusUnauthorized, chroniclesdk.Response{Message: "Live session token is required."})
		return
	}

	// Validate before upgrade so invalid tokens receive an HTTP error. The real
	// attachment happens immediately after upgrade while the hub lock serializes it.
	api.liveSessions.mu.Lock()
	room, exists := api.liveSessions.rooms[strings.ToUpper(code)]
	validToken := exists && (room.leaderToken == token || room.participants[token] != nil)
	api.liveSessions.mu.Unlock()
	if !exists {
		httpapi.Write(r.Context(), w, http.StatusNotFound, chroniclesdk.Response{Message: "Live session not found."})
		return
	}
	if !validToken {
		httpapi.Write(r.Context(), w, http.StatusUnauthorized, chroniclesdk.Response{Message: "Invalid live session token."})
		return
	}

	conn, err := liveSessionUpgrader.Upgrade(w, r, nil)
	if err != nil {
		return
	}
	connection, notifyPeers, err := api.liveSessions.attach(code, token, conn)
	if err != nil {
		_ = conn.WriteControl(websocket.CloseMessage, websocket.FormatCloseMessage(websocket.ClosePolicyViolation, err.Error()), time.Now().Add(time.Second))
		_ = conn.Close()
		return
	}
	defer api.liveSessions.disconnect(connection)
	defer func() { _ = conn.Close() }()
	conn.SetReadLimit(liveSessionMaxMessageBytes)

	if connection.role == liveSessionLeaderID {
		for _, guest := range notifyPeers {
			_ = connection.peer.writeJSON(liveSessionServerMessage{Type: "participant_joined", ParticipantID: guest.id})
		}
	} else {
		for _, leader := range notifyPeers {
			_ = leader.writeJSON(liveSessionServerMessage{Type: "participant_joined", ParticipantID: connection.peer.id})
		}
	}

	for {
		var message liveSessionClientMessage
		if err := conn.ReadJSON(&message); err != nil {
			return
		}
		if err := api.liveSessions.relay(connection, message); err != nil {
			_ = conn.WriteControl(websocket.CloseMessage, websocket.FormatCloseMessage(websocket.ClosePolicyViolation, err.Error()), time.Now().Add(time.Second))
			return
		}
	}
}
