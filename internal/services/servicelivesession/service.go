package servicelivesession

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/url"
	"strings"
	"sync"
	"time"

	"github.com/Emyrk/chronicle/internal/cryptorand"
	"github.com/coder/websocket"
	"github.com/coder/websocket/wsjson"
	"github.com/google/uuid"
	"golang.org/x/crypto/bcrypt"
)

const (
	codeLength                       = 8
	tokenLength                      = 32
	participantIDLength              = 12
	authenticatedParticipantIDPrefix = "user:"
	maxParticipants                  = 40
	maxMessageBytes                  = 64 << 10
	joinReservationTTL               = 2 * time.Minute
	unstartedRoomTTL                 = 10 * time.Minute
	heartbeatInterval                = 30 * time.Second
	heartbeatTimeout                 = 5 * time.Second
	leaderID                         = "leader"
	writeTimeout                     = 5 * time.Second
)

var (
	errNotFound         = errors.New("live session not found")
	errInvalidPassword  = errors.New("invalid live session password")
	errFull             = errors.New("live session is full")
	errInvalidToken     = errors.New("invalid live session token")
	errAlreadyConnected = errors.New("live session token is already connected")
)

type Options struct {
	AccessURL       *url.URL
	ResolveUsername func(context.Context, uuid.UUID) (string, error)
	OriginPatterns  []string
}

type Service struct {
	accessURL       *url.URL
	resolveUsername func(context.Context, uuid.UUID) (string, error)
	originPatterns  []string

	mu    sync.Mutex
	rooms map[string]*room
}

type room struct {
	code             string
	instanceID       uuid.UUID
	passwordHash     []byte
	leaderToken      string
	leader           *peer
	participants     map[string]*peer
	participantsByID map[string]*peer
	createdAt        time.Time
}

type peer struct {
	id         string
	token      string
	conn       *websocket.Conn
	reservedAt time.Time
	writeMu    sync.Mutex
}

type clientMessage struct {
	Type     string          `json:"type"`
	TargetID string          `json:"target_id,omitempty"`
	Payload  json.RawMessage `json:"payload"`
}

type serverMessage struct {
	Type          string          `json:"type"`
	ParticipantID string          `json:"participant_id,omitempty"`
	Reason        string          `json:"reason,omitempty"`
	Payload       json.RawMessage `json:"payload,omitempty"`
}

type connection struct {
	room *room
	peer *peer
	role string
}

func New(options Options) *Service {
	return &Service{
		accessURL:       options.AccessURL,
		resolveUsername: options.ResolveUsername,
		originPatterns:  append([]string(nil), options.OriginPatterns...),
		rooms:           make(map[string]*room),
	}
}

func (s *Service) cleanupLocked(now time.Time) {
	for code, room := range s.rooms {
		hasConnectedParticipant := false
		for _, peer := range room.participants {
			if peer.conn != nil {
				hasConnectedParticipant = true
				break
			}
		}
		if room.leader == nil && !hasConnectedParticipant && now.Sub(room.createdAt) >= unstartedRoomTTL {
			delete(s.rooms, code)
			continue
		}
		for token, peer := range room.participants {
			if peer.conn == nil && now.Sub(peer.reservedAt) >= joinReservationTTL {
				delete(room.participants, token)
				delete(room.participantsByID, peer.id)
			}
		}
	}
}

func (s *Service) create(instanceID uuid.UUID, password string) (*room, error) {
	var passwordHash []byte
	var err error
	if password != "" {
		passwordHash, err = bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
		if err != nil {
			return nil, err
		}
	}

	leaderToken, err := cryptorand.String(tokenLength)
	if err != nil {
		return nil, err
	}

	for {
		code, err := cryptorand.StringCharset(cryptorand.Human, codeLength)
		if err != nil {
			return nil, err
		}
		code = strings.ToUpper(code)

		s.mu.Lock()
		s.cleanupLocked(time.Now())
		if _, exists := s.rooms[code]; !exists {
			room := &room{
				code:             code,
				instanceID:       instanceID,
				passwordHash:     passwordHash,
				leaderToken:      leaderToken,
				participants:     make(map[string]*peer),
				participantsByID: make(map[string]*peer),
				createdAt:        time.Now(),
			}
			s.rooms[code] = room
			s.mu.Unlock()
			return room, nil
		}
		s.mu.Unlock()
	}
}

func (s *Service) join(code, password string) (*peer, uuid.UUID, error) {
	return s.joinAs(code, password, "")
}

func (s *Service) joinAs(code, password, username string) (*peer, uuid.UUID, error) {
	code = strings.ToUpper(code)

	s.mu.Lock()
	defer s.mu.Unlock()

	s.cleanupLocked(time.Now())
	room, ok := s.rooms[code]
	if !ok {
		return nil, uuid.Nil, errNotFound
	}
	if len(room.passwordHash) > 0 && bcrypt.CompareHashAndPassword(room.passwordHash, []byte(password)) != nil {
		return nil, uuid.Nil, errInvalidPassword
	}
	// Capacity includes the leader.
	if len(room.participants)+1 >= maxParticipants {
		return nil, uuid.Nil, errFull
	}

	participantID, err := room.nextParticipantID(username)
	if err != nil {
		return nil, uuid.Nil, err
	}
	for {
		token, err := cryptorand.String(tokenLength)
		if err != nil {
			return nil, uuid.Nil, err
		}
		if _, exists := room.participants[token]; exists {
			continue
		}

		peer := &peer{id: participantID, token: token, reservedAt: time.Now()}
		room.participants[token] = peer
		room.participantsByID[participantID] = peer
		return peer, room.instanceID, nil
	}
}

