package serviceinference

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/authz/policy"
	"github.com/Emyrk/chronicle/internal/services/serviceinference/agui"
	"github.com/Emyrk/chronicle/internal/services/serviceinference/openrouter"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
)

// DiscordUserError is a safe message for an ephemeral Discord response.
type DiscordUserError struct{ Message string }

func (e *DiscordUserError) Error() string            { return e.Message }
func (e *DiscordUserError) IsDiscordUserError() bool { return true }

var discordAssistant = assistant{
	ID: "discord", Name: "Ask Chronicle",
	Skills: []string{chronicleConceptsSkillID},
	System: "You are Chronicle's Discord assistant. Be concise. Use search_instances for current raid data; never invent results or claim access beyond the tools. All searches are scoped to the user's saved Chronicle tenant. Cite returned Chronicle URLs. Avoid tables and long formatting.",
	Tools: []ToolDefinition{
		{Name: "discord_describe_instance_search", Description: "Describe valid Chronicle search filters for the saved tenant.", Parameters: json.RawMessage(`{"type":"object","properties":{},"additionalProperties":false}`)},
		{Name: "search_instances", Description: "Search up to ten Chronicle logs on the saved tenant with a validated query tree. Use discord_describe_instance_search for supported fields.", Parameters: json.RawMessage(`{"type":"object","properties":{"where":` + strings.ReplaceAll(searchWhereParameterSchema, "describe_instance_search", "discord_describe_instance_search") + `,"limit":{"type":"integer","minimum":1,"maximum":10}},"required":["where"],"additionalProperties":false}`)},
	},
}

// SetDiscordTenant validates and saves a linked user's tenant slug.
func (s *Service) SetDiscordTenant(ctx context.Context, userID uuid.UUID, discordID, slug string) (string, error) {
	if err := s.checkDiscordUse(ctx, userID, discordID); err != nil {
		return "", err
	}
	tenant, err := s.resolveSearchTenant(slug)
	if err != nil {
		return "", &DiscordUserError{"Unknown Chronicle tenant. Enter its subdomain slug."}
	}
	if err := s.setPersonalConfigKey(ctx, userID, configDiscordTenant, tenant.Slug.String); err != nil {
		return "", err
	}
	return tenant.Slug.String, nil
}

func (s *Service) GetDiscordTenant(ctx context.Context, userID uuid.UUID, discordID string) (string, error) {
	if err := s.checkDiscordUse(ctx, userID, discordID); err != nil {
		return "", err
	}
	config, err := s.personalConfig(ctx, userID)
	if err != nil {
		return "", err
	}
	return config.DiscordDefaultTenant, nil
}

func (s *Service) checkDiscordUse(ctx context.Context, userID uuid.UUID, discordID string) error {
	if err := s.checkDiscordLink(ctx, userID, discordID); err != nil {
		return err
	}
	allowed, err := s.zed.CheckOne(ctx, nil, policy.New().GlobalChronicle().CanUse_inference_chat_User(policy.New().User(userID)))
	if err != nil {
		return fmt.Errorf("authorize Discord inference: %w", err)
	}
	if !allowed {
		return &DiscordUserError{"AI is disabled or unavailable for your Chronicle account."}
	}
	return nil
}

func (s *Service) checkDiscordLink(ctx context.Context, userID uuid.UUID, discordID string) error {
	if discordID == "" || userID == uuid.Nil {
		return &DiscordUserError{"Link your Discord account to Chronicle first."}
	}
	link, err := s.db.GetUserAuthLinkByUserIDAndProvider(ctx, database.GetUserAuthLinkByUserIDAndProviderParams{UserID: userID, Provider: "discord"})
	if errors.Is(err, pgx.ErrNoRows) || (err == nil && link.LinkedID != discordID) {
		return &DiscordUserError{"Link your Discord account to Chronicle first."}
	}
	return err
}

