package servicelivesession

import (
	"errors"
	"net/http"

	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/api/httpapi"
	"github.com/go-chi/chi/v5"
)

// PrivateJoin accepts a username only from the trusted backend on the private listener.
// An empty username represents a guest.
func (s *Service) PrivateJoin(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Password string `json:"password"`
		Username string `json:"username"`
	}
	if !httpapi.Read(r.Context(), w, r, &req) {
		return
	}
	peer, instanceID, err := s.joinAs(chi.URLParam(r, "code"), req.Password, req.Username)
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
		ParticipantToken: peer.token, InstanceID: instanceID,
	})
}
