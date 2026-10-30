package chroniclesdk

import (
	"time"

	"github.com/google/uuid"
)

// AccountPurgeConfirmation is the phrase a user types to start an account purge.
const AccountPurgeConfirmation = "PURGE MY ACCOUNT"

type AccountDataCount struct {
	GroupKey string `json:"group_key"`
	Label    string `json:"label"`
	Count    int64  `json:"count"`
}

type AccountPurgeInventory struct {
	Data        []AccountDataCount  `json:"data"`
	Blockers    []string            `json:"blockers"`
	ActivePurge *AccountPurgeStatus `json:"active_purge,omitempty"`
	// RecentSignInUntil is when the current sign-in becomes too old to start a
	// purge. After it passes, the user must sign out and back in.
	RecentSignInUntil time.Time `json:"recent_sign_in_until"`
}

type StartAccountPurgeRequest struct {
	// AcknowledgedGroups must include every group_key in the inventory.
	AcknowledgedGroups []string `json:"acknowledged_groups"`
	Confirmation       string   `json:"confirmation"`
}

type AccountPurgeStatus struct {
	// StatusToken is issued once by POST. Keep it out of inventory and status reads.
	StatusToken string    `json:"status_token,omitempty"`
	ID          uuid.UUID `json:"id"`
	Status      string    `json:"status"`
	Step        string    `json:"step"`
	LogsTotal   int32     `json:"logs_total"`
	LogsDeleted int32     `json:"logs_deleted"`
	Error       string    `json:"error"`
}
