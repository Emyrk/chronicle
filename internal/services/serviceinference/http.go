package serviceinference

import (
	"context"
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
	"github.com/Emyrk/chronicle/database/authz/policy"
	"github.com/Emyrk/chronicle/internal/services/serviceinference/openrouter"
	"github.com/authzed/gochugaru/rel"
	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
)

const oauthTTL = 10 * time.Minute

func (s *Service) AccountRoutes() http.Handler {
	r := chi.NewRouter()
	r.Get("/", s.getInferenceSettings)
	r.Put("/", s.updateInferenceSettings)
	return r
}

func (s *Service) getInferenceSettings(w http.ResponseWriter, r *http.Request) {
	s.writeInferenceSettings(w, r)
}

func (s *Service) updateInferenceSettings(w http.ResponseWriter, r *http.Request) {
	var req chroniclesdk.UpdateInferenceSettingsRequest
	if !httpapi.Read(r.Context(), w, r, &req) {
		return
	}
	user := policy.New().User(userID(r))
	available, err := s.zed.CheckOne(r.Context(), nil, policy.New().GlobalChronicle().CanInference_available_User(user))
	if err != nil {
		s.internalError(w, "authorize inference preference", err)
		return
	}
	if !available {
		httpapi.Write(r.Context(), w, http.StatusForbidden, chroniclesdk.Response{Message: "AI features are not enabled for this account."})
		return
	}
	if err := s.zed.SetInferenceDisabled(r.Context(), userID(r), req.Disabled); err != nil {
		s.internalError(w, "update inference preference", err)
		return
	}
	s.writeInferenceSettings(w, r)
}

func (s *Service) writeInferenceSettings(w http.ResponseWriter, r *http.Request) {
	user := policy.New().User(userID(r))
	chronicle := policy.New().GlobalChronicle()
	checks, err := s.zed.Check(r.Context(), nil,
		chronicle.CanInference_available_User(user),
		rel.Relationship{
			ResourceType:     "chronicle",
			ResourceID:       "chronicle",
			ResourceRelation: "inference_disabled",
			SubjectType:      "user",
			SubjectID:        user.Object().ID,
		},
		chronicle.CanUse_inference_chat_User(user),
	)
	if err != nil {
		s.internalError(w, "read inference preference", err)
		return
	}
	available, disabled, permitted := checks[0], checks[1], checks[2]
	httpapi.Write(r.Context(), w, http.StatusOK, chroniclesdk.InferenceSettings{
		Available:        available,
		Disabled:         disabled,
		Enabled:          s.enabled && permitted,
		ServiceAvailable: s.enabled,
	})
}

func (s *Service) routes() http.Handler {
	r := chi.NewRouter()
	r.Use(s.requireEnabled)
	r.Get("/connections", s.listConnections)
	r.Post("/openrouter/authorize", s.authorizeOpenRouter)
	r.Get("/openrouter/callback", s.callbackOpenRouter)
	r.Delete("/connections/{connectionID}", s.deleteConnection)
	r.Get("/connections/{connectionID}/models", s.listModels)
	r.Post("/threads/instance/{instance}", s.createInstanceThread)
	r.Post("/threads/lua-project/{project}", s.createLuaProjectThread)
	r.Get("/threads", s.listThreads)
	r.Get("/threads/{threadID}", s.getThread)
	r.Delete("/threads/{threadID}/messages", s.clearThread)
	r.Get("/usage", s.getContextUsage)
	r.Post("/debug/preview", s.previewDebug)
	r.Post("/runs/{runID}/client-tools/{toolCallID}", s.continueClientTool)
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
	httpapi.Write(r.Context(), w, http.StatusOK, chroniclesdk.InferenceModelsResponse{Models: selectableInferenceModels(models)})
}

