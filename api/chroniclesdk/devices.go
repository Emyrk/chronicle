package chroniclesdk

import (
	"time"

	"github.com/google/uuid"
)

// DevicePairStartRequest begins pairing a non-browser client.
type DevicePairStartRequest struct {
	// DeviceName is a human-readable name shown to the user on approval.
	DeviceName string `json:"device_name"`
}

type DevicePairStartResponse struct {
	// Code is the short code shown to the user, e.g. "ABCD-1234".
	Code string `json:"code"`
	// DeviceCode is the opaque polling secret. Never place it in a URL.
	DeviceCode string `json:"device_code"`
	ExpiresIn  int    `json:"expires_in"`
	VerifyURL  string `json:"verify_url"`
	// Interval is the minimum number of seconds between polls.
	Interval int `json:"interval"`
}

type DevicePairPollRequest struct {
	DeviceCode string `json:"device_code"`
}

type DevicePairStatus string

const (
	DevicePairStatusPending DevicePairStatus = "pending"
	DevicePairStatusDenied  DevicePairStatus = "denied"
	DevicePairStatusExpired DevicePairStatus = "expired"
	DevicePairStatusOK      DevicePairStatus = "approved"
)

type DevicePairPollResponse struct {
	Status DevicePairStatus `json:"status"`
	// Token is only set once, when Status is "approved".
	Token string `json:"token,omitempty"`
}

// DevicePairInfo is what the approving user sees.
type DevicePairInfo struct {
	Code       string    `json:"code"`
	DeviceName string    `json:"device_name"`
	ExpiresAt  time.Time `json:"expires_at"`
}

type UploadDevice struct {
	ID         uuid.UUID  `json:"id"`
	Name       string     `json:"name"`
	CreatedAt  time.Time  `json:"created_at"`
	LastUsedAt *time.Time `json:"last_used_at"`
}

type DeviceWhoAmIResponse struct {
	UserID     uuid.UUID `json:"user_id"`
	DeviceID   uuid.UUID `json:"device_id"`
	DeviceName string    `json:"device_name"`
}
