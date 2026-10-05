package chroniclesdk

import "github.com/google/uuid"

// SetClassBuffIgnoresRequest updates one exact-name policy in every selected dataset.
type SetClassBuffIgnoresRequest struct {
	SpellName  string      `json:"spell_name"`
	DatasetIDs []uuid.UUID `json:"dataset_ids"`
	Ignored    bool        `json:"ignored"`
}

type ClassBuffIgnorePolicy struct {
	DatasetID uuid.UUID `json:"dataset_id"`
	SpellName string    `json:"spell_name"`
}
