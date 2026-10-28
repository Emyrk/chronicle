package serviceinference

import (
	"errors"
	"net/http"
	"time"

	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/api/httpapi"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/authz/policy"
	"github.com/Emyrk/chronicle/internal/services/serviceinference/agui"
	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
)

func (s *Service) continueClientTool(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, maxRunBody)
	var request chroniclesdk.InferenceClientToolResultRequest
	if !httpapi.Read(r.Context(), w, r, &request) {
		return
	}
	toolCallID := chi.URLParam(r, "toolCallID")
	if toolCallID == "" || len(toolCallID) > 200 || request.ClientSessionID == "" || len(request.ClientSessionID) > maxClientSessionID || len(request.CapabilityID) > 64 || request.CapabilityVersion < 1 || len(request.ScopeType) > 32 || len(request.ScopeID) > 128 || (request.ScopeType == "") != (request.ScopeID == "") || (request.StateRevision != nil && *request.StateRevision < 0) {
		badRequest(w, r, "Invalid client tool result.")
		return
	}
	content, err := normalizedClientToolResult(request)
	if err != nil {
		badRequest(w, r, err.Error())
		return
	}
	uid := userID(r)
	if _, err := s.db.ExpireStaleInferenceRuns(r.Context()); err != nil {
		s.internalError(w, "expire stale inference runs", err)
		return
	}
	run, err := s.db.GetInferenceRunByIdempotencyKey(r.Context(), database.GetInferenceRunByIdempotencyKeyParams{UserID: uid, IdempotencyKey: chi.URLParam(r, "runID")})
	if err != nil {
		httpapi.Write(r.Context(), w, http.StatusNotFound, chroniclesdk.Response{Message: "Inference run not found."})
		return
	}
	if run.Status != "awaiting_client_tool" || !run.ThreadID.Valid || !run.LeaseExpiresAt.Valid || !run.LeaseExpiresAt.Time.After(time.Now()) {
		httpapi.Write(r.Context(), w, http.StatusConflict, chroniclesdk.Response{Message: "This run is not awaiting that client tool."})
		return
	}
	if run.Debug {
		allowed, authErr := s.zed.CheckOne(r.Context(), nil, policy.New().GlobalChronicle().CanDebug_inference_chat_User(policy.New().User(uid)))
		if authErr != nil {
			s.internalError(w, "authorize inference debug", authErr)
			return
		}
		if !allowed {
			httpapi.Write(r.Context(), w, http.StatusForbidden, chroniclesdk.Response{Message: "Inference debug access is not enabled for this account."})
			return
		}
	}
	thread, err := s.db.GetInferenceThreadByOwner(r.Context(), database.GetInferenceThreadByOwnerParams{ID: run.ThreadID.UUID, UserID: uid})
	if err != nil || thread.AssistantID != run.AssistantID || thread.Persistence != "durable" || thread.ContextType.String != assistants[run.AssistantID].ContextType {
		httpapi.Write(r.Context(), w, http.StatusNotFound, chroniclesdk.Response{Message: "Thread not found."})
		return
	}
	if err := s.authorizeThreadContext(r, thread); err != nil {
		httpapi.Write(r.Context(), w, http.StatusForbidden, chroniclesdk.Response{Message: threadContextForbidden(thread)})
		return
	}
	connection, err := s.db.GetInferenceConnectionByOwner(r.Context(), database.GetInferenceConnectionByOwnerParams{ID: run.ConnectionID, UserID: uid})
	if err != nil || connection.Status != "active" {
		httpapi.Write(r.Context(), w, http.StatusNotFound, chroniclesdk.Response{Message: "Inference connection not found."})
		return
	}

	var pending database.InferenceClientToolRequest
	err = s.db.InTx(r.Context(), func(tx database.Store) error {
		pending, err = tx.GetInferenceClientToolRequestForUpdate(r.Context(), database.GetInferenceClientToolRequestForUpdateParams{RunID: run.ID, ToolCallID: toolCallID, UserID: uid})
		if err != nil {
			return err
		}
		if err := validateClientToolContinuation(pending, request, thread.ContextID.String); err != nil {
			return err
		}
		if _, err = tx.CompleteInferenceClientToolRequest(r.Context(), database.CompleteInferenceClientToolRequestParams{RunID: run.ID, ToolCallID: toolCallID}); err != nil {
			return err
		}
		toolMessage := Message{Role: RoleTool, Name: pending.ToolName, ToolCallID: pending.ToolCallID, Content: content}
		if err = insertInferenceMessages(r.Context(), tx, thread.ID, toolMessage); err != nil {
			return err
		}
		_, err = tx.ResumeInferenceRun(r.Context(), database.ResumeInferenceRunParams{ID: run.ID, UserID: uid, LeaseExpiresAt: pgtype.Timestamptz{Time: time.Now().Add(runLease), Valid: true}})
		return err
	}, nil)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) || errors.Is(err, errClientToolMismatch) {
			httpapi.Write(r.Context(), w, http.StatusConflict, chroniclesdk.Response{Message: "This client tool result does not match the pending request."})
			return
		}
		s.internalError(w, "continue inference client tool", err)
		return
	}

	rows, err := s.db.ListRecentInferenceMessagesByThread(r.Context(), database.ListRecentInferenceMessagesByThreadParams{ThreadID: thread.ID, Limit: maxHistoryMessages})
	if err != nil {
		s.internalError(w, "load inference thread history", err)
		return
	}
	history := boundedHistory(rows)
	capability := &clientCapability{ID: pending.CapabilityID, Version: int(pending.CapabilityVersion), ScopeType: pending.ScopeType.String, ScopeID: pending.ScopeID.String, SessionID: pending.ClientSessionID, StateRevision: request.StateRevision}
	assistantDefinition, ok := assistants[run.AssistantID]
	if !ok {
		s.internalError(w, "load inference assistant", errors.New("unknown assistant"))
		return
	}
	if !s.requireAssistantEnabled(w, r, assistantDefinition.ID) {
		return
	}
	assistantDefinition = withClientTools(assistantDefinition, capability)
	writer := agui.NewWriter(w)
	if err := writer.Write(agui.RunStartedEvent{ThreadID: thread.ID.String(), RunID: run.IdempotencyKey, ProtocolVersion: "1.0"}); err != nil {
		_ = s.finishRun(r.Context(), run, "error", agentLoopState{Usage: Usage{PromptTokens: int(run.InputTokens), CompletionTokens: int(run.OutputTokens), TotalTokens: int(run.InputTokens + run.OutputTokens)}, IterationCount: int(run.IterationCount), ToolCallCount: int(run.ToolCallCount)}, "stream_error")
		return
	}
	if err := writer.Write(agui.ToolCallEndEvent{ToolCallID: pending.ToolCallID}); err != nil {
		_ = s.finishRun(r.Context(), run, "error", agentLoopState{Usage: Usage{PromptTokens: int(run.InputTokens), CompletionTokens: int(run.OutputTokens), TotalTokens: int(run.InputTokens + run.OutputTokens)}, IterationCount: int(run.IterationCount), ToolCallCount: int(run.ToolCallCount)}, "stream_error")
		return
	}
	debug := debugRunContext{Enabled: run.Debug, UsageEvents: request.UsageEvents, RunID: run.IdempotencyKey, ThreadID: thread.ID.String(), Persistence: "durable", ContextType: thread.ContextType.String, ContextID: thread.ContextID.String}
	state := agentLoopState{Usage: Usage{PromptTokens: int(run.InputTokens), CompletionTokens: int(run.OutputTokens), TotalTokens: int(run.InputTokens + run.OutputTokens)}, IterationCount: int(run.IterationCount), ToolCallCount: int(run.ToolCallCount)}
	// Debug snapshots show the whole run's usage, so carry over what the paused calls cost.
	if prior, err := s.db.GetInferenceRunUsage(r.Context(), run.ID); err == nil {
		state.Usage.CachedTokens, state.Usage.ReasoningTokens = int(prior.CachedTokens), int(prior.ReasoningTokens)
		if prior.CostedCalls > 0 {
			state.Usage.CostNanos = &prior.CostNanos
		}
	}
	persist := func(messages ...Message) error {
		return s.persistInferenceMessages(r.Context(), thread.ID, messages...)
	}
	if terminalMessage, terminal := terminalClientToolFailureMessage(request); terminal {
		message := Message{ID: uuid.NewString(), Role: RoleAssistant, Content: terminalMessage}
		if err := writer.Write(agui.TextMessageStartEvent{MessageID: message.ID, Role: "assistant"}); err != nil {
			_ = s.finishRun(r.Context(), run, "error", state, "stream_error")
			return
		}
		if err := writer.Write(agui.TextMessageContentEvent{MessageID: message.ID, Delta: message.Content}); err != nil {
			_ = s.finishRun(r.Context(), run, "error", state, "stream_error")
			return
		}
		if err := persist(message); err != nil {
			_ = s.finishRun(r.Context(), run, "error", state, "persistence_error")
			_ = writer.Write(agui.RunErrorEvent{Message: "The inference run could not be finalized.", Code: "persistence_error"})
			return
		}
		debugMessages := append([]Message{{Role: RoleSystem, Content: assistantDefinition.System}}, history...)
		debugMessages = append(debugMessages, message)
		if err := writeDebugSnapshot(writer, debug, state.IterationCount, "response", run.Model, assistantDefinition, debugMessages, state.Usage); err != nil {
			_ = s.finishRun(r.Context(), run, "error", state, "stream_error")
			return
		}
		if err := writer.Write(agui.TextMessageEndEvent{MessageID: message.ID}); err != nil {
			_ = s.finishRun(r.Context(), run, "error", state, "stream_error")
			return
		}
		if err := s.finishRun(r.Context(), run, "completed", state, ""); err != nil {
			_ = writer.Write(agui.RunErrorEvent{Message: "The inference run could not be finalized.", Code: "persistence_error"})
			return
		}
		_ = writer.Write(agui.RunFinishedEvent{ThreadID: thread.ID.String(), RunID: run.IdempotencyKey})
		return
	}

	provider, ok := s.registry.Provider(ProviderID(connection.Provider))
	if !ok {
		badRequest(w, r, "Unsupported provider.")
		return
	}
	credential, err := s.cipher.Decrypt(connection.EncryptedCredential, credentialAAD(uid.String(), "provider-credential"))
	if err != nil {
		s.internalError(w, "decrypt inference credential", err)
		return
	}

	pause := func(assistantMessage Message, toolMessages []Message, next clientToolPause, nextState agentLoopState) error {
		return s.pauseForClientTool(r.Context(), run, thread.ID, assistantMessage, toolMessages, next, nextState)
	}
	result, err := s.agentLoop(r.Context(), writer, provider, credential, run.Model, assistantDefinition, history, threadToolContext(s, thread), debug, capability, state, persist, pause, s.usageRecorder(r.Context(), run, &thread))
	if err != nil {
		if s.logger != nil {
			s.logger.Warn("continued inference run failed", "run_id", run.IdempotencyKey, "error", err)
		}
		_ = s.finishRun(r.Context(), run, "error", result.State, inferenceRunErrorCode(err))
		_ = writer.Write(inferenceRunErrorEvent(err))
		return
	}
	if result.Paused != nil {
		return
	}
	if err := s.finishRun(r.Context(), run, "completed", result.State, ""); err != nil {
		_ = writer.Write(agui.RunErrorEvent{Message: "The inference run could not be finalized.", Code: "persistence_error"})
		return
	}
	_ = writer.Write(agui.RunFinishedEvent{ThreadID: thread.ID.String(), RunID: run.IdempotencyKey})
}

var errClientToolMismatch = errors.New("client tool result mismatch")