func selectableInferenceModels(models []ModelDescriptor) []chroniclesdk.InferenceModel {
	out := make([]chroniclesdk.InferenceModel, 0, len(models))
	for _, model := range models {
		if model.Capabilities.Streaming && model.Capabilities.Tools {
			out = append(out, chroniclesdk.InferenceModel{
				ID:            model.ID,
				Name:          model.Name,
				Description:   model.Description,
				ContextLength: model.ContextLength,
			})
		}
	}
	slices.SortFunc(out, func(left, right chroniclesdk.InferenceModel) int {
		if byName := strings.Compare(strings.ToLower(left.Name), strings.ToLower(right.Name)); byName != 0 {
			return byName
		}
		return strings.Compare(left.ID, right.ID)
	})
	return out
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
func (s *Service) createLuaProjectThread(w http.ResponseWriter, r *http.Request) {
	project, err := s.luaProjectForUser(r, chi.URLParam(r, "project"))
	if err != nil {
		httpapi.Write(r.Context(), w, http.StatusForbidden, chroniclesdk.Response{Message: "You cannot edit this Lua project."})
		return
	}
	thread, err := s.db.GetOrCreateInferenceThread(r.Context(), database.GetOrCreateInferenceThreadParams{UserID: userID(r), AssistantID: "lua-workshop", ContextType: pgtype.Text{String: "lua_project", Valid: true}, ContextID: pgtype.Text{String: project.ID.String(), Valid: true}, Title: project.Name})
	if err != nil {
		s.internalError(w, "create inference thread", err)
		return
	}
	s.writeThread(w, r, thread)
}

// luaProjectForUser returns a Lua project the caller may update. Lua threads
// only expose the browser working copy, but still require edit access.
func (s *Service) luaProjectForUser(r *http.Request, identifier string) (database.LuaProject, error) {
	id, err := uuid.Parse(identifier)
	if err != nil {
		return database.LuaProject{}, pgx.ErrNoRows
	}
	actor := policy.New().User(userID(r))
	allowed, err := s.zed.CheckOne(r.Context(), nil, policy.New().Lua_project(id).CanUpdate_User(actor))
	if err != nil {
		return database.LuaProject{}, err
	}
	if !allowed {
		return database.LuaProject{}, pgx.ErrNoRows
	}
	technicalAdmin, err := s.zed.CheckOne(r.Context(), nil, policy.New().GlobalChronicle().CanAdminister_authz_User(actor))
	if err != nil {
		return database.LuaProject{}, err
	}
	return s.db.GetOwnerLuaProject(r.Context(), database.GetOwnerLuaProjectParams{ID: id, OwnerID: userID(r), TechnicalAdmin: technicalAdmin})
}

// authorizeThreadContext re-checks access to a durable thread's context on every use.
func (s *Service) authorizeThreadContext(r *http.Request, thread database.InferenceThread) error {
	switch thread.ContextType.String {
	case "instance":
		_, err := s.instanceForUser(r, thread.ContextID.String)
		return err
	case "lua_project":
		_, err := s.luaProjectForUser(r, thread.ContextID.String)
		return err
	case "":
		return nil
	default:
		return pgx.ErrNoRows
	}
}

func threadContextForbidden(thread database.InferenceThread) string {
	if thread.ContextType.String == "lua_project" {
		return "You cannot edit this Lua project."
	}
	return "You cannot view this instance."
}

func threadToolContext(s *Service, thread database.InferenceThread) toolContext {
	tc := toolContext{service: s}
	if thread.ContextType.String == "instance" {
		tc.instanceID, _ = uuid.Parse(thread.ContextID.String)
	}
	return tc
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
		if row.ContextType.Valid {
			if err := s.authorizeThreadContext(r, row); err != nil {
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
	if err := s.authorizeThreadContext(r, thread); err != nil {
		httpapi.Write(r.Context(), w, http.StatusForbidden, chroniclesdk.Response{Message: threadContextForbidden(thread)})
		return
	}
	s.writeThread(w, r, thread)
}

func (s *Service) previewDebug(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, maxRunBody)
	var request chroniclesdk.InferenceDebugPreviewRequest
	if !httpapi.Read(r.Context(), w, r, &request) {
		return
	}
	uid := userID(r)
	allowed, err := s.zed.CheckOne(r.Context(), nil, policy.New().GlobalChronicle().CanDebug_inference_chat_User(policy.New().User(uid)))
	if err != nil {
		s.internalError(w, "authorize inference debug preview", err)
		return
	}
	if !allowed {
		httpapi.Write(r.Context(), w, http.StatusForbidden, chroniclesdk.Response{Message: "Inference debug access is not enabled for this account."})
		return
	}
	assistantDefinition, ok := assistants[request.AssistantID]
	if !ok {
		badRequest(w, r, "Unknown assistant.")
		return
	}
	if request.Model == "" || len(request.Model) > 200 {
		badRequest(w, r, "A model is required.")
		return
	}

	debug := debugRunContext{Enabled: true, RunID: "preview-" + uuid.NewString(), Persistence: "ephemeral"}
	messages := make([]Message, 0, maxHistoryMessages+1)
	if assistantDefinition.Durable {
		if request.ThreadID == nil || (assistantDefinition.ContextType == "instance") != (request.Instance != "") {
			badRequest(w, r, "Durable debug previews require thread_id, and instance for instance threads.")
			return
		}
		thread, err := s.db.GetInferenceThreadByOwner(r.Context(), database.GetInferenceThreadByOwnerParams{ID: *request.ThreadID, UserID: uid})
		if err != nil || thread.AssistantID != assistantDefinition.ID || thread.Persistence != "durable" || thread.ContextType.String != assistantDefinition.ContextType || (request.Instance != "" && thread.ContextID.String != request.Instance) {
			httpapi.Write(r.Context(), w, http.StatusNotFound, chroniclesdk.Response{Message: "Thread not found."})
			return
		}
		if err := s.authorizeThreadContext(r, thread); err != nil {
			httpapi.Write(r.Context(), w, http.StatusForbidden, chroniclesdk.Response{Message: threadContextForbidden(thread)})
			return
		}
		capability, err := advertisedClient(request.Client, clientCapabilities[assistantDefinition.ClientCapability], thread.ContextID.String)
		if err != nil {
			badRequest(w, r, err.Error())
			return
		}
		assistantDefinition = withClientTools(assistantDefinition, capability)
		rows, err := s.db.ListRecentInferenceMessagesByThread(r.Context(), database.ListRecentInferenceMessagesByThreadParams{ThreadID: thread.ID, Limit: maxHistoryMessages})
		if err != nil {
			s.internalError(w, "load inference debug preview history", err)
			return
		}
		messages = append(messages, boundedHistory(rows)...)
		debug.ThreadID = thread.ID.String()
		debug.Persistence = "durable"
		debug.ContextType = thread.ContextType.String
		debug.ContextID = thread.ContextID.String
	} else if request.ThreadID != nil || request.Instance != "" || request.Client != nil {
		badRequest(w, r, "Ephemeral debug previews do not accept thread or client context.")
		return
	}
	messages = append([]Message{{Role: RoleSystem, Content: assistantDefinition.System}}, messages...)
	httpapi.Write(r.Context(), w, http.StatusOK, debugSnapshotEvent(debug, 0, "request", request.Model, assistantDefinition, messages, Usage{}))
}

var errInferenceRunInProgress = errors.New("inference run in progress")

func (s *Service) clearThreadMessages(ctx context.Context, threadID, uid uuid.UUID) (database.InferenceThread, error) {
	var thread database.InferenceThread
	err := s.db.InTx(ctx, func(tx database.Store) error {
		active, activeErr := tx.GetActiveInferenceRunByThreadForUpdate(ctx, database.GetActiveInferenceRunByThreadForUpdateParams{
			ThreadID: uuid.NullUUID{UUID: threadID, Valid: true},
			UserID:   uid,
		})
		if activeErr != nil && !errors.Is(activeErr, pgx.ErrNoRows) {
			return activeErr
		}
		if activeErr == nil {
			if active.Status == "running" {
				return errInferenceRunInProgress
			}
			if err := supersedeAwaitingClientTool(ctx, tx, threadID, uid); err != nil {
				return err
			}
			if _, err := tx.AbandonAwaitingInferenceRun(ctx, database.AbandonAwaitingInferenceRunParams{ID: active.ID, UserID: uid}); err != nil && !errors.Is(err, pgx.ErrNoRows) {
				return err
			}
		}
		var err error
		thread, err = tx.ClearInferenceThreadByOwner(ctx, database.ClearInferenceThreadByOwnerParams{ID: threadID, UserID: uid})
		return err
	}, nil)
	return thread, err
}

func (s *Service) clearThread(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "threadID"))
	if err != nil {
		httpapi.Write(r.Context(), w, http.StatusBadRequest, chroniclesdk.Response{Message: "Invalid thread ID."})
		return
	}
	uid := userID(r)
	thread, err := s.db.GetInferenceThreadByOwner(r.Context(), database.GetInferenceThreadByOwnerParams{ID: id, UserID: uid})
	if err != nil {
		httpapi.Write(r.Context(), w, http.StatusNotFound, chroniclesdk.Response{Message: "Thread not found."})
		return
	}
	if err := s.authorizeThreadContext(r, thread); err != nil {
		httpapi.Write(r.Context(), w, http.StatusForbidden, chroniclesdk.Response{Message: threadContextForbidden(thread)})
		return
	}

	thread, err = s.clearThreadMessages(r.Context(), id, uid)
	if errors.Is(err, errInferenceRunInProgress) {
		httpapi.Write(r.Context(), w, http.StatusConflict, chroniclesdk.Response{Message: "Wait for the current response to finish before starting a new chat."})
		return
	}
	if err != nil {
		s.internalError(w, "clear inference thread", err)
		return
	}
	httpapi.Write(r.Context(), w, http.StatusOK, chroniclesdk.InferenceThreadResponse{Thread: threadSDK(thread), Messages: []chroniclesdk.InferenceMessage{}, Usage: chroniclesdk.InferenceUsage{}})
}

