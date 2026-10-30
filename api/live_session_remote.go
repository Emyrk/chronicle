package api

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/Emyrk/chronicle/api/chronauth"
	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/api/httpapi"
	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
)

// liveSessionRemote is only used when a single dedicated signaling daemon is configured.
// The browser never receives its private URL or shared service credential.
type liveSessionRemote struct {
	internalURL *url.URL
	publicURL   *url.URL
	secret      string
	client      *http.Client
	username    func(context.Context, uuid.UUID) (string, error)
}

func newLiveSessionRemote(internalURL, publicURL *url.URL, secret string, username func(context.Context, uuid.UUID) (string, error)) (*liveSessionRemote, error) {
	if internalURL == nil && publicURL == nil && secret == "" {
		return nil, nil // Single-node local mode, for development and existing installations.
	}
	if internalURL == nil || publicURL == nil || secret == "" || internalURL.Host == "" || publicURL.Host == "" {
		return nil, errors.New("live signaling requires internal URL, public URL, and shared secret together")
	}
	if internalURL.Scheme != "http" && internalURL.Scheme != "https" {
		return nil, errors.New("live signaling internal URL must use HTTP or HTTPS")
	}
	if publicURL.Scheme != "http" && publicURL.Scheme != "https" {
		return nil, errors.New("live signaling public URL must use HTTP or HTTPS")
	}
	if internalURL.User != nil || publicURL.User != nil || internalURL.RawQuery != "" || publicURL.RawQuery != "" {
		return nil, errors.New("live signaling URLs must not include credentials or query parameters")
	}
	return &liveSessionRemote{
		internalURL: internalURL,
		publicURL:   publicURL,
		secret:      secret,
		client:      &http.Client{Timeout: 5 * time.Second, CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }},
		username:    username,
	}, nil
}

func (s *liveSessionRemote) post(ctx context.Context, path string, body any) (*http.Response, error) {
	encoded, err := json.Marshal(body)
	if err != nil {
		return nil, err
	}
	endpoint := s.internalURL.JoinPath(path)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint.String(), bytes.NewReader(encoded))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+s.secret)
	req.Header.Set("Content-Type", "application/json")
	return s.client.Do(req)
}

func (s *liveSessionRemote) websocketURL(code string) string {
	endpoint := s.publicURL.JoinPath("api", "v1", "live-sessions", code, "ws")
	if endpoint.Scheme == "https" {
		endpoint.Scheme = "wss"
	} else {
		endpoint.Scheme = "ws"
	}
	return endpoint.String()
}

func (s *liveSessionRemote) Create(w http.ResponseWriter, r *http.Request) {
	var payload chroniclesdk.CreateLiveSessionRequest
	if !httpapi.Read(r.Context(), w, r, &payload) {
		return
	}
	if payload.InstanceID == uuid.Nil {
		httpapi.Write(r.Context(), w, http.StatusBadRequest, chroniclesdk.Response{Message: "instance_id is required."})
		return
	}
	response, err := s.post(r.Context(), "internal/live-sessions", payload)
	if err != nil {
		httpapi.InternalServerError(w, fmt.Errorf("create live session: %w", err))
		return
	}
	defer func() { _ = response.Body.Close() }()
	if response.StatusCode != http.StatusCreated {
		httpapi.InternalServerError(w, fmt.Errorf("live signaling create returned status %d", response.StatusCode))
		return
	}
	var result chroniclesdk.CreateLiveSessionResponse
	if err := json.NewDecoder(io.LimitReader(response.Body, 4096)).Decode(&result); err != nil || result.Code == "" || result.LeaderToken == "" {
		httpapi.InternalServerError(w, fmt.Errorf("invalid live signaling create response: %v", err))
		return
	}
	result.WebSocketURL = s.websocketURL(result.Code)
	httpapi.Write(r.Context(), w, http.StatusCreated, result)
}

func (s *liveSessionRemote) Join(w http.ResponseWriter, r *http.Request) {
	var payload chroniclesdk.JoinLiveSessionRequest
	if !httpapi.Read(r.Context(), w, r, &payload) {
		return
	}
	username := ""
	if claims, authenticated := chronauth.AuthenticatedClaims(r.Context()); authenticated && s.username != nil {
		var err error
		username, err = s.username(r.Context(), claims.Subject)
		if err != nil {
			httpapi.InternalServerError(w, err)
			return
		}
	}
	code := strings.ToUpper(chi.URLParam(r, "code"))
	if len(code) != 8 || strings.IndexFunc(code, func(r rune) bool { return (r < 'A' || r > 'Z') && (r < '0' || r > '9') }) >= 0 {
		httpapi.Write(r.Context(), w, http.StatusNotFound, chroniclesdk.Response{Message: "Live session not found."})
		return
	}
	response, err := s.post(r.Context(), "internal/live-sessions/"+url.PathEscape(code)+"/join", struct {
		Password string `json:"password"`
		Username string `json:"username"`
	}{Password: payload.Password, Username: username})
	if err != nil {
		httpapi.InternalServerError(w, fmt.Errorf("join live session: %w", err))
		return
	}
	defer func() { _ = response.Body.Close() }()
	if response.StatusCode != http.StatusOK {
		switch response.StatusCode {
		case http.StatusForbidden, http.StatusNotFound, http.StatusConflict:
			var message chroniclesdk.Response
			if json.NewDecoder(io.LimitReader(response.Body, 4096)).Decode(&message) == nil {
				httpapi.Write(r.Context(), w, response.StatusCode, message)
				return
			}
		}
		httpapi.InternalServerError(w, fmt.Errorf("live signaling join returned status %d", response.StatusCode))
		return
	}
	var result chroniclesdk.JoinLiveSessionResponse
	if err := json.NewDecoder(io.LimitReader(response.Body, 4096)).Decode(&result); err != nil || result.ParticipantToken == "" {
		httpapi.InternalServerError(w, fmt.Errorf("invalid live signaling join response: %v", err))
		return
	}
	result.WebSocketURL = s.websocketURL(code)
	httpapi.Write(r.Context(), w, http.StatusOK, result)
}
