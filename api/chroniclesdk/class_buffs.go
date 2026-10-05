package chroniclesdk

import "github.com/google/uuid"

// SetClassBuffIgnoresRequest updates one exact-name policy in every selected
// tenant scope. IncludeRoot targets the root domain's own analysis scope.
type SetClassBuffIgnoresRequest struct {
	SpellName   string      `json:"spell_name"`
	TenantIDs   []uuid.UUID `json:"tenant_ids"`
	IncludeRoot bool        `json:"include_root"`
	Ignored     bool        `json:"ignored"`
}

type ClassBuffIgnorePolicy struct {
	TenantID  *uuid.UUID `json:"tenant_id"`
	SpellName string     `json:"spell_name"`
}
