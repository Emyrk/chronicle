package chroniclesdk

// SetCooldownOverridesRequest updates per-spell Cooldown Usage overrides for
// the given spells. A nil field leaves that override unchanged.
type SetCooldownOverridesRequest struct {
	SpellIDs []int32 `json:"spell_ids"`
	// Ignored hides the cooldown from the Cooldown Usage panel.
	Ignored *bool `json:"ignored,omitempty"`
	// HideDuration hides the spell-duration bar while keeping the cooldown.
	HideDuration *bool `json:"hide_duration,omitempty"`
}
