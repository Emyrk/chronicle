package serviceinference

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"slices"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/api/httpapi"
	"github.com/Emyrk/chronicle/database"
)

// addonWorkshopPanelAssistantID builds panel addons. Guide and other addon workshops get their own IDs.
const addonWorkshopPanelAssistantID = "addon-workshop-panel"

// assistantSettingsOrder is the order assistants appear in the user's AI settings.
var assistantSettingsOrder = []string{"site-help", "instance-analyst", addonWorkshopPanelAssistantID}

// configDisabledAssistants is the inference_user_config key listing assistants the user turned off.
const configDisabledAssistants = "disabled_assistants"

var errUnknownAssistant = errors.New("unknown assistant")

// disabledAssistants returns the assistants the user turned off. Every assistant is on until turned off.
func (s *Service) disabledAssistants(ctx context.Context, userID uuid.UUID) (map[string]bool, error) {
	raw, err := s.db.GetInferenceUserConfig(ctx, userID)
	if errors.Is(err, pgx.ErrNoRows) {
		return map[string]bool{}, nil
	}
	if err != nil {
		return nil, err
	}
	var config struct {
		DisabledAssistants []string `json:"disabled_assistants"`
	}
	if err := json.Unmarshal(raw, &config); err != nil {
		return nil, fmt.Errorf("decode inference user config: %w", err)
	}
	off := make(map[string]bool, len(config.DisabledAssistants))
	for _, id := range config.DisabledAssistants {
		off[id] = true
	}
	return off, nil
}

func (s *Service) setAssistantsEnabled(ctx context.Context, userID uuid.UUID, changes map[string]bool) error {
	for id := range changes {
		if _, ok := assistants[id]; !ok {
			return fmt.Errorf("%w %q", errUnknownAssistant, id)
		}
	}
	off, err := s.disabledAssistants(ctx, userID)
	if err != nil {
		return err
	}
	for id, enabled := range changes {
		off[id] = !enabled
	}
	list := make([]string, 0, len(off))
	for id, disabled := range off {
		if disabled {
			list = append(list, id)
		}
	}
	slices.Sort(list)
	value, err := json.Marshal(list)
	if err != nil {
		return err
	}
	return s.db.SetInferenceUserConfigKey(ctx, database.SetInferenceUserConfigKeyParams{UserID: userID, Key: configDisabledAssistants, Value: value})
}

// requireAssistantEnabled writes a 403 and returns false when the user turned the assistant off.
func (s *Service) requireAssistantEnabled(w http.ResponseWriter, r *http.Request, id string) bool {
	off, err := s.disabledAssistants(r.Context(), userID(r))
	if err != nil {
		s.internalError(w, "read assistant preferences", err)
		return false
	}
	if off[id] {
		name := id
		if a, ok := assistants[id]; ok && a.Name != "" {
			name = a.Name
		}
		httpapi.Write(r.Context(), w, http.StatusForbidden, chroniclesdk.Response{Message: fmt.Sprintf("%s is turned off in your AI settings.", name)})
		return false
	}
	return true
}
