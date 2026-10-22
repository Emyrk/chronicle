package serviceinference

import (
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"errors"
	"net/http"
	"net/url"
	"slices"
	"strings"
	"time"

	"github.com/Emyrk/chronicle/api/chronauth"
	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/api/httpapi"
	"github.com/Emyrk/chronicle/database"
	dbauthz "github.com/Emyrk/chronicle/database/authz"
	"github.com/Emyrk/chronicle/internal/services/serviceinference/openrouter"
	"github.com/authzed/gochugaru/rel"
	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
)

const oauthTTL = 10 * time.Minute

func (s *Service) routes() http.Handler {
	r := chi.NewRouter()
	r.Use(s.requireEnabled)
	r.Get("/connections", s.listConnections)
	r.Post("/openrouter/authorize", s.authorizeOpenRouter)
	r.Get("/openrouter/callback", s.callbackOpenRouter)
	r.Delete("/connections/{connectionID}", s.deleteConnection)
	r.Get("/connections/{connectionID}/models", s.listModels)
	r.Post("/threads/instance/{instance}", s.createInstanceThread)
	r.Get("/threads", s.listThreads)
	r.Get("/threads/{threadID}", s.getThread)
	r.Post("/runs", s.run)
	return r
}

func (s *Service) requireEnabled(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !s.enabled {
			httpapi.Write(r.Context(), w, http.StatusServiceUnavailable, chroniclesdk.Response{Message: "Inference is not configured on this server."})
			return
		}
		next.ServeHTTP(w, r)
	})
}

func ValidateLocalReturnPath(path string) error {
	if path == "" || len(path) > 2048 || !strings.HasPrefix(path, "/") || strings.HasPrefix(path, "//") || strings.ContainsAny(path, "\r\n\\") {
		return errors.New("return path must be a local absolute path")
	}
	u, err := url.Parse(path)
	if err != nil || u.IsAbs() || u.Host != "" {
		return errors.New("return path must be local")
	}
	return nil
}

func randomToken(bytes int) (string, error) {
	b := make([]byte, bytes)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(b), nil
}
func userID(r *http.Request) uuid.UUID { return chronauth.MustAuthenticatedClaims(r.Context()).Subject }

func (s *Service) listConnections(w http.ResponseWriter, r *http.Request) {
	rows, err := s.db.ListInferenceConnectionsByOwner(r.Context(), userID(r))
	if err != nil {
		s.internalError(w, "list inference connections", err)
		return
	}
	out := make([]chroniclesdk.InferenceConnection, 0, len(rows))
	for _, row := range rows {
		out = append(out, connectionSDK(row))
	}
	httpapi.Write(r.Context(), w, http.StatusOK, chroniclesdk.InferenceConnectionsResponse{Connections: out})
}
func connectionSDK(row database.InferenceConnection) chroniclesdk.InferenceConnection {
	var last *time.Time
	if row.LastUsedAt.Valid {
		v := row.LastUsedAt.Time
		last = &v
	}
	return chroniclesdk.InferenceConnection{ID: row.ID, Provider: row.Provider, AuthMode: row.AuthMode, Label: row.Label, Status: row.Status, CreatedAt: row.CreatedAt.Time, LastUsedAt: last}
}

func openRouterCallbackURL(accessURL *url.URL, state string) string {
	callback := *accessURL
	callback.Path = "/api/v1/inference/openrouter/callback"
	query := callback.Query()
	query.Set("state", state)
	callback.RawQuery = query.Encode()
	callback.Fragment = ""
	return callback.String()
}

