package serviceinference

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"slices"
	"strings"
	"time"

	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/api/httpapi"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/authz/policy"
	"github.com/Emyrk/chronicle/internal/services/serviceinference/agui"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
)

const (
	maxRunBody         = 256 << 10
	maxHistoryMessages = 50
	maxHistoryBytes    = 256 << 10
	maxIterations      = 5
	maxToolCalls       = 10
	maxToolArguments   = 16 << 10
	maxToolOutput      = 64 << 10
	maxAssistantText   = 256 << 10
)

type assistant struct {
	ID, System string
	Durable    bool
	// ContextType scopes durable threads ("instance" or "lua_project").
	ContextType string
	// ClientCapability is the browser capability whose tools this assistant may call.
	ClientCapability string
	Tools            []ToolDefinition
}

var pageCatalog = []map[string]string{
	{"path": "/recent", "name": "Recent raids", "description": "Browse recently uploaded raid logs"},
	{"path": "/leaderboards/statistics", "name": "Rankings", "description": "Player performance leaderboards and filters"},
	{"path": "/guilds", "name": "Guilds", "description": "Guild discovery and public guild pages"},
	{"path": "/upload", "name": "Upload", "description": "Upload a combat log"},
	{"path": "/account/settings", "name": "Account settings", "description": "Account profile and settings"},
}
var assistants = map[string]assistant{
	"site-help": {ID: "site-help", System: "You are Chronicle site help. Explain how to navigate Chronicle and answer rankings questions using tools. Never invent pages or ranking results.", Tools: []ToolDefinition{
		{Name: "list_pages", Description: "List known Chronicle pages.", Parameters: json.RawMessage(`{"type":"object","properties":{},"additionalProperties":false}`)},
		{Name: "find_pages", Description: "Find Chronicle pages by name or description.", Parameters: json.RawMessage(`{"type":"object","properties":{"query":{"type":"string","maxLength":100}},"required":["query"],"additionalProperties":false}`)},
		{Name: "query_rankings", Description: "Query a bounded Chronicle player leaderboard.", Parameters: json.RawMessage(`{"type":"object","properties":{"instance_name":{"type":"string","maxLength":100},"encounter":{"type":"string","maxLength":100},"class":{"type":"string","maxLength":30},"spec":{"type":"string","maxLength":50},"role":{"type":"string","maxLength":30},"metric":{"type":"string","enum":["dps","hps"]},"limit":{"type":"integer","minimum":1,"maximum":10}},"required":["instance_name"],"additionalProperties":false}`)},
	}},
	"lua-project-author": {ID: "lua-project-author", System: "You draft Lua panel source for Chronicle. Return ONLY a JSON object with exactly one key, main_lua, containing a Lua source string. No markdown, tar, manifest, extra keys, explanations, tool calls, publishing instructions, or claims that the code has been executed or tested. The user must review and explicitly upload the draft. Keep main_lua under 64 KiB. Chronicle's project.json is generated separately from owner project metadata; never ask for credentials or suggest bypassing the sandbox. You have no access to the user's projects, existing draft, instance data, or runtime APIs beyond what the user describes. If unsure about an API, write a minimal Lua draft and state uncertainty in Lua comments."},
	"lua-workshop":       {ID: "lua-workshop", Durable: true, ContextType: "lua_project", ClientCapability: luaEditorCapabilityID, System: luaWorkshopSystem},
	"instance-analyst": {ID: "instance-analyst", Durable: true, ContextType: "instance", ClientCapability: instancePageCapabilityID, System: "You are a Chronicle raid instance analyst. Use instance_summary for bounded metadata, encounter, and roster context. You may inspect, query, or update the current instance UI only through advertised client tools. Do not claim access to raw event streams. If a client tool returns user_rejected or capability_unavailable, do not retry the same mutation; explain why it could not be completed. After stale_state, inspect once for fresh state before retrying at most once.", Tools: []ToolDefinition{
		{Name: "instance_summary", Description: "Return bounded metadata, encounters, and players for this authorized raid instance.", Parameters: json.RawMessage(`{"type":"object","properties":{},"additionalProperties":false}`)},
	}},
}

type debugRunContext struct {
	Enabled     bool
	RunID       string
	ThreadID    string
	Persistence string
	ContextType string
	ContextID   string
}

