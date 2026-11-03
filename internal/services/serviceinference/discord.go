package serviceinference

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/api/httpapi"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/authz/policy"
	"github.com/Emyrk/chronicle/internal/services/serviceinference/agui"
	"github.com/Emyrk/chronicle/internal/services/serviceinference/openrouter"
	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
)

type discordUserError struct{ message string }

func (e discordUserError) Error() string       { return e.message }
func (e discordUserError) UserMessage() string { return e.message }

func newDiscordUserError(message string) error { return discordUserError{message: message} }

const discordAssistantID = "discord"

var discordAssistant = assistant{
	ID:             discordAssistantID,
	Name:           "Discord assistant",
	Description:    "Answers Chronicle questions from the /ask Discord command.",
	SettingsHidden: true,
	System:         "You are the Chronicle Discord assistant. Answer questions about Chronicle and Classic World of Warcraft concisely. Select the relevant available skill based on the user's question. Do not claim access to data or tools that are not provided. Responses are sent to Discord, so avoid tables and keep formatting compact.",
	Skills:         []string{instanceSearchSkillID},
}

func init() {
	assistants[discordAssistantID] = discordAssistant
}

// AdminRoutes manages the shared Discord OpenRouter connection and default model.
func (s *Service) AdminRoutes() http.Handler {
	r := chi.NewRouter()
	r.Use(s.requireEnabled)
	r.Get("/", s.getDiscordAdminSettings)
	r.Put("/", s.updateDiscordAdminSettings)
	r.Delete("/connection", s.deleteDiscordAdminConnection)
	return r
}

func (s *Service) getDiscordAdminSettings(w http.ResponseWriter, r *http.Request) {
	config, err := s.db.GetInferenceDiscordConfig(r.Context())
	if err != nil {
		s.internalError(w, "read Discord inference settings", err)
		return
	}
	response := chroniclesdk.InferenceDiscordAdminSettings{Enabled: config.Enabled, DefaultModel: config.DefaultModel}
	if config.ConnectionID.Valid {
		connection, err := s.db.GetSharedInferenceConnection(r.Context(), config.ConnectionID.UUID)
		if err == nil {
			id := connection.ID
			response.SharedConnectionConfigured = connection.Status == "active" && len(connection.EncryptedCredential) > 0
			response.SharedConnectionID = &id
			response.SharedConnectionLabel = connection.Label
		}
	}
	httpapi.Write(r.Context(), w, http.StatusOK, response)
}