func threadSDK(t database.InferenceThread) chroniclesdk.InferenceThread {
	return chroniclesdk.InferenceThread{ID: t.ID, AssistantID: t.AssistantID, Persistence: t.Persistence, ContextType: t.ContextType.String, ContextID: t.ContextID.String, Title: t.Title, CreatedAt: t.CreatedAt.Time, UpdatedAt: t.UpdatedAt.Time}
}

// boundedThreadMessages also returns each message's key (its id inside the stored content), aligned with the messages.
func boundedThreadMessages(rows []database.InferenceMessage) ([]chroniclesdk.InferenceMessage, []string) {
	messages := make([]chroniclesdk.InferenceMessage, 0, len(rows))
	keys := make([]string, 0, len(rows))
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
		keys = append(keys, message.ID)
	}
	slices.Reverse(messages)
	slices.Reverse(keys)
	for len(messages) > 0 && messages[0].Role != string(RoleUser) {
		messages, keys = messages[1:], keys[1:]
	}
	return messages, keys
}

// usageSDK converts summed usage columns; cost is reported only when at least one call reported it.
func usageSDK(prompt, completion, cached, reasoning, costNanos, costedCalls, calls int64) chroniclesdk.InferenceUsage {
	usage := chroniclesdk.InferenceUsage{PromptTokens: prompt, CompletionTokens: completion, CachedTokens: cached, ReasoningTokens: reasoning, Calls: calls}
	if costedCalls > 0 {
		cost := float64(costNanos) / 1e9
		usage.CostUSD = &cost
	}
	return usage
}

