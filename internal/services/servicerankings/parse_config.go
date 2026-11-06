package servicerankings

import (
	"encoding/json"

	"github.com/Emyrk/chronicle/internal/parsepolicy"
)

func isParseDisabled(parseConfigJSON []byte) bool {
	if len(parseConfigJSON) == 0 {
		return false
	}
	var config struct {
		CohortMode string `json:"cohort_mode"`
	}
	return json.Unmarshal(parseConfigJSON, &config) == nil &&
		config.CohortMode == string(parsepolicy.CohortModeDisabled)
}