func (s *Service) updateDiscordAdminSettings(w http.ResponseWriter, r *http.Request) {
	var req chroniclesdk.UpdateInferenceDiscordAdminSettingsRequest
	if !httpapi.Read(r.Context(), w, r, &req) {
		return
	}
	if req.DefaultModel != nil {
		model := strings.TrimSpace(*req.DefaultModel)
		if model == "" || len(model) > 200 {
			badRequest(w, r, "A default OpenRouter model is required.")
			return
		}
		*req.DefaultModel = model
	}
	if req.Enabled != nil && *req.Enabled {
		current, err := s.db.GetInferenceDiscordConfig(r.Context())
		if err != nil {
			s.internalError(w, "read Discord inference settings", err)
			return
		}
		hasConnection := current.ConnectionID.Valid || (req.APIKey != nil && strings.TrimSpace(*req.APIKey) != "")
		model := current.DefaultModel
		if req.DefaultModel != nil {
			model = *req.DefaultModel
		}
		if !hasConnection || strings.TrimSpace(model) == "" {
			httpapi.Write(r.Context(), w, http.StatusConflict, chroniclesdk.Response{Message: "Configure a shared OpenRouter key and default model before enabling Discord AI."})
			return
		}
	}
	if req.APIKey != nil {
		key := strings.TrimSpace(*req.APIKey)
		if key == "" || len(key) > 4096 {
			badRequest(w, r, "A valid OpenRouter API key is required.")
			return
		}
		owner := userID(r)
		encrypted, err := s.cipher.Encrypt([]byte(key), credentialAAD(owner.String(), "discord-shared-provider-credential"))
		if err != nil {
			s.internalError(w, "encrypt shared Discord credential", err)
			return
		}
		var inserted database.InferenceConnection
		err = s.db.InTx(r.Context(), func(tx database.Store) error {
			current, err := tx.GetInferenceDiscordConfig(r.Context())
			if err != nil {
				return err
			}
			inserted, err = tx.InsertInferenceConnection(r.Context(), database.InsertInferenceConnectionParams{
				UserID: owner, Provider: string(openrouter.ProviderID), AuthMode: "shared", Label: "Discord shared OpenRouter",
				EncryptedCredential: encrypted, CredentialKeyVersion: credentialKeyID,
				ProviderAccountKeyHash: hashSecret(key), Status: "active",
			})
			if err != nil {
				return err
			}
			if _, err := tx.SetInferenceDiscordConnection(r.Context(), uuid.NullUUID{UUID: inserted.ID, Valid: true}); err != nil {
				return err
			}
			if current.ConnectionID.Valid {
				return tx.DeleteSharedInferenceConnection(r.Context(), current.ConnectionID.UUID)
			}
			return nil
		}, nil)
		if err != nil {
			s.internalError(w, "store shared Discord credential", err)
			return
		}
	}
	if req.DefaultModel != nil || req.Enabled != nil {
		params := database.UpdateInferenceDiscordConfigParams{}
		if req.DefaultModel != nil {
			params.DefaultModel = pgtype.Text{String: *req.DefaultModel, Valid: true}
		}
		if req.Enabled != nil {
			params.Enabled = pgtype.Bool{Bool: *req.Enabled, Valid: true}
		}
		if _, err := s.db.UpdateInferenceDiscordConfig(r.Context(), params); err != nil {
			s.internalError(w, "update Discord inference settings", err)
			return
		}
	}
	config, err := s.db.GetInferenceDiscordConfig(r.Context())
	if err != nil {
		s.internalError(w, "read updated Discord inference settings", err)
		return
	}
	if config.Enabled && (!config.ConnectionID.Valid || strings.TrimSpace(config.DefaultModel) == "") {
		httpapi.Write(r.Context(), w, http.StatusConflict, chroniclesdk.Response{Message: "Configure a shared OpenRouter key and default model before enabling Discord AI."})
		return
	}
	s.getDiscordAdminSettings(w, r)
}

