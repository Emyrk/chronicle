package chroniclesdk

import "time"

// TechnicalHintKind identifies how a technical hint should be rendered.
type TechnicalHintKind string

const (
	TechnicalHintKindTip           TechnicalHintKind = "tip"
	TechnicalHintKindPanel         TechnicalHintKind = "panel"
	TechnicalHintKindBlog          TechnicalHintKind = "blog"
	TechnicalHintKindCommunityFact TechnicalHintKind = "community_fact"
)

// TechnicalHintsResponse is the cacheable payload returned by the public
// technical-hints endpoint.
type TechnicalHintsResponse struct {
	Version      string          `json:"version"`
	GeneratedAt  time.Time       `json:"generated_at"`
	RefreshAfter time.Time       `json:"refresh_after"`
	Payloads     []TechnicalHint `json:"payloads"`
}

// TechnicalHint is a static hint or dynamically generated community fact.
type TechnicalHint struct {
	ID          string            `json:"id"`
	Kind        TechnicalHintKind `json:"kind"`
	Title       string            `json:"title"`
	Body        string            `json:"body"`
	Href        string            `json:"href,omitempty"`
	ActionLabel string            `json:"action_label,omitempty"`
	Icon        string            `json:"icon,omitempty"`
	ImageURL    string            `json:"image_url,omitempty"`
	Panel       string            `json:"panel,omitempty"`
	BlogID      string            `json:"blog_id,omitempty"`
	Tags        []string          `json:"tags,omitempty"`
	GeneratedAt *time.Time        `json:"generated_at,omitempty"`
	ExpiresAt   *time.Time        `json:"expires_at,omitempty"`
}
