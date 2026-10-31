package servicelivesession

import (
	"context"
	"crypto/sha256"
	"crypto/subtle"
	"net/http"
	"time"

	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/api/httpapi"
	"github.com/go-chi/chi/v5"
)

const maxPrivateBodyBytes = 8 << 10

// PublicHandler exposes only the signaling WebSocket and a health check.
func (s *Service) PublicHandler() http.Handler {
	r := chi.NewRouter()
	r.Get("/healthz", func(w http.ResponseWriter, req *http.Request) {
		httpapi.Write(req.Context(), w, http.StatusOK, chroniclesdk.Response{Message: "ok"})
	})
	r.Get("/api/v1/live-sessions/{code}/ws", s.WebSocket)
	return r
}

// PrivateHandler must be bound to a private interface. The secret is also checked
// on every request, before decoding bodies or accessing room state.
func (s *Service) PrivateHandler(secret string) http.Handler {
	r := chi.NewRouter()
	r.Use(func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
			provided := req.Header.Get("Authorization")
			expectedHash := sha256.Sum256([]byte("Bearer " + secret))
			providedHash := sha256.Sum256([]byte(provided))
			if secret == "" || subtle.ConstantTimeCompare(expectedHash[:], providedHash[:]) != 1 {
				httpapi.Write(req.Context(), w, http.StatusUnauthorized, chroniclesdk.Response{Message: "Unauthorized."})
				return
			}
			req.Body = http.MaxBytesReader(w, req.Body, maxPrivateBodyBytes)
			next.ServeHTTP(w, req)
		})
	})
	r.Post("/internal/live-sessions", s.Create)
	r.Post("/internal/live-sessions/{code}/join", s.PrivateJoin)
	return r
}

// RunCleanup periodically reclaims idle rooms and unused join reservations,
// including when there are no incoming requests.
func (s *Service) RunCleanup(ctx context.Context, interval time.Duration) {
	ticker := time.NewTicker(interval)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case now := <-ticker.C:
			s.mu.Lock()
			s.cleanupLocked(now)
			// A guest may connect before the leader. Do not keep such an
			// unstarted room alive forever just because its guest socket pings.
			var stranded []*peer
			for code, room := range s.rooms {
				if room.leader != nil || now.Sub(room.createdAt) < unstartedRoomTTL {
					continue
				}
				delete(s.rooms, code)
				for _, guest := range room.participants {
					if guest.conn != nil {
						stranded = append(stranded, guest)
					}
				}
			}
			s.mu.Unlock()
			for _, guest := range stranded {
				_ = guest.writeJSON(serverMessage{Type: "session_ended", Reason: "leader_unavailable"})
				guest.closeNow()
			}
		}
	}
}

// Close removes all rooms and closes every connected socket on shutdown.
func (s *Service) Close() {
	s.mu.Lock()
	peers := make([]*peer, 0)
	for code, room := range s.rooms {
		if room.leader != nil && room.leader.conn != nil {
			peers = append(peers, room.leader)
		}
		for _, guest := range room.participants {
			if guest.conn != nil {
				peers = append(peers, guest)
			}
		}
		delete(s.rooms, code)
	}
	s.mu.Unlock()
	for _, peer := range peers {
		peer.closeNow()
	}
}