func (r *room) nextParticipantID(username string) (string, error) {
	username = strings.TrimSpace(username)
	if username != "" {
		base := authenticatedParticipantIDPrefix + username
		if _, exists := r.participantsByID[base]; !exists {
			return base, nil
		}
		for suffix := 2; ; suffix++ {
			candidate := fmt.Sprintf("%s-%d", base, suffix)
			if _, exists := r.participantsByID[candidate]; !exists {
				return candidate, nil
			}
		}
	}

	for {
		participantID, err := cryptorand.StringCharset(cryptorand.Human, participantIDLength)
		if err != nil {
			return "", err
		}
		if _, exists := r.participantsByID[participantID]; !exists {
			return participantID, nil
		}
	}
}

func (s *Service) validateToken(code, token string) (bool, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()

	room, exists := s.rooms[strings.ToUpper(code)]
	if !exists {
		return false, false
	}
	return true, room.leaderToken == token || room.participants[token] != nil
}

func (s *Service) attach(code, token string, conn *websocket.Conn) (*connection, []*peer, error) {
	code = strings.ToUpper(code)

	s.mu.Lock()
	defer s.mu.Unlock()

	room, ok := s.rooms[code]
	if !ok {
		return nil, nil, errNotFound
	}
	if token == room.leaderToken {
		if room.leader != nil {
			return nil, nil, errAlreadyConnected
		}
		leaderPeer := &peer{id: leaderID, token: token, conn: conn}
		room.leader = leaderPeer
		connectedGuests := make([]*peer, 0, len(room.participants))
		for _, guest := range room.participants {
			if guest.conn != nil {
				connectedGuests = append(connectedGuests, guest)
			}
		}
		return &connection{room: room, peer: leaderPeer, role: leaderID}, connectedGuests, nil
	}

	participantPeer, ok := room.participants[token]
	if !ok {
		return nil, nil, errInvalidToken
	}
	if participantPeer.conn != nil {
		return nil, nil, errAlreadyConnected
	}
	participantPeer.conn = conn
	var leader []*peer
	if room.leader != nil {
		leader = append(leader, room.leader)
	}
	return &connection{room: room, peer: participantPeer, role: "participant"}, leader, nil
}

func (s *Service) disconnect(connection *connection) {
	if connection.role == leaderID {
		s.end(connection)
		return
	}

	s.mu.Lock()
	room, exists := s.rooms[connection.room.code]
	if !exists || room != connection.room {
		s.mu.Unlock()
		return
	}
	peer, exists := room.participants[connection.peer.token]
	if !exists || peer != connection.peer {
		s.mu.Unlock()
		return
	}
	delete(room.participants, connection.peer.token)
	delete(room.participantsByID, connection.peer.id)
	leader := room.leader
	s.mu.Unlock()

	if leader != nil {
		_ = leader.writeJSON(serverMessage{
			Type:          "participant_left",
			ParticipantID: connection.peer.id,
		})
	}
}

func (s *Service) end(connection *connection) {
	s.mu.Lock()
	room, exists := s.rooms[connection.room.code]
	if !exists || room != connection.room || room.leader != connection.peer {
		s.mu.Unlock()
		return
	}
	delete(s.rooms, room.code)
	guests := make([]*peer, 0, len(room.participants))
	for _, guest := range room.participants {
		if guest.conn != nil {
			guests = append(guests, guest)
		}
	}
	s.mu.Unlock()

	message := serverMessage{Type: "session_ended", Reason: "leader_disconnected"}
	for _, guest := range guests {
		_ = guest.writeJSON(message)
		guest.closeNow()
	}
}

func (s *Service) relay(connection *connection, message clientMessage) error {
	if message.Type != "signal" || len(message.Payload) == 0 {
		return errors.New("invalid live session message")
	}

	s.mu.Lock()
	room, exists := s.rooms[connection.room.code]
	if !exists || room != connection.room {
		s.mu.Unlock()
		return errNotFound
	}

	var target *peer
	if connection.role == leaderID {
		if message.TargetID == "" {
			s.mu.Unlock()
			return errors.New("leader signal requires target_id")
		}
		target = room.participantsByID[message.TargetID]
	} else {
		if message.TargetID != "" {
			s.mu.Unlock()
			return errors.New("participant signal must not include target_id")
		}
		target = room.leader
	}
	if target == nil || target.conn == nil {
		s.mu.Unlock()
		return errors.New("signal target is not connected")
	}
	forwarded := serverMessage{
		Type:          "signal",
		ParticipantID: connection.peer.id,
		Payload:       append(json.RawMessage(nil), message.Payload...),
	}
	s.mu.Unlock()

	return target.writeJSON(forwarded)
}

func (p *peer) writeJSON(message serverMessage) error {
	p.writeMu.Lock()
	defer p.writeMu.Unlock()
	if p.conn == nil {
		return errors.New("live session peer is not connected")
	}
	ctx, cancel := context.WithTimeout(context.Background(), writeTimeout)
	defer cancel()
	return wsjson.Write(ctx, p.conn, message)
}

func (p *peer) closeNow() {
	p.writeMu.Lock()
	defer p.writeMu.Unlock()
	if p.conn != nil {
		_ = p.conn.CloseNow()
	}
}
