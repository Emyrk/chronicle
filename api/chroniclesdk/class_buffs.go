package chroniclesdk

// SetClassBuffIgnoreRequest globally hides or restores every friendly class
// buff whose spell name matches SpellName, regardless of dataset or rank.
type SetClassBuffIgnoreRequest struct {
	SpellName string `json:"spell_name"`
	Ignored   bool   `json:"ignored"`
}
