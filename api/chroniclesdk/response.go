package chroniclesdk

import "github.com/google/uuid"

// Response represents a generic HTTP response.
type Response struct {
	// Message is an actionable message that depicts actions the request took.
	// These messages should be fully formed sentences with proper punctuation.
	// Examples:
	// - "A user has been created."
	// - "Failed to create a user."
	Message string `json:"message"`
	// CallToAction is an optional field that suggests next steps to the user
	// based on the Message. This field is intended to guide users on what to do
	CallToAction string `json:"call_to_action,omitempty"`
	// Link if provided is a URL that the user can click on to take the suggested action in CallToAction.
	Link     string `json:"link,omitempty"`
	LinkText string `json:"link_text,omitempty"`
	// Detail is a debug message that provides further insight into why the
	// action failed. This information can be technical and a regular golang
	// err.Error() text.
	// - "database: too many open connections"
	// - "stat: too many open files"
	Detail string `json:"detail,omitempty"`
}

type LogUploadResponse struct {
	LogID uuid.UUID   `json:"log_id"`
	Files []uuid.UUID `json:"file_ids"`
}