func debugSnapshotEvent(debug debugRunContext, iteration int, phase, model string, a assistant, messages []Message, usage Usage) agui.DebugSnapshotEvent {
	debugMessages := make([]agui.DebugMessage, 0, len(messages))
	for _, message := range messages {
		debugMessage := agui.DebugMessage{
			Role:       string(message.Role),
			Name:       message.Name,
			Content:    message.Content,
			ToolCallID: message.ToolCallID,
		}
		for _, toolCall := range message.ToolCalls {
			debugMessage.ToolCalls = append(debugMessage.ToolCalls, agui.DebugToolCall{
				ID:        toolCall.ID,
				Name:      toolCall.Name,
				Arguments: toolCall.Arguments,
			})
		}
		debugMessages = append(debugMessages, debugMessage)
	}
	debugTools := make([]agui.DebugTool, 0, len(a.Tools))
	for _, tool := range a.Tools {
		debugTools = append(debugTools, agui.DebugTool{
			Name:        tool.Name,
			Description: tool.Description,
			Parameters:  slices.Clone(tool.Parameters),
		})
	}
	return agui.DebugSnapshotEvent{
		RunID:       debug.RunID,
		Iteration:   iteration,
		Phase:       phase,
		AssistantID: a.ID,
		Model:       model,
		Persistence: debug.Persistence,
		ContextType: debug.ContextType,
		ContextID:   debug.ContextID,
		Messages:    debugMessages,
		Tools:       debugTools,
		Skills:      make([]agui.DebugSkill, 0),
		Limits: agui.DebugLimits{
			MaxHistoryMessages: maxHistoryMessages,
			MaxHistoryBytes:    maxHistoryBytes,
			MaxIterations:      maxIterations,
			MaxToolCalls:       maxToolCalls,
			MaxToolArguments:   maxToolArguments,
			MaxToolOutput:      maxToolOutput,
			MaxAssistantText:   maxAssistantText,
		},
		Usage: agui.DebugUsage{
			PromptTokens:     usage.PromptTokens,
			CompletionTokens: usage.CompletionTokens,
			TotalTokens:      usage.TotalTokens,
		},
	}
}

type toolContext struct {
	service    *Service
	instanceID uuid.UUID
}

func usedToolCallIDs(messages []Message) map[string]struct{} {
	used := make(map[string]struct{})
	for _, message := range messages {
		if message.ToolCallID != "" {
			used[message.ToolCallID] = struct{}{}
		}
		for _, call := range message.ToolCalls {
			if call.ID != "" {
				used[call.ID] = struct{}{}
			}
		}
	}
	return used
}

func reserveToolCallID(candidate string, used map[string]struct{}) string {
	if candidate != "" && len(candidate) <= 200 {
		if _, exists := used[candidate]; !exists {
			used[candidate] = struct{}{}
			return candidate
		}
	}
	for {
		generated := "call-" + uuid.NewString()
		if _, exists := used[generated]; !exists {
			used[generated] = struct{}{}
			return generated
		}
	}
}

type toolCallAccumulator struct {
	ID, Name string
	Args     strings.Builder
}

func decodeStrict(raw string, dst any) error {
	if len(raw) > maxToolArguments {
		return errors.New("tool arguments too large")
	}
	dec := json.NewDecoder(bytes.NewBufferString(raw))
	dec.DisallowUnknownFields()
	if err := dec.Decode(dst); err != nil {
		return err
	}
	var trailing json.RawMessage
	if err := dec.Decode(&trailing); !errors.Is(err, io.EOF) {
		if err == nil {
			return errors.New("multiple JSON values")
		}
		return err
	}
	return nil
}
func boundedJSON(v any) (string, error) {
	b, err := json.Marshal(v)
	if err != nil {
		return "", err
	}
	if len(b) > maxToolOutput {
		return "", errors.New("tool output too large")
	}
	return string(b), nil
}

