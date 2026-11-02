package chroniclesdk

import (
	"encoding/json"
	"time"

	"github.com/google/uuid"
)

type UserPanelLayout struct {
	ID            uuid.UUID       `json:"id"`
	Title         string          `json:"title"`
	Icon          string          `json:"icon"`
	Description   string          `json:"description"`
	Payload       json.RawMessage `json:"payload"`
	Code          *string         `json:"code"`
	Version       int32           `json:"version"`
	OwnerID       *uuid.UUID      `json:"owner_id"`
	OwnerUsername *string         `json:"owner_username"`
	IsTracked     bool            `json:"is_tracked"`
	TrackerCount  int64           `json:"tracker_count"`
	CreatedAt     time.Time       `json:"created_at"`
	UpdatedAt     time.Time       `json:"updated_at"`
}

// UIUsageRequest records anonymous, bounded UI usage telemetry.
type UIUsageRequest struct {
	Preset   *string  `json:"preset,omitempty"`
	Panels   []string `json:"panels,omitempty"`
	Selected []string `json:"selected,omitempty"`
}

// TrackLayoutRequest identifies a layout to track.
type TrackLayoutRequest struct {
	LayoutID uuid.UUID `json:"layout_id"`
}

type CreateUserPanelLayoutRequest struct {
	Title       string          `json:"title"`
	Icon        string          `json:"icon"`
	Description string          `json:"description"`
	Payload     json.RawMessage `json:"payload"`
}

type UpdateUserPanelLayoutRequest struct {
	Title       *string          `json:"title,omitempty"`
	Icon        *string          `json:"icon,omitempty"`
	Description *string          `json:"description,omitempty"`
	Payload     *json.RawMessage `json:"payload,omitempty"`
}

type LayoutDefaultsResponse struct {
	DefaultDesktopLayoutID *uuid.UUID `json:"default_desktop_layout_id"`
	DefaultMobileLayoutID  *uuid.UUID `json:"default_mobile_layout_id"`
}

type UpdateLayoutDefaultsRequest struct {
	DefaultDesktopLayoutID *uuid.UUID `json:"default_desktop_layout_id,omitempty"`
	DefaultMobileLayoutID  *uuid.UUID `json:"default_mobile_layout_id,omitempty"`
}

type ActionBarSlotsResponse struct {
	Slot1 *uuid.UUID `json:"slot_1"`
	Slot2 *uuid.UUID `json:"slot_2"`
	Slot3 *uuid.UUID `json:"slot_3"`
	Slot4 *uuid.UUID `json:"slot_4"`
	Slot5 *uuid.UUID `json:"slot_5"`
	Slot6 *uuid.UUID `json:"slot_6"`
	Slot7 *uuid.UUID `json:"slot_7"`
	Slot8 *uuid.UUID `json:"slot_8"`
	Slot9 *uuid.UUID `json:"slot_9"`
	Slot0 *uuid.UUID `json:"slot_0"`
}

type UpdateActionBarSlotsRequest = ActionBarSlotsResponse

type ListUserPanelLayoutsResponse struct {
	Layouts                []UserPanelLayout       `json:"layouts"`
	DefaultDesktopLayoutID *uuid.UUID              `json:"default_desktop_layout_id"`
	DefaultMobileLayoutID  *uuid.UUID              `json:"default_mobile_layout_id"`
	ActionBarSlots         *ActionBarSlotsResponse `json:"action_bar_slots"`
}

// InstanceDefaultsResponse provides everything needed by the instance page in one request.
type InstanceDefaultsResponse struct {
	DefaultDesktopLayout *UserPanelLayout        `json:"default_desktop_layout"`
	DefaultMobileLayout  *UserPanelLayout        `json:"default_mobile_layout"`
	ActionBarSlots       *ActionBarSlotsResponse `json:"action_bar_slots"`
	ActionBarLayouts     []UserPanelLayout       `json:"action_bar_layouts"`
}