// getContextUsage totals the caller's own usage for a context, such as every chat about one addon project.
func (s *Service) getContextUsage(w http.ResponseWriter, r *http.Request) {
	contextType, contextID := r.URL.Query().Get("context_type"), r.URL.Query().Get("context_id")
	if contextType == "" || contextID == "" || len(contextType) > 64 || len(contextID) > 200 {
		badRequest(w, r, "context_type and context_id are required.")
		return
	}
	row, err := s.db.GetInferenceContextUsage(r.Context(), database.GetInferenceContextUsageParams{
		UserID: userID(r), ContextType: pgtype.Text{String: contextType, Valid: true}, ContextID: pgtype.Text{String: contextID, Valid: true},
	})
	if err != nil {
		s.internalError(w, "load inference usage", err)
		return
	}
	httpapi.Write(r.Context(), w, http.StatusOK, usageSDK(row.PromptTokens, row.CompletionTokens, row.CachedTokens, row.ReasoningTokens, row.CostNanos, row.CostedCalls, row.Calls))
}

func (s *Service) writeThread(w http.ResponseWriter, r *http.Request, t database.InferenceThread) {
	rows, err := s.db.ListRecentInferenceMessagesByThread(r.Context(), database.ListRecentInferenceMessagesByThreadParams{ThreadID: t.ID, Limit: maxHistoryMessages})
	if err != nil {
		s.internalError(w, "load inference thread", err)
		return
	}
	messages, keys := boundedThreadMessages(rows)
	total, err := s.db.GetInferenceThreadUsage(r.Context(), database.GetInferenceThreadUsageParams{ID: t.ID, UserID: t.UserID})
	if err != nil {
		s.internalError(w, "load inference thread usage", err)
		return
	}
	assistantKeys := make([]string, 0, len(keys))
	for i, key := range keys {
		if key != "" && messages[i].Role == string(RoleAssistant) {
			assistantKeys = append(assistantKeys, key)
		}
	}
	if len(assistantKeys) > 0 {
		usageRows, err := s.db.ListInferenceUsageByMessageKeys(r.Context(), database.ListInferenceUsageByMessageKeysParams{ThreadID: uuid.NullUUID{UUID: t.ID, Valid: true}, MessageKeys: assistantKeys})
		if err != nil {
			s.internalError(w, "load inference message usage", err)
			return
		}
		byKey := make(map[string]chroniclesdk.InferenceUsage, len(usageRows))
		for _, row := range usageRows {
			byKey[row.MessageKey] = usageSDK(row.PromptTokens, row.CompletionTokens, row.CachedTokens, row.ReasoningTokens, row.CostNanos, row.CostedCalls, row.Calls)
		}
		for i, key := range keys {
			if usage, ok := byKey[key]; ok && messages[i].Role == string(RoleAssistant) {
				messages[i].Usage = &usage
			}
		}
	}
	httpapi.Write(r.Context(), w, http.StatusOK, chroniclesdk.InferenceThreadResponse{Thread: threadSDK(t), Messages: messages, Usage: usageSDK(total.PromptTokens, total.CompletionTokens, total.CachedTokens, total.ReasoningTokens, total.CostNanos, total.CostedCalls, total.Calls)})
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