func (s *Service) executeTool(ctx context.Context, tc toolContext, name, args string) (string, error) {
	switch name {
	case "list_pages":
		var in struct{}
		if err := decodeStrict(args, &in); err != nil {
			return "", err
		}
		return boundedJSON(pageCatalog)
	case "find_pages":
		var in struct {
			Query string `json:"query"`
		}
		if err := decodeStrict(args, &in); err != nil {
			return "", err
		}
		q := strings.ToLower(strings.TrimSpace(in.Query))
		if q == "" || len(q) > 100 {
			return "", errors.New("invalid query")
		}
		out := make([]map[string]string, 0, 5)
		for _, p := range pageCatalog {
			if strings.Contains(strings.ToLower(p["name"]+" "+p["description"]+" "+p["path"]), q) {
				out = append(out, p)
			}
		}
		return boundedJSON(out)
	case "query_rankings":
		var in struct {
			InstanceName string `json:"instance_name"`
			Encounter    string `json:"encounter"`
			Class        string `json:"class"`
			Spec         string `json:"spec"`
			Role         string `json:"role"`
			Metric       string `json:"metric"`
			Limit        int64  `json:"limit"`
		}
		if err := decodeStrict(args, &in); err != nil {
			return "", err
		}
		if strings.TrimSpace(in.InstanceName) == "" || len(in.InstanceName) > 100 {
			return "", errors.New("instance_name must be 1-100 characters")
		}
		if len(in.Encounter) > 100 || len(in.Class) > 30 || len(in.Spec) > 50 || len(in.Role) > 30 {
			return "", errors.New("ranking filter is too long")
		}
		if in.Limit == 0 {
			in.Limit = 10
		}
		if in.Limit < 1 || in.Limit > 10 {
			return "", errors.New("limit must be 1-10")
		}
		if in.Metric == "" {
			in.Metric = "dps"
		}
		if in.Metric != "dps" && in.Metric != "hps" {
			return "", errors.New("metric must be dps or hps")
		}
		encounters := []string{}
		if in.Encounter != "" {
			encounters = []string{in.Encounter}
		}
		rows, err := s.db.RankingsLeaderboard(ctx, database.RankingsLeaderboardParams{Metric: in.Metric, QueryLimit: in.Limit, Class: in.Class, Spec: in.Spec, Role: in.Role, InstanceNames: []string{in.InstanceName}, EncounterNames: encounters, SinceDays: 0, HideUnknowns: true})
		if err != nil {
			return "", err
		}
		type result struct {
			Name, Class, Spec, Role, Instance, Encounter, Realm, Guild, Metric string
			Value                                                              float64 `json:"value"`
			LogSlug                                                            string  `json:"log_slug"`
		}
		out := make([]result, 0, len(rows))
		for _, row := range rows {
			value := row.Dps
			if in.Metric == "hps" {
				value = row.Hps
			}
			out = append(out, result{Name: row.PlayerName, Class: row.PlayerClass, Spec: row.PlayerSpec, Role: row.PlayerRole, Instance: row.InstanceName, Encounter: row.EncounterName, Realm: row.RealmName, Guild: row.GuildName, Metric: in.Metric, Value: value, LogSlug: row.LogHashedSlug})
		}
		return boundedJSON(out)
	case "instance_summary":
		var in struct{}
		if err := decodeStrict(args, &in); err != nil {
			return "", err
		}
		if tc.instanceID == uuid.Nil {
			return "", errors.New("instance context required")
		}
		inst, err := s.db.Instance(ctx, tc.instanceID)
		if err != nil {
			return "", err
		}
		encounters, err := s.db.ListInferenceInstanceEncounters(ctx, inst.ID)
		if err != nil {
			return "", err
		}
		players, err := s.db.ListInferenceInstancePlayers(ctx, inst.ID)
		if err != nil {
			return "", err
		}
		type enc struct {
			Name            string  `json:"name"`
			Boss            bool    `json:"boss"`
			KillType        string  `json:"kill_type"`
			DurationSeconds float64 `json:"duration_seconds"`
		}
		eo := make([]enc, 0, len(encounters))
		for _, e := range encounters {
			eo = append(eo, enc{Name: e.Name, Boss: e.Boss, KillType: string(e.KillType), DurationSeconds: e.EndTime.Time.Sub(e.StartTime.Time).Seconds()})
		}
		type player struct {
			Name, Class, Race string
			Level             int32
		}
		po := make([]player, 0, len(players))
		for _, p := range players {
			po = append(po, player{Name: p.Name, Class: string(p.Class), Race: string(p.Race), Level: p.Level})
		}
		return boundedJSON(struct {
			ID                            uuid.UUID `json:"id"`
			Slug, Name, Realm, Difficulty string
			Start, End                    time.Time
			Encounters                    []enc
			Players                       []player
		}{inst.ID, inst.HashedSlug.String, inst.Name, inst.RealmName, inst.DifficultyName, inst.StartTime.Time, inst.EndTime.Time, eo, po})
	default:
		return "", errors.New("unknown tool")
	}
}

func sdkMessage(m chroniclesdk.InferenceMessage) (Message, error) {
	role := Role(m.Role)
	if role != RoleUser && role != RoleAssistant {
		return Message{}, errors.New("only user and assistant browser messages are allowed")
	}
	if len(m.Content) > 32<<10 {
		return Message{}, errors.New("message too large")
	}
	return Message{ID: m.ID, Role: role, Name: m.Name, Content: m.Content}, nil
}

func boundedHistory(rows []database.InferenceMessage) []Message {
	messages := make([]Message, 0, len(rows))
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
		messages = append(messages, message)
	}
	slices.Reverse(messages)
	for len(messages) > 0 && messages[0].Role != RoleUser {
		messages = messages[1:]
	}
	return messages
}

const runLease = 15 * time.Minute