func (s *Service) deleteDiscordAdminConnection(w http.ResponseWriter, r *http.Request) {
	err := s.db.InTx(r.Context(), func(tx database.Store) error {
		config, err := tx.GetInferenceDiscordConfig(r.Context())
		if err != nil {
			return err
		}
		if _, err := tx.ClearInferenceDiscordConnection(r.Context()); err != nil {
			return err
		}
		if config.ConnectionID.Valid {
			return tx.DeleteSharedInferenceConnection(r.Context(), config.ConnectionID.UUID)
		}
		return nil
	}, nil)
	if err != nil {
		s.internalError(w, "delete shared Discord credential", err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// AskDiscord runs the Discord-specific ephemeral assistant after enforcing Chronicle permissions.
func (s *Service) AskDiscord(ctx context.Context, userID uuid.UUID, interactionID, rawQuestion, tenantOverride string, directMessage bool) (string, error) {
	if !s.enabled {
		return "", newDiscordUserError("AI is not configured on this Chronicle server.")
	}
	question := strings.TrimSpace(rawQuestion)
	if question == "" || len(question) > 32<<10 {
		return "", newDiscordUserError("A question between 1 and 32768 characters is required.")
	}
	allowed, err := s.zed.CheckOne(ctx, nil, policy.New().GlobalChronicle().CanUse_discord_inference_User(policy.New().User(userID)))
	if err != nil {
		return "", fmt.Errorf("authorize Discord inference: %w", err)
	}
	if !allowed {
		return "", newDiscordUserError("Discord AI requires a linked Honored-or-above Chronicle account with AI enabled.")
	}
	userConfig, err := s.discordConfig(ctx, userID)
	if err != nil {
		return "", fmt.Errorf("read Discord AI preference: %w", err)
	}
	tenantSlug := strings.TrimSpace(tenantOverride)
	if tenantSlug == "" {
		tenantSlug = userConfig.DefaultTenant
	}
	if tenantSlug == "" {
		return "", newDiscordUserError("Please set your default tenant with `/set default-tenant` before asking a question, or provide the optional tenant on `/ask`.")
	}
	tenant, err := s.resolveSearchTenant(tenantSlug)
	if err != nil {
		return "", newDiscordUserError(err.Error())
	}
	tenantSlug = tenant.Slug.String

	var connection database.InferenceConnection
	var model string
	if directMessage {
		if !userConfig.UsePersonalOpenRouter || userConfig.ConnectionID == uuid.Nil || strings.TrimSpace(userConfig.Model) == "" {
			return "", newDiscordUserError("Enable personal OpenRouter for Discord in Chronicle AI settings before using /ask in DMs.")
		}
		connection, err = s.db.GetInferenceConnectionByOwner(ctx, database.GetInferenceConnectionByOwnerParams{ID: userConfig.ConnectionID, UserID: userID})
		if err != nil || connection.Status != "active" {
			return "", newDiscordUserError("The selected personal OpenRouter connection is unavailable.")
		}
		model = userConfig.Model
	} else {
		config, err := s.db.GetInferenceDiscordConfig(ctx)
		if err != nil {
			return "", fmt.Errorf("read shared Discord AI settings: %w", err)
		}
		if !config.Enabled || !config.ConnectionID.Valid || strings.TrimSpace(config.DefaultModel) == "" {
			return "", newDiscordUserError("Shared Discord AI is not configured.")
		}
		connection, err = s.db.GetSharedInferenceConnection(ctx, config.ConnectionID.UUID)
		if err != nil || connection.Status != "active" {
			return "", newDiscordUserError("The shared Discord OpenRouter connection is unavailable.")
		}
		model = config.DefaultModel
	}
	provider, ok := s.registry.Provider(ProviderID(connection.Provider))
	if !ok {
		return "", errors.New("unsupported Discord inference provider")
	}
	purpose := "provider-credential"
	if connection.AuthMode == "shared" {
		purpose = "discord-shared-provider-credential"
	}
	credential, err := s.cipher.Decrypt(connection.EncryptedCredential, credentialAAD(connection.UserID.String(), purpose))
	if err != nil {
		return "", fmt.Errorf("decrypt Discord inference credential: %w", err)
	}

	idempotencyKey := "discord:" + strings.TrimSpace(interactionID)
	if idempotencyKey == "discord:" {
		idempotencyKey = "discord:" + uuid.NewString()
	}
	run, err := s.createRun(ctx, database.InsertInferenceRunParams{
		UserID: userID, ConnectionID: connection.ID, AssistantID: discordAssistantID, Model: model,
		Status: "running", IdempotencyKey: idempotencyKey,
		LeaseExpiresAt: pgtype.Timestamptz{Time: time.Now().Add(runLease), Valid: true},
	}, nil)
	if err != nil {
		return "", fmt.Errorf("create Discord inference run: %w", err)
	}
	if directMessage {
		_, _ = s.db.UpdateInferenceConnectionLastUsedByOwner(ctx, database.UpdateInferenceConnectionLastUsedByOwnerParams{ID: connection.ID, UserID: userID})
	} else {
		_, _ = s.db.UpdateSharedInferenceConnectionLastUsed(ctx, connection.ID)
	}

	collector := &discordEventCollector{}
	result, runErr := s.agentLoop(ctx, collector, provider, credential, model, discordAssistant,
		[]Message{{Role: RoleUser, Content: question}}, toolContext{service: s, userID: userID, tenantSlug: tenantSlug}, debugRunContext{}, nil,
		agentLoopState{}, func(...Message) error { return nil }, nil, s.usageRecorder(ctx, run, nil))
	if runErr != nil {
		_ = s.finishRun(ctx, run, "error", result.State, inferenceRunErrorCode(runErr))
		var providerErr *ProviderError
		if errors.As(runErr, &providerErr) && strings.TrimSpace(providerErr.UserMessage) != "" {
			return "", newDiscordUserError(providerErr.UserMessage)
		}
		if errors.Is(runErr, errAgentIterationLimit) || errors.Is(runErr, errAgentToolLimit) {
			return "", newDiscordUserError("The assistant could not finish within the tool-step limit.")
		}
		return "", fmt.Errorf("run Discord assistant: %w", runErr)
	}
	if err := s.finishRun(ctx, run, "completed", result.State, ""); err != nil {
		return "", err
	}
	answer := strings.TrimSpace(collector.text.String())
	if answer == "" {
		return "", errors.New("the Discord assistant returned an empty response")
	}
	return answer, nil
}

type eventWriter interface {
	Write(agui.Event) error
}

type discordEventCollector struct {
	text strings.Builder
}

func (c *discordEventCollector) Write(event agui.Event) error {
	if delta, ok := event.(agui.TextMessageContentEvent); ok {
		c.text.WriteString(delta.Delta)
	}
	return nil
}