func (s *Service) authorizeOpenRouter(w http.ResponseWriter, r *http.Request) {
	var req chroniclesdk.InferenceAuthorizeRequest
	if !httpapi.Read(r.Context(), w, r, &req) {
		return
	}
	if ValidateLocalReturnPath(req.ReturnPath) != nil {
		httpapi.Write(r.Context(), w, http.StatusBadRequest, chroniclesdk.Response{Message: "Invalid return path."})
		return
	}
	state, err := randomToken(32)
	if err != nil {
		s.internalError(w, "generate OAuth state", err)
		return
	}
	verifier, err := randomToken(64)
	if err != nil {
		s.internalError(w, "generate OAuth verifier", err)
		return
	}
	uid := userID(r)
	encrypted, err := s.cipher.Encrypt([]byte(verifier), credentialAAD(uid.String(), "oauth-verifier"))
	if err != nil {
		s.internalError(w, "encrypt OAuth verifier", err)
		return
	}
	_, err = s.db.InsertInferenceOAuthTransaction(r.Context(), database.InsertInferenceOAuthTransactionParams{UserID: uid, Provider: string(openrouter.ProviderID), StateHash: hashSecret(state), EncryptedVerifier: encrypted, VerifierKeyVersion: credentialKeyID, ReturnPath: req.ReturnPath, ExpiresAt: pgtype.Timestamptz{Time: time.Now().Add(oauthTTL), Valid: true}})
	if err != nil {
		s.internalError(w, "store OAuth transaction", err)
		return
	}
	callbackURL := openRouterCallbackURL(s.accessURL, state)
	authorizeURL, err := s.openRouter.AuthorizationURL(callbackURL, openrouter.PKCEChallenge(verifier))
	if err != nil {
		s.internalError(w, "build OpenRouter authorization URL", err)
		return
	}
	httpapi.Write(r.Context(), w, http.StatusOK, chroniclesdk.InferenceAuthorizeResponse{AuthorizeURL: authorizeURL})
}

func (s *Service) callbackOpenRouter(w http.ResponseWriter, r *http.Request) {
	uid := userID(r)
	state := r.URL.Query().Get("state")
	if state == "" {
		httpapi.Write(r.Context(), w, http.StatusBadRequest, chroniclesdk.Response{Message: "Missing OAuth state."})
		return
	}
	tx, err := s.db.ConsumeInferenceOAuthTransaction(r.Context(), database.ConsumeInferenceOAuthTransactionParams{StateHash: hashSecret(state), UserID: uid})
	if err != nil {
		httpapi.Write(r.Context(), w, http.StatusBadRequest, chroniclesdk.Response{Message: "OAuth state is invalid or expired."})
		return
	}
	redirect := func(result string) {
		u, _ := url.Parse(tx.ReturnPath)
		q := u.Query()
		q.Set("inference_connection", result)
		u.RawQuery = q.Encode()
		http.Redirect(w, r, u.String(), http.StatusSeeOther)
	}
	code := r.URL.Query().Get("code")
	if code == "" || r.URL.Query().Get("error") != "" {
		redirect("error")
		return
	}
	verifier, err := s.cipher.Decrypt(tx.EncryptedVerifier, credentialAAD(uid.String(), "oauth-verifier"))
	if err != nil {
		redirect("error")
		return
	}
	key, err := s.openRouter.ExchangeAuthorizationCode(r.Context(), code, string(verifier))
	if err != nil {
		s.logger.Warn("OpenRouter OAuth exchange failed")
		redirect("error")
		return
	}
	encrypted, err := s.cipher.Encrypt([]byte(key.Key), credentialAAD(uid.String(), "provider-credential"))
	if err != nil {
		redirect("error")
		return
	}
	_, err = s.db.InsertInferenceConnection(r.Context(), database.InsertInferenceConnectionParams{UserID: uid, Provider: string(openrouter.ProviderID), AuthMode: "oauth", Label: "OpenRouter", EncryptedCredential: encrypted, CredentialKeyVersion: credentialKeyID, ProviderAccountKeyHash: hashSecret(key.Key), Status: "active"})
	if err != nil {
		redirect("error")
		return
	}
	redirect("success")
}