func supersedeAwaitingClientTool(ctx context.Context, tx database.Store, threadID, userID uuid.UUID) error {
	pending, err := tx.GetPendingInferenceClientToolRequestByThreadForUpdate(ctx, database.GetPendingInferenceClientToolRequestByThreadForUpdateParams{
		ThreadID: threadID,
		UserID:   userID,
	})
	if errors.Is(err, pgx.ErrNoRows) {
		return nil
	}
	if err != nil {
		return err
	}

	content, err := boundedJSON(struct {
		Status string `json:"status"`
	}{Status: "client_error"})
	if err != nil {
		return err
	}
	if err := insertInferenceMessages(ctx, tx, threadID, Message{
		Role:       RoleTool,
		Name:       pending.ToolName,
		ToolCallID: pending.ToolCallID,
		Content:    content,
	}); err != nil {
		return err
	}
	if _, err := tx.ExpireInferenceClientToolRequest(ctx, database.ExpireInferenceClientToolRequestParams{
		RunID:      pending.RunID,
		ToolCallID: pending.ToolCallID,
	}); err != nil {
		return err
	}
	_, err = tx.AbandonAwaitingInferenceRun(ctx, database.AbandonAwaitingInferenceRunParams{
		ID:     pending.RunID,
		UserID: userID,
	})
	return err
}

func (s *Service) createRun(
	ctx context.Context,
	params database.InsertInferenceRunParams,
	input *Message,
) (database.InferenceRun, error) {
	if _, err := s.db.ExpireStaleInferenceRuns(ctx); err != nil {
		return database.InferenceRun{}, fmt.Errorf("expire stale inference runs: %w", err)
	}
	if input == nil || !params.ThreadID.Valid {
		return s.db.InsertInferenceRun(ctx, params)
	}

	var run database.InferenceRun
	err := s.db.InTx(ctx, func(tx database.Store) error {
		if err := supersedeAwaitingClientTool(ctx, tx, params.ThreadID.UUID, params.UserID); err != nil {
			return err
		}
		var err error
		run, err = tx.InsertInferenceRun(ctx, params)
		if err != nil {
			return err
		}
		_, err = tx.InsertInferenceMessage(ctx, database.InsertInferenceMessageParams{
			ThreadID: params.ThreadID.UUID,
			Role:     string(RoleUser),
			Content:  writeJSONMessage(*input),
		})
		return err
	}, nil)
	return run, err
}