// AskDiscord executes a bounded personal-key run. The caller must supply the linked Chronicle user;
// this method independently checks the link and permission on every invocation.
func (s *Service) AskDiscord(ctx context.Context, userID uuid.UUID, discordID, interactionID, question string) (string, error) {
	if !s.enabled {
		return "", &DiscordUserError{"AI is not configured on Chronicle."}
	}
	if err := s.checkDiscordUse(ctx, userID, discordID); err != nil {
		return "", err
	}
	config, err := s.personalConfig(ctx, userID)
	if err != nil {
		return "", fmt.Errorf("read AI preferences: %w", err)
	}
	if config.DiscordEnabled != nil && !*config.DiscordEnabled {
		return "", &DiscordUserError{"Discord AI is turned off in your Chronicle AI settings."}
	}
	tenant, err := s.resolveSearchTenant(config.DiscordDefaultTenant)
	if err != nil {
		return "", &DiscordUserError{"Set your default tenant with /chronicle set tenant or on the Chronicle AI settings page first."}
	}
	question = strings.TrimSpace(question)
	if question == "" || len(question) > 32<<10 {
		return "", &DiscordUserError{"Ask a question of at most 32768 characters."}
	}
	model := config.AssistantModels["site-help"]
	if model == "" {
		return "", &DiscordUserError{"Choose an Ask Chronicle default model in your AI settings first."}
	}
	connections, err := s.db.ListInferenceConnectionsByOwner(ctx, userID)
	if err != nil {
		return "", fmt.Errorf("list personal AI connections: %w", err)
	}
	var connection *database.InferenceConnection
	for idx := range connections {
		if connections[idx].Status == "active" && connections[idx].Provider == string(openrouter.ProviderID) && len(connections[idx].EncryptedCredential) > 0 {
			connection = &connections[idx]
			break
		}
	}
	if connection == nil {
		return "", &DiscordUserError{"Connect your personal OpenRouter account in Chronicle AI settings first."}
	}
	credential, err := s.cipher.Decrypt(connection.EncryptedCredential, credentialAAD(userID.String(), "provider-credential"))
	if err != nil {
		return "", fmt.Errorf("decrypt personal AI credential: %w", err)
	}
	provider, ok := s.registry.Provider(ProviderID(connection.Provider))
	if !ok {
		return "", errors.New("unsupported personal AI provider")
	}
	// Verify the saved model still supports the runtime's streaming and tools requirements.
	models, err := provider.ListModels(ctx, credential)
	if err != nil {
		return "", &DiscordUserError{"OpenRouter model lookup failed. Try again later."}
	}
	valid := false
	for _, candidate := range models {
		if candidate.ID == model && candidate.Capabilities.Streaming && candidate.Capabilities.Tools {
			valid = true
			break
		}
	}
	if !valid {
		return "", &DiscordUserError{"Your Ask Chronicle default model is unavailable or does not support tools. Choose another in AI settings."}
	}
	composedAssistant, err := withRuntimeSkills(discordAssistant)
	if err != nil {
		return "", fmt.Errorf("compose Discord assistant: %w", err)
	}
	if interactionID == "" || len(interactionID) > 180 {
		return "", &DiscordUserError{"Invalid Discord interaction."}
	}
	run, err := s.createRun(ctx, database.InsertInferenceRunParams{
		UserID: userID, ConnectionID: connection.ID, AssistantID: discordAssistant.ID, Model: model,
		Status: "running", IdempotencyKey: "discord:" + interactionID,
		LeaseExpiresAt: pgtype.Timestamptz{Time: time.Now().Add(runLease), Valid: true},
	}, nil)
	if err != nil {
		return "", fmt.Errorf("create Discord inference run: %w", err)
	}
	_, _ = s.db.UpdateInferenceConnectionLastUsedByOwner(ctx, database.UpdateInferenceConnectionLastUsedByOwnerParams{ID: connection.ID, UserID: userID})
	var collector discordTextCollector
	result, runErr := s.agentLoop(ctx, agui.NewStreamWriter(&collector, nil), provider, credential, model, composedAssistant,
		[]Message{{Role: RoleUser, Content: question}}, toolContext{service: s, userID: userID, tenantSlug: tenant.Slug.String}, debugRunContext{}, nil,
		agentLoopState{}, func(...Message) error { return nil }, nil, s.usageRecorder(ctx, run, nil))
	if runErr != nil {
		_ = s.finishRun(ctx, run, "error", result.State, inferenceRunErrorCode(runErr))
		var providerErr *ProviderError
		if errors.As(runErr, &providerErr) && providerErr.UserMessage != "" {
			return "", &DiscordUserError{providerErr.UserMessage}
		}
		return "", fmt.Errorf("run Discord inference: %w", runErr)
	}
	if err := s.finishRun(ctx, run, "completed", result.State, ""); err != nil {
		return "", err
	}
	answer := strings.TrimSpace(collector.text.String())
	if answer == "" {
		return "", errors.New("discord inference returned no answer")
	}
	return answer, nil
}

// discordTextCollector receives one complete AG-UI frame per Write. It stores
// only the assistant text, not tool arguments, schemas, prompts, or full SSE.
type discordTextCollector struct{ text strings.Builder }

func (c *discordTextCollector) Write(frame []byte) (int, error) {
	for _, line := range strings.Split(string(frame), "\n") {
		if !strings.HasPrefix(line, "data: ") {
			continue
		}
		var event struct {
			Type  string `json:"type"`
			Delta string `json:"delta"`
		}
		if err := json.Unmarshal([]byte(strings.TrimPrefix(line, "data: ")), &event); err != nil {
			return 0, err
		}
		if event.Type == string(agui.TextMessageStart) {
			c.text.Reset() // only the final assistant message is returned after tool iterations
		}
		if event.Type == string(agui.TextMessageContent) {
			if c.text.Len()+len(event.Delta) > maxAssistantText {
				return 0, errors.New("discord answer too large")
			}
			c.text.WriteString(event.Delta)
		}
	}
	return len(frame), nil
}
