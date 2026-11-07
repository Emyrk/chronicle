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

// IsParseDisabled reports whether a tenant's parse_config turns parses off
// (cohort_mode=disabled), as the time-parses endpoint checks.
func IsParseDisabled(parseConfigJSON []byte) bool {
	return isParseDisabled(parseConfigJSON)
}