func (s *Service) run(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, maxRunBody)
	var req chroniclesdk.InferenceRunRequest
	if !httpapi.Read(r.Context(), w, r, &req) {
		return
	}
	uid := userID(r)
	if req.RunID == "" || len(req.RunID) > 100 {
		badRequest(w, r, "A bounded run_id is required.")
		return
	}
	a, ok := assistants[req.AssistantID]
	if !ok {
		badRequest(w, r, "Unknown assistant.")
		return
	}
	if req.Model == "" || len(req.Model) > 200 {
		badRequest(w, r, "A model is required.")
		return
	}
	if req.Debug {
		allowed, err := s.zed.CheckOne(r.Context(), nil, policy.New().GlobalChronicle().CanDebug_inference_chat_User(policy.New().User(uid)))
		if err != nil {
			s.internalError(w, "authorize inference debug", err)
			return
		}
		if !allowed {
			httpapi.Write(r.Context(), w, http.StatusForbidden, chroniclesdk.Response{Message: "Inference debug access is not enabled for this account."})
			return
		}
	}
	if _, err := s.db.GetInferenceRunByIdempotencyKey(r.Context(), database.GetInferenceRunByIdempotencyKeyParams{UserID: uid, IdempotencyKey: req.RunID}); err == nil {
		httpapi.Write(r.Context(), w, http.StatusConflict, chroniclesdk.Response{Message: "This run_id was already used."})
		return
	} else if !errors.Is(err, pgx.ErrNoRows) {
		s.internalError(w, "look up inference run", err)
		return
	}
	conn, err := s.db.GetInferenceConnectionByOwner(r.Context(), database.GetInferenceConnectionByOwnerParams{ID: req.ConnectionID, UserID: uid})
	if err != nil || conn.Status != "active" {
		httpapi.Write(r.Context(), w, http.StatusNotFound, chroniclesdk.Response{Message: "Inference connection not found."})
		return
	}
	provider, ok := s.registry.Provider(ProviderID(conn.Provider))
	if !ok {
		badRequest(w, r, "Unsupported provider.")
		return
	}
	cred, err := s.cipher.Decrypt(conn.EncryptedCredential, credentialAAD(uid.String(), "provider-credential"))
	if err != nil {
		s.internalError(w, "decrypt inference credential", err)
		return
	}
	var thread database.InferenceThread
	var threadID uuid.NullUUID
	var history []Message
	var input Message
	var client *clientCapability
	var tc toolContext
	tc.service = s
	if a.Durable {
		if req.ThreadID == nil || req.Message == nil || len(req.Messages) > 0 {
			badRequest(w, r, "Durable runs require thread_id and one message.")
			return
		}
		thread, err = s.db.GetInferenceThreadByOwner(r.Context(), database.GetInferenceThreadByOwnerParams{ID: *req.ThreadID, UserID: uid})
		if err != nil || thread.AssistantID != a.ID || thread.Persistence != "durable" || thread.ContextType.String != a.ContextType {
			httpapi.Write(r.Context(), w, http.StatusNotFound, chroniclesdk.Response{Message: "Thread not found."})
			return
		}
		if (a.ContextType == "instance" && req.Instance != thread.ContextID.String) || (a.ContextType != "instance" && req.Instance != "") {
			badRequest(w, r, "Thread does not belong to the requested instance.")
			return
		}
		if err := s.authorizeThreadContext(r, thread); err != nil {
			httpapi.Write(r.Context(), w, http.StatusForbidden, chroniclesdk.Response{Message: threadContextForbidden(thread)})
			return
		}
		client, err = advertisedClient(req.Client, clientCapabilities[a.ClientCapability], thread.ContextID.String)
		if err != nil {
			badRequest(w, r, err.Error())
			return
		}
		a = withClientTools(a, client)
		tc = threadToolContext(s, thread)
		threadID = uuid.NullUUID{UUID: thread.ID, Valid: true}
		rows, err := s.db.ListRecentInferenceMessagesByThread(r.Context(), database.ListRecentInferenceMessagesByThreadParams{ThreadID: thread.ID, Limit: maxHistoryMessages})
		if err != nil {
			s.internalError(w, "load inference thread history", err)
			return
		}
		history = boundedHistory(rows)
		input, err = sdkMessage(*req.Message)
		if err != nil || input.Role != RoleUser {
			badRequest(w, r, "A valid user message is required.")
			return
		}
		history = append(history, input)
	} else {
		if req.Client != nil {
			badRequest(w, r, "Client tools are not supported for this assistant.")
			return
		}
		if req.ThreadID != nil || req.Message != nil || len(req.Messages) == 0 || len(req.Messages) > maxHistoryMessages {
			badRequest(w, r, "Ephemeral runs require 1-50 browser messages and no thread.")
			return
		}
		for _, m := range req.Messages {
			x, e := sdkMessage(m)
			if e != nil {
				badRequest(w, r, e.Error())
				return
			}
			history = append(history, x)
		}
		input = history[len(history)-1]
		if input.Role != RoleUser {
			badRequest(w, r, "Last message must be from the user.")
			return
		}
	}
	runParams := database.InsertInferenceRunParams{
		ThreadID:       threadID,
		UserID:         uid,
		ConnectionID:   conn.ID,
		AssistantID:    a.ID,
		Model:          req.Model,
		Status:         "running",
		IdempotencyKey: req.RunID,
		Debug:          req.Debug,
		LeaseExpiresAt: pgtype.Timestamptz{Time: time.Now().Add(runLease), Valid: true},
	}
	var durableInput *Message
	if a.Durable {
		durableInput = &input
	}
	runRow, err := s.createRun(r.Context(), runParams, durableInput)
	if err != nil {
		if database.IsUniqueViolation(err, database.UniqueConstraint("inference_runs_one_active_per_thread_idx")) {
			httpapi.Write(r.Context(), w, http.StatusConflict, chroniclesdk.Response{Message: "This thread already has a run in progress."})
			return
		}
		if database.IsUniqueViolation(err) {
			httpapi.Write(r.Context(), w, http.StatusConflict, chroniclesdk.Response{Message: "This run_id was already used."})
			return
		}
		s.internalError(w, "create inference run", err)
		return
	}
	if _, err := s.db.UpdateInferenceConnectionLastUsedByOwner(r.Context(), database.UpdateInferenceConnectionLastUsedByOwnerParams{ID: conn.ID, UserID: uid}); err != nil {
		s.logger.Warn("update inference connection last used", "error", err)
	}
	writer := agui.NewWriter(w)
	streamThread := runRow.ID.String()
	if threadID.Valid {
		streamThread = threadID.UUID.String()
	}
	if err = writer.Write(agui.RunStartedEvent{ThreadID: streamThread, RunID: req.RunID, ProtocolVersion: "1.0"}); err != nil {
		_ = s.finishRun(r.Context(), runRow, "error", agentLoopState{}, "stream_error")
		return
	}
	debug := debugRunContext{
		Enabled:     req.Debug,
		RunID:       req.RunID,
		ThreadID:    streamThread,
		Persistence: "ephemeral",
	}
	if a.Durable {
		debug.Persistence = "durable"
		debug.ContextType = thread.ContextType.String
		debug.ContextID = thread.ContextID.String
	}
	persist := func(messages ...Message) error {
		if !a.Durable {
			return nil
		}
		return s.persistInferenceMessages(r.Context(), thread.ID, messages...)
	}
	pause := func(assistantMessage Message, toolMessages []Message, pending clientToolPause, state agentLoopState) error {
		return s.pauseForClientTool(r.Context(), runRow, thread.ID, assistantMessage, toolMessages, pending, state)
	}
	result, err := s.agentLoop(r.Context(), writer, provider, cred, req.Model, a, history, tc, debug, client, agentLoopState{}, persist, pause)
	if err != nil {
		if s.logger != nil {
			s.logger.Warn("inference run failed", "run_id", req.RunID, "error", err)
		}
		_ = s.finishRun(r.Context(), runRow, "error", result.State, inferenceRunErrorCode(err))
		_ = writer.Write(inferenceRunErrorEvent(err))
		return
	}
	if result.Paused != nil {
		return
	}
	if err := s.finishRun(r.Context(), runRow, "completed", result.State, ""); err != nil {
		_ = writer.Write(agui.RunErrorEvent{Message: "The inference run could not be finalized.", Code: "persistence_error"})
		return
	}
	_ = writer.Write(agui.RunFinishedEvent{ThreadID: streamThread, RunID: req.RunID})
}
func insertInferenceMessages(ctx context.Context, store database.Store, threadID uuid.UUID, messages ...Message) error {
	for _, message := range messages {
		if _, err := store.InsertInferenceMessage(ctx, database.InsertInferenceMessageParams{ThreadID: threadID, Role: string(message.Role), Content: writeJSONMessage(message), ToolCallID: pgtype.Text{String: message.ToolCallID, Valid: message.ToolCallID != ""}}); err != nil {
			return err
		}
	}
	return nil
}