func (s *Service) connection(r *http.Request) (database.InferenceConnection, error) {
	id, err := uuid.Parse(chi.URLParam(r, "connectionID"))
	if err != nil {
		return database.InferenceConnection{}, err
	}
	return s.db.GetInferenceConnectionByOwner(r.Context(), database.GetInferenceConnectionByOwnerParams{ID: id, UserID: userID(r)})
}
func (s *Service) deleteConnection(w http.ResponseWriter, r *http.Request) {
	row, err := s.connection(r)
	if err != nil {
		httpapi.Write(r.Context(), w, http.StatusNotFound, chroniclesdk.Response{Message: "Connection not found."})
		return
	}
	err = s.db.DeleteInferenceConnectionByOwner(r.Context(), database.DeleteInferenceConnectionByOwnerParams{ID: row.ID, UserID: userID(r)})
	if err != nil {
		s.internalError(w, "delete inference connection", err)
		return
	}
	httpapi.Write(r.Context(), w, http.StatusNoContent, nil)
}
func (s *Service) listModels(w http.ResponseWriter, r *http.Request) {
	row, err := s.connection(r)
	if err != nil {
		httpapi.Write(r.Context(), w, http.StatusNotFound, chroniclesdk.Response{Message: "Connection not found."})
		return
	}
	if row.Status != "active" {
		httpapi.Write(r.Context(), w, http.StatusConflict, chroniclesdk.Response{Message: "Inference connection is not active."})
		return
	}
	cred, err := s.cipher.Decrypt(row.EncryptedCredential, credentialAAD(row.UserID.String(), "provider-credential"))
	if err != nil {
		s.internalError(w, "decrypt inference credential", err)
		return
	}
	provider, ok := s.registry.Provider(ProviderID(row.Provider))
	if !ok {
		httpapi.Write(r.Context(), w, http.StatusBadRequest, chroniclesdk.Response{Message: "Unsupported provider."})
		return
	}
	models, err := provider.ListModels(r.Context(), cred)
	if err != nil {
		httpapi.Write(r.Context(), w, http.StatusBadGateway, chroniclesdk.Response{Message: "Provider model lookup failed."})
		return
	}
	out := make([]chroniclesdk.InferenceModel, 0, 20)
	for _, m := range models {
		if m.Capabilities.Streaming && m.Capabilities.Tools {
			out = append(out, chroniclesdk.InferenceModel{ID: m.ID, Name: m.Name, Description: m.Description, ContextLength: m.ContextLength})
			if len(out) == 20 {
				break
			}
		}
	}
	httpapi.Write(r.Context(), w, http.StatusOK, chroniclesdk.InferenceModelsResponse{Models: out})
}

