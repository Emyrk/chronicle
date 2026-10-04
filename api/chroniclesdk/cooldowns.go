package chroniclesdk

// SetCooldownIgnoredRequest marks cooldown spells as ignored (hidden from the
// Cooldown Usage panel) or clears the ignore.
type SetCooldownIgnoredRequest struct {
	SpellIDs []int32 `json:"spell_ids"`
	Ignored  bool    `json:"ignored"`
}