func (s *Service) persistInferenceMessages(ctx context.Context, threadID uuid.UUID, messages ...Message) error {
	return s.db.InTx(ctx, func(tx database.Store) error {
		return insertInferenceMessages(ctx, tx, threadID, messages...)
	}, nil)
}

func (s *Service) pauseForClientTool(ctx context.Context, run database.InferenceRun, threadID uuid.UUID, assistantMessage Message, toolMessages []Message, pending clientToolPause, state agentLoopState) error {
	return s.db.InTx(ctx, func(tx database.Store) error {
		messages := append([]Message{assistantMessage}, toolMessages...)
		if err := insertInferenceMessages(ctx, tx, threadID, messages...); err != nil {
			return err
		}
		if _, err := tx.InsertInferenceClientToolRequest(ctx, database.InsertInferenceClientToolRequestParams{
			RunID: run.ID, ThreadID: threadID, ToolCallID: pending.Call.ID, ToolName: pending.Call.Name,
			Arguments: pending.Arguments, CapabilityID: pending.Capability.ID, CapabilityVersion: int32(pending.Capability.Version),
			ScopeType:       pgtype.Text{String: pending.Capability.ScopeType, Valid: pending.Capability.ScopeType != ""},
			ScopeID:         pgtype.Text{String: pending.Capability.ScopeID, Valid: pending.Capability.ScopeID != ""},
			ClientSessionID: pending.Capability.SessionID, StateRevision: int64PointerPG(pending.Capability.StateRevision),
			Effect: pending.Effect, Confirmation: pending.Confirmation,
		}); err != nil {
			return err
		}
		_, err := tx.PauseInferenceRun(ctx, database.PauseInferenceRunParams{
			ID: run.ID, UserID: run.UserID, InputTokens: int64(state.Usage.PromptTokens), OutputTokens: int64(state.Usage.CompletionTokens),
			IterationCount: int32(state.IterationCount), ToolCallCount: int32(state.ToolCallCount),
			LeaseExpiresAt: pgtype.Timestamptz{Time: time.Now().Add(runLease), Valid: true},
		})
		return err
	}, nil)
}

func int64PointerPG(value *int64) pgtype.Int8 {
	if value == nil {
		return pgtype.Int8{}
	}
	return pgtype.Int8{Int64: *value, Valid: true}
}

func finalizationContext(ctx context.Context) (context.Context, context.CancelFunc) {
	return context.WithTimeout(context.WithoutCancel(ctx), 5*time.Second)
}

func (s *Service) finishRun(ctx context.Context, row database.InferenceRun, status string, state agentLoopState, code string) error {
	ctx, cancel := finalizationContext(ctx)
	defer cancel()
	_, err := s.db.UpdateInferenceRun(ctx, database.UpdateInferenceRunParams{ID: row.ID, UserID: row.UserID, Status: status, InputTokens: int64(state.Usage.PromptTokens), OutputTokens: int64(state.Usage.CompletionTokens), ErrorCode: pgtype.Text{String: code, Valid: code != ""}, CompletedAt: pgtype.Timestamptz{Time: time.Now(), Valid: true}, IterationCount: int32(state.IterationCount), ToolCallCount: int32(state.ToolCallCount)})
	if err != nil {
		s.logger.Error("update inference run", "error", err)
	}
	return err
}

func writeDebugSnapshot(w *agui.Writer, debug debugRunContext, iteration int, phase, model string, a assistant, messages []Message, usage Usage) error {
	if !debug.Enabled {
		return nil
	}
	return w.Write(debugSnapshotEvent(debug, iteration, phase, model, a, messages, usage))
}