func (s *Service) instanceForUser(r *http.Request, identifier string) (database.LogInstancesGuild, error) {
	var inst database.LogInstancesGuild
	var err error
	if id, e := uuid.Parse(identifier); e == nil {
		inst, err = s.db.Instance(r.Context(), id)
	} else {
		inst, err = s.db.InstanceBySlug(r.Context(), pgtype.Text{String: identifier, Valid: true})
	}
	if err != nil {
		return inst, err
	}
	actor, ok := dbauthz.ActorFromContext(r.Context())
	if !ok {
		return inst, dbauthz.ErrNoActor
	}
	allowed, err := s.zed.CheckOne(r.Context(), nil, rel.Relationship{ResourceType: "instance", ResourceID: inst.ID.String(), ResourceRelation: "view", SubjectType: "user", SubjectID: actor.Object().ID})
	if err != nil {
		return inst, err
	}
	if !allowed {
		return inst, pgx.ErrNoRows
	}
	return inst, nil
}
func (s *Service) createInstanceThread(w http.ResponseWriter, r *http.Request) {
	inst, err := s.instanceForUser(r, chi.URLParam(r, "instance"))
	if err != nil {
		httpapi.Write(r.Context(), w, http.StatusForbidden, chroniclesdk.Response{Message: "You cannot view this instance."})
		return
	}
	thread, err := s.db.GetOrCreateInferenceThread(r.Context(), database.GetOrCreateInferenceThreadParams{UserID: userID(r), AssistantID: "instance-analyst", ContextType: pgtype.Text{String: "instance", Valid: true}, ContextID: pgtype.Text{String: inst.ID.String(), Valid: true}, Title: inst.Name})
	if err != nil {
		s.internalError(w, "create inference thread", err)
		return
	}
	s.writeThread(w, r, thread)
}
func (s *Service) listThreads(w http.ResponseWriter, r *http.Request) {
	rows, err := s.db.ListInferenceThreadsByOwner(r.Context(), userID(r))
	if err != nil {
		s.internalError(w, "list inference threads", err)
		return
	}
	out := make([]chroniclesdk.InferenceThread, 0, len(rows))
	for _, row := range rows {
		if a := r.URL.Query().Get("assistant"); a != "" && row.AssistantID != a {
			continue
		}
		if c := r.URL.Query().Get("context"); c != "" && row.ContextType.String != c {
			continue
		}
		if row.ContextType.String == "instance" {
			if _, err := s.instanceForUser(r, row.ContextID.String); err != nil {
				if errors.Is(err, pgx.ErrNoRows) {
					continue
				}
				s.internalError(w, "authorize inference thread", err)
				return
			}
		}
		out = append(out, threadSDK(row))
	}
	httpapi.Write(r.Context(), w, http.StatusOK, chroniclesdk.InferenceThreadsResponse{Threads: out})
}
func (s *Service) getThread(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "threadID"))
	if err != nil {
		httpapi.Write(r.Context(), w, http.StatusBadRequest, chroniclesdk.Response{Message: "Invalid thread ID."})
		return
	}
	thread, err := s.db.GetInferenceThreadByOwner(r.Context(), database.GetInferenceThreadByOwnerParams{ID: id, UserID: userID(r)})
	if err != nil {
		httpapi.Write(r.Context(), w, http.StatusNotFound, chroniclesdk.Response{Message: "Thread not found."})
		return
	}
	if thread.ContextType.String == "instance" {
		if _, err := s.instanceForUser(r, thread.ContextID.String); err != nil {
			httpapi.Write(r.Context(), w, http.StatusForbidden, chroniclesdk.Response{Message: "You cannot view this instance."})
			return
		}
	}
	s.writeThread(w, r, thread)
}
func threadSDK(t database.InferenceThread) chroniclesdk.InferenceThread {
	return chroniclesdk.InferenceThread{ID: t.ID, AssistantID: t.AssistantID, Persistence: t.Persistence, ContextType: t.ContextType.String, ContextID: t.ContextID.String, Title: t.Title, CreatedAt: t.CreatedAt.Time, UpdatedAt: t.UpdatedAt.Time}
}
func boundedThreadMessages(rows []database.InferenceMessage) []chroniclesdk.InferenceMessage {
	messages := make([]chroniclesdk.InferenceMessage, 0, len(rows))
	bytes := 0
	for i := len(rows) - 1; i >= 0; i-- {
		if bytes+len(rows[i].Content) > maxHistoryBytes {
			break
		}
		var message Message
		if err := json.Unmarshal(rows[i].Content, &message); err != nil {
			continue
		}
		bytes += len(rows[i].Content)
		messages = append(messages, chroniclesdk.InferenceMessage{ID: rows[i].ID.String(), Role: string(message.Role), Content: message.Content, Name: message.Name, ToolCallID: message.ToolCallID})
	}
	slices.Reverse(messages)
	for len(messages) > 0 && messages[0].Role != string(RoleUser) {
		messages = messages[1:]
	}
	return messages
}

func (s *Service) writeThread(w http.ResponseWriter, r *http.Request, t database.InferenceThread) {
	rows, err := s.db.ListRecentInferenceMessagesByThread(r.Context(), database.ListRecentInferenceMessagesByThreadParams{ThreadID: t.ID, Limit: maxHistoryMessages})
	if err != nil {
		s.internalError(w, "load inference thread", err)
		return
	}
	httpapi.Write(r.Context(), w, http.StatusOK, chroniclesdk.InferenceThreadResponse{Thread: threadSDK(t), Messages: boundedThreadMessages(rows)})
}

func writeJSONMessage(m Message) []byte { b, _ := json.Marshal(m); return b }
func (s *Service) internalError(w http.ResponseWriter, operation string, err error) {
	if s.logger != nil {
		s.logger.Error(operation, "error", err)
	}
	httpapi.InternalServerError(w, errors.New(operation))
}

func badRequest(w http.ResponseWriter, r *http.Request, message string) {
	httpapi.Write(r.Context(), w, http.StatusBadRequest, chroniclesdk.Response{Message: message})
}
