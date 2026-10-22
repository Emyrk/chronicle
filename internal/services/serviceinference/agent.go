package serviceinference

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/api/httpapi"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/internal/services/serviceinference/agui"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
)

const (
	maxRunBody         = 256 << 10
	maxHistoryMessages = 50
	maxIterations      = 5
	maxToolCalls       = 10
	maxToolArguments   = 16 << 10
	maxToolOutput      = 64 << 10
)

type assistant struct {
	ID, System string
	Durable    bool
	Tools      []ToolDefinition
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
	"instance-analyst": {ID: "instance-analyst", Durable: true, System: "You are a read-only Chronicle raid instance analyst. Use the instance_summary tool for bounded metadata, encounter, and roster context. Do not claim access to raw event streams.", Tools: []ToolDefinition{
		{Name: "instance_summary", Description: "Return bounded metadata, encounters, and players for this authorized raid instance.", Parameters: json.RawMessage(`{"type":"object","properties":{},"additionalProperties":false}`)},
	}},
}

type toolContext struct {
	service    *Service
	instanceID uuid.UUID
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
			return "", errors.New("instance_name is required")
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
		encounters, err := s.db.EncountersByInstanceID(ctx, inst.ID)
		if err != nil {
			return "", err
		}
		players, err := s.db.InstancePlayersByInstanceID(ctx, inst.ID)
		if err != nil {
			return "", err
		}
		if len(encounters) > 100 {
			encounters = encounters[:100]
		}
		if len(players) > 100 {
			players = players[:100]
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
	if _, err := s.db.GetInferenceRunByIdempotencyKey(r.Context(), database.GetInferenceRunByIdempotencyKeyParams{UserID: uid, IdempotencyKey: req.RunID}); err == nil {
		httpapi.Write(r.Context(), w, http.StatusConflict, chroniclesdk.Response{Message: "This run_id was already used."})
		return
	} else if !errors.Is(err, pgx.ErrNoRows) {
		httpapi.InternalServerError(w, err)
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
		httpapi.InternalServerError(w, errors.New("decrypt inference credential"))
		return
	}
	var thread database.InferenceThread
	var threadID uuid.NullUUID
	var history []Message
	var input Message
	var tc toolContext
	tc.service = s
	if a.Durable {
		if req.ThreadID == nil || req.Message == nil || len(req.Messages) > 0 {
			badRequest(w, r, "Durable runs require thread_id and one message.")
			return
		}
		thread, err = s.db.GetInferenceThreadByOwner(r.Context(), database.GetInferenceThreadByOwnerParams{ID: *req.ThreadID, UserID: uid})
		if err != nil || thread.AssistantID != a.ID {
			httpapi.Write(r.Context(), w, http.StatusNotFound, chroniclesdk.Response{Message: "Thread not found."})
			return
		}
		inst, err := s.instanceForUser(r, thread.ContextID.String)
		if err != nil {
			httpapi.Write(r.Context(), w, http.StatusForbidden, chroniclesdk.Response{Message: "You cannot view this instance."})
			return
		}
		tc.instanceID = inst.ID
		threadID = uuid.NullUUID{UUID: thread.ID, Valid: true}
		rows, err := s.db.ListInferenceMessagesByThread(r.Context(), thread.ID)
		if err != nil {
			httpapi.InternalServerError(w, err)
			return
		}
		for _, row := range rows {
			var m Message
			if json.Unmarshal(row.Content, &m) == nil {
				history = append(history, m)
			}
		}
		input, err = sdkMessage(*req.Message)
		if err != nil || input.Role != RoleUser {
			badRequest(w, r, "A valid user message is required.")
			return
		}
		history = append(history, input)
	} else {
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
	runRow, err := s.db.InsertInferenceRun(r.Context(), database.InsertInferenceRunParams{ThreadID: threadID, UserID: uid, ConnectionID: conn.ID, AssistantID: a.ID, Model: req.Model, Status: "running", IdempotencyKey: req.RunID})
	if err != nil {
		httpapi.Write(r.Context(), w, http.StatusConflict, chroniclesdk.Response{Message: "This run_id was already used."})
		return
	}
	if a.Durable {
		if _, err = s.db.InsertInferenceMessage(r.Context(), database.InsertInferenceMessageParams{ThreadID: thread.ID, Role: string(RoleUser), Content: writeJSONMessage(input)}); err != nil {
			s.finishRun(r.Context(), runRow, "error", Usage{}, "persist_input")
			httpapi.InternalServerError(w, err)
			return
		}
	}
	writer := agui.NewWriter(w)
	streamThread := runRow.ID.String()
	if threadID.Valid {
		streamThread = threadID.UUID.String()
	}
	if err = writer.Write(agui.RunStartedEvent{ThreadID: streamThread, RunID: req.RunID, ProtocolVersion: "1.0"}); err != nil {
		return
	}
	usage, err := s.agentLoop(r.Context(), writer, provider, cred, req.Model, a, history, tc, func(m Message) error {
		if !a.Durable {
			return nil
		}
		_, e := s.db.InsertInferenceMessage(r.Context(), database.InsertInferenceMessageParams{ThreadID: thread.ID, Role: string(m.Role), Content: writeJSONMessage(m), ToolCallID: pgtype.Text{String: m.ToolCallID, Valid: m.ToolCallID != ""}})
		return e
	})
	if err != nil {
		s.finishRun(r.Context(), runRow, "error", usage, "provider_error")
		_ = writer.Write(agui.RunErrorEvent{Message: "The inference run failed.", Code: "provider_error"})
		return
	}
	s.finishRun(r.Context(), runRow, "completed", usage, "")
	_ = writer.Write(agui.RunFinishedEvent{ThreadID: streamThread, RunID: req.RunID})
}
func (s *Service) finishRun(ctx context.Context, row database.InferenceRun, status string, usage Usage, code string) {
	_, err := s.db.UpdateInferenceRun(ctx, database.UpdateInferenceRunParams{ID: row.ID, UserID: row.UserID, Status: status, InputTokens: int64(usage.PromptTokens), OutputTokens: int64(usage.CompletionTokens), ErrorCode: pgtype.Text{String: code, Valid: code != ""}, CompletedAt: pgtype.Timestamptz{Time: time.Now(), Valid: true}})
	if err != nil {
		s.logger.Error("update inference run", "error", err)
	}
}

func (s *Service) agentLoop(ctx context.Context, w *agui.Writer, provider Provider, credential []byte, model string, a assistant, messages []Message, tc toolContext, persist func(Message) error) (Usage, error) {
	messages = append([]Message{{Role: RoleSystem, Content: a.System}}, messages...)
	var usage Usage
	toolCount := 0
	for iteration := 0; iteration < maxIterations; iteration++ {
		messageID := uuid.NewString()
		var content strings.Builder
		calls := map[int]*toolCallAccumulator{}
		started := false
		finish := FinishReasonOther
		err := provider.StreamChat(ctx, credential, ChatRequest{Model: model, Messages: messages, Tools: a.Tools}, func(event StreamEvent) error {
			switch event.Type {
			case StreamEventTextDelta:
				if !started {
					started = true
					if err := w.Write(agui.TextMessageStartEvent{MessageID: messageID, Role: "assistant"}); err != nil {
						return err
					}
				}
				content.WriteString(event.Text)
				if content.Len() > 256<<10 {
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
				return nil
			case StreamEventFinish:
				finish = event.FinishReason
			case StreamEventUsage:
				usage.PromptTokens += event.Usage.PromptTokens
				usage.CompletionTokens += event.Usage.CompletionTokens
				usage.TotalTokens += event.Usage.TotalTokens
			}
			return nil
		})
		if err != nil {
			return usage, err
		}
		if started {
			if err := w.Write(agui.TextMessageEndEvent{MessageID: messageID}); err != nil {
				return usage, err
			}
		}
		assistantMessage := Message{ID: messageID, Role: RoleAssistant, Content: content.String()}
		if finish != FinishReasonToolCalls || len(calls) == 0 {
			if err := persist(assistantMessage); err != nil {
				return usage, err
			}
			return usage, nil
		}
		for i := 0; i < len(calls); i++ {
			c := calls[i]
			if c == nil || c.ID == "" || c.Name == "" {
				return usage, errors.New("invalid tool call")
			}
			assistantMessage.ToolCalls = append(assistantMessage.ToolCalls, ToolCall{ID: c.ID, Name: c.Name, Arguments: c.Args.String()})
		}
		if err := persist(assistantMessage); err != nil {
			return usage, err
		}
		messages = append(messages, assistantMessage)
		for _, call := range assistantMessage.ToolCalls {
			toolCount++
			if toolCount > maxToolCalls {
				return usage, errors.New("too many tool calls")
			}
			if err := w.Write(agui.ToolCallStartEvent{ToolCallID: call.ID, ToolCallName: call.Name, ParentMessageID: messageID}); err != nil {
				return usage, err
			}
			if err := w.Write(agui.ToolCallArgsEvent{ToolCallID: call.ID, Delta: call.Arguments}); err != nil {
				return usage, err
			}
			output, err := s.executeTool(ctx, tc, call.Name, call.Arguments)
			if err != nil {
				output = `{"error":"invalid tool request"}`
			}
			if err := w.Write(agui.ToolCallEndEvent{ToolCallID: call.ID}); err != nil {
				return usage, err
			}
			tm := Message{Role: RoleTool, Name: call.Name, ToolCallID: call.ID, Content: output}
			if err := persist(tm); err != nil {
				return usage, err
			}
			messages = append(messages, tm)
		}
	}
	return usage, errors.New("agent iteration limit reached")
}

var _ = fmt.Sprintf