var (
	errAgentIterationLimit = errors.New("agent iteration limit reached")
	errAgentToolLimit      = errors.New("agent tool-call limit reached")
)

func inferenceRunErrorCode(err error) string {
	var providerErr *ProviderError
	if errors.As(err, &providerErr) && strings.TrimSpace(providerErr.Code) != "" {
		return strings.TrimSpace(providerErr.Code)
	}
	if errors.Is(err, errAgentIterationLimit) || errors.Is(err, errAgentToolLimit) {
		return "agent_limit"
	}
	return "provider_error"
}

func inferenceRunErrorEvent(err error) agui.RunErrorEvent {
	var providerErr *ProviderError
	if errors.As(err, &providerErr) && strings.TrimSpace(providerErr.UserMessage) != "" {
		return agui.RunErrorEvent{Message: providerErr.UserMessage, Code: inferenceRunErrorCode(err)}
	}
	if errors.Is(err, errAgentIterationLimit) || errors.Is(err, errAgentToolLimit) {
		return agui.RunErrorEvent{
			Message: "The assistant could not finish within the tool-step limit. The page may be read-only or changing; review the last tool result and try again.",
			Code:    "agent_limit",
		}
	}
	return agui.RunErrorEvent{Message: "The inference run failed. Please try again.", Code: "provider_error"}
}

type agentLoopState struct {
	Usage          Usage
	IterationCount int
	ToolCallCount  int
}

type clientToolPause struct {
	Call         ToolCall
	Arguments    json.RawMessage
	Capability   clientCapability
	Effect       string
	Confirmation string
}

type agentLoopResult struct {
	State  agentLoopState
	Paused *clientToolPause
}

type pauseClientToolFunc func(Message, []Message, clientToolPause, agentLoopState) error

