package servicerankings

import (
	"encoding/json"
	"errors"
	"net/http"
	"net/url"
	"slices"

	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/api/httpapi"
)

func decodeRankingEncounterVariants(q url.Values) (map[string]string, error) {
	if q.Has("encounter_variant") {
		return nil, errors.New("use encounter_variants to map selected boss names to variants")
	}
	if !q.Has("encounter_variants") {
		return nil, nil
	}
	if len(q["encounter_variants"]) != 1 {
		return nil, errors.New("encounter_variants must be supplied once")
	}
	var variants map[string]string
	if err := json.Unmarshal([]byte(q.Get("encounter_variants")), &variants); err != nil || variants == nil {
		return nil, errors.New("encounter_variants must be a JSON object mapping boss names to variants")
	}
	return variants, nil
}

// rankingEncounterVariants validates exact filters against the resolved boss
// selection. Missing keys retain Combined, including unclassified historical
// kills. json.Marshal sorts map keys, producing a canonical SQL parameter rather
// than letting JSON whitespace/key order become a distinct query identity.
func rankingEncounterVariants(w http.ResponseWriter, r *http.Request, instances, encounters []string) (json.RawMessage, bool) {
	variants, err := decodeRankingEncounterVariants(r.URL.Query())
	if err == nil {
		for boss, variant := range variants {
			if !slices.Contains(encounters, boss) {
				err = errors.New("encounter variant refers to an unselected boss")
				break
			}
			if len(instances) != 1 || instances[0] != "Ulduar" || (boss != "Hodir" && boss != "XT-002 Deconstructor") || (variant != "normal" && variant != "hard") {
				err = errors.New("encounter variant is not supported for this boss; only Ulduar Hodir and XT-002 Deconstructor normal or hard are supported")
				break
			}
		}
	}
	if err != nil {
		httpapi.Write(r.Context(), w, http.StatusBadRequest, chroniclesdk.Response{Message: err.Error()})
		return nil, false
	}
	if len(variants) == 0 {
		return nil, true
	}
	canonical, _ := json.Marshal(variants)
	return canonical, true
}