func (s *Service) agentLoop(ctx context.Context, w *agui.Writer, provider Provider, credential []byte, model string, a assistant, messages []Message, tc toolContext, debug debugRunContext, capability *clientCapability, state agentLoopState, persist func(...Message) error, pause pauseClientToolFunc) (agentLoopResult, error) {
	messages = append([]Message{{Role: RoleSystem, Content: a.System}}, messages...)
	usedCallIDs := usedToolCallIDs(messages)
	for state.IterationCount <= maxIterations {
		finalizationOnly := state.IterationCount == maxIterations
		iteration := state.IterationCount + 1
		requestAssistant := a
		requestMessages := messages
		if finalizationOnly {
			requestAssistant.Tools = nil
			requestMessages = append(slices.Clone(messages), Message{
				Role:    RoleSystem,
				Content: "The tool-step limit has been reached. Respond to the user now using the available results. Do not call any more tools.",
			})
		} else {
			state.IterationCount++
			iteration = state.IterationCount
		}
		if err := writeDebugSnapshot(w, debug, iteration, "request", model, requestAssistant, requestMessages, state.Usage); err != nil {
			return agentLoopResult{State: state}, err
		}
		messageID := uuid.NewString()
		var content strings.Builder
		calls := map[int]*toolCallAccumulator{}
		started := false
		finish := FinishReasonOther
		err := provider.StreamChat(ctx, credential, ChatRequest{Model: model, Messages: requestMessages, Tools: requestAssistant.Tools}, func(event StreamEvent) error {
			switch event.Type {
			case StreamEventTextDelta:
				if !started {
					started = true
					if err := w.Write(agui.TextMessageStartEvent{MessageID: messageID, Role: "assistant"}); err != nil {
						return err
					}
				}
				content.WriteString(event.Text)
				if content.Len() > maxAssistantText {
					return errors.New("assistant message too large")
				}
				return w.Write(agui.TextMessageContentEvent{MessageID: messageID, Delta: event.Text})
			case StreamEventToolCallDelta:
				c := calls[event.ToolCall.Index]
				if c == nil {
					c = &toolCallAccumulator{}
					calls[event.ToolCall.Index] = c
				}
				c.ID += event.ToolCall.ID
				c.Name += event.ToolCall.Name
				c.Args.WriteString(event.ToolCall.Arguments)
				if c.Args.Len() > maxToolArguments {
					return errors.New("tool arguments too large")
				}
			case StreamEventFinish:
				finish = event.FinishReason
			case StreamEventUsage:
				state.Usage.PromptTokens += event.Usage.PromptTokens
				state.Usage.CompletionTokens += event.Usage.CompletionTokens
				state.Usage.TotalTokens += event.Usage.TotalTokens
			}
			return nil
		})
		if err != nil {
			return agentLoopResult{State: state}, err
		}
		assistantMessage := Message{ID: messageID, Role: RoleAssistant, Content: content.String()}
		if finish != FinishReasonToolCalls || len(calls) == 0 {
			if err := persist(assistantMessage); err != nil {
				return agentLoopResult{State: state}, err
			}
			completedMessages := append(slices.Clone(requestMessages), assistantMessage)
			if err := writeDebugSnapshot(w, debug, iteration, "response", model, requestAssistant, completedMessages, state.Usage); err != nil {
				return agentLoopResult{State: state}, err
			}
			if started {
				if err := w.Write(agui.TextMessageEndEvent{MessageID: messageID}); err != nil {
					return agentLoopResult{State: state}, err
				}
			}
			return agentLoopResult{State: state}, nil
		}
		if finalizationOnly {
			return agentLoopResult{State: state}, errAgentIterationLimit
		}
		for i := 0; i < len(calls); i++ {
			c := calls[i]
			if c == nil || c.Name == "" {
				return agentLoopResult{State: state}, errors.New("invalid tool call")
			}
			callID := reserveToolCallID(c.ID, usedCallIDs)
			assistantMessage.ToolCalls = append(assistantMessage.ToolCalls, ToolCall{ID: callID, Name: c.Name, Arguments: c.Args.String()})
		}
		toolMessages := make([]Message, 0, len(assistantMessage.ToolCalls))
		var pending *clientToolPause
		for _, call := range assistantMessage.ToolCalls {
			state.ToolCallCount++
			if state.ToolCallCount > maxToolCalls {
				return agentLoopResult{State: state}, errAgentToolLimit
			}
			var clientTool clientToolDefinition
			var isClientTool bool
			if capability != nil {
				clientTool, isClientTool = clientToolByName(capability.ID, call.Name)
			}
			if isClientTool {
				if pending != nil {
					return agentLoopResult{State: state}, errors.New("multiple client tool calls are not supported")
				}
				arguments, err := validateClientToolArguments(call.Name, call.Arguments)
				if err != nil {
					return agentLoopResult{State: state}, err
				}
				pending = &clientToolPause{Call: call, Arguments: arguments, Capability: *capability, Effect: clientTool.Effect, Confirmation: clientTool.Confirmation}
				continue
			}
			if err := w.Write(agui.ToolCallStartEvent{ToolCallID: call.ID, ToolCallName: call.Name, ParentMessageID: messageID}); err != nil {
				return agentLoopResult{State: state}, err
			}
			if err := w.Write(agui.ToolCallArgsEvent{ToolCallID: call.ID, Delta: call.Arguments}); err != nil {
				return agentLoopResult{State: state}, err
			}
			output, err := s.executeTool(ctx, tc, call.Name, call.Arguments)
			if err != nil {
				output = `{"error":"invalid tool request"}`
			}
			toolMessages = append(toolMessages, Message{Role: RoleTool, Name: call.Name, ToolCallID: call.ID, Content: output})
		}
		persistedMessages := append([]Message{assistantMessage}, toolMessages...)
		if pending != nil {
			if pause == nil {
				return agentLoopResult{State: state}, errors.New("client tool pause is unavailable")
			}
			if err := pause(assistantMessage, toolMessages, *pending, state); err != nil {
				return agentLoopResult{State: state}, err
			}
		} else if err := persist(persistedMessages...); err != nil {
			return agentLoopResult{State: state}, err
		}
		if started {
			if err := w.Write(agui.TextMessageEndEvent{MessageID: messageID}); err != nil {
				return agentLoopResult{State: state}, err
			}
		}
		messages = append(messages, persistedMessages...)
		phase := "tool_results"
		if pending != nil {
			phase = "client_tool_request"
		}
		if err := writeDebugSnapshot(w, debug, iteration, phase, model, a, messages, state.Usage); err != nil {
			return agentLoopResult{State: state}, err
		}
		for _, toolMessage := range toolMessages {
			if err := w.Write(agui.ToolCallEndEvent{ToolCallID: toolMessage.ToolCallID}); err != nil {
				return agentLoopResult{State: state}, err
			}
		}
		if pending != nil {
			if err := w.Write(agui.ClientToolRequestEvent{
				RunID: debug.RunID, ThreadID: debug.ThreadID, ToolCallID: pending.Call.ID,
				ToolName: pending.Call.Name, Arguments: pending.Arguments,
				Capability: agui.ClientToolCapability{
					ID: pending.Capability.ID, Version: pending.Capability.Version,
					ScopeType: pending.Capability.ScopeType, ScopeID: pending.Capability.ScopeID,
					StateRevision: pending.Capability.StateRevision,
				},
				ClientSessionID: pending.Capability.SessionID,
				Effect:          pending.Effect, Confirmation: pending.Confirmation,
			}); err != nil {
				return agentLoopResult{State: state}, err
			}
			return agentLoopResult{State: state, Paused: pending}, nil
		}
	}
	return agentLoopResult{State: state}, errAgentIterationLimit
}
