package gearprogressionapi

import (
	"encoding/json"
	"strings"
	"testing"
)

func TestValidateTitle(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name    string
		title   string
		wantErr bool
	}{
		{"valid", "Leveling to 60", false},
		{"empty", "", true},
		{"whitespace only", "   ", true},
		{"too long", strings.Repeat("a", maxTitleLen+1), true},
		{"max length", strings.Repeat("a", maxTitleLen), false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			err := validateTitle(tt.title)
			if (err != nil) != tt.wantErr {
				t.Errorf("validateTitle(%q) error = %v, wantErr %v", tt.title, err, tt.wantErr)
			}
		})
	}
}

func TestValidatePayload(t *testing.T) {
	t.Parallel()

	longNote := strings.Repeat("n", maxNoteLen+1)
	bigPool := `[` + strings.Repeat(`{"item_id":1},`, maxPoolItems) + `{"item_id":1}]`
	manyAlts := `[` + strings.Repeat(`{"item_id":1},`, maxAlternatesLen) + `{"item_id":1}]`

	tests := []struct {
		name    string
		payload json.RawMessage
		wantErr bool
	}{
		{"empty", nil, false},
		{"empty document", json.RawMessage(`{"version":1,"pool":[],"stages":[]}`), false},
		{"analysis profile", json.RawMessage(`{"version":1,"pool":[],"stages":[],"analysis_profile_id":"preset:warrior-fury"}`), false},
		{"embedded analysis profile", json.RawMessage(`{"version":1,"pool":[],"stages":[],"analysis_profile_id":"private-profile","analysis_profile":{"id":"private-profile","name":"My weights","description":"Portable snapshot","weights":{"agility":2.5,"hit":1.2},"targets":[{"stat":"hit","type":"minimum","value":8}]}}`), false},
		{"embedded analysis profile missing weights", json.RawMessage(`{"version":1,"pool":[],"stages":[],"analysis_profile":{"id":"profile","name":"Empty","weights":{}}}`), true},
		{"embedded analysis profile invalid target", json.RawMessage(`{"version":1,"pool":[],"stages":[],"analysis_profile":{"id":"profile","name":"Bad target","weights":{"hit":1},"targets":[{"stat":"hit","type":"exact","value":8}]}}`), true},
		{"analysis profile too long", json.RawMessage(`{"version":1,"pool":[],"stages":[],"analysis_profile_id":"` + strings.Repeat("a", maxAnalysisProfileIDLen+1) + `"}`), true},
		{"valid document", json.RawMessage(`{"version":1,"pool":[
			{"item_id":16921,"enchant_id":2543,"note":"BoE"},{"item_id":22718}
		],"stages":[{"name":"Fresh 60","slots":{
			"0":{"item_id":16921,"alternates":[{"item_id":22718,"note":"cheaper"}]},
			"18":{"item_id":45}
		}}]}`), false},
		{"invalid JSON", json.RawMessage(`{invalid`), true},
		{"too large", json.RawMessage(strings.Repeat("x", maxPayloadBytes+1)), true},
		{"missing version", json.RawMessage(`{"pool":[],"stages":[]}`), true},
		{"wrong version", json.RawMessage(`{"version":2,"pool":[],"stages":[]}`), true},
		{"unknown field", json.RawMessage(`{"version":1,"pool":[],"stages":[],"extra":true}`), true},
		{"pool item id zero", json.RawMessage(`{"version":1,"pool":[{"item_id":0}],"stages":[]}`), true},
		{"pool note too long", json.RawMessage(`{"version":1,"pool":[{"item_id":1,"note":"` + longNote + `"}],"stages":[]}`), true},
		{"too many pool items", json.RawMessage(`{"version":1,"pool":` + bigPool + `,"stages":[]}`), true},
		{"slot key out of range", json.RawMessage(`{"version":1,"pool":[],"stages":[{"name":"a","slots":{"19":{"item_id":1}}}]}`), true},
		{"slot key not a number", json.RawMessage(`{"version":1,"pool":[],"stages":[{"name":"a","slots":{"head":{"item_id":1}}}]}`), true},
		{"stage item id zero", json.RawMessage(`{"version":1,"pool":[],"stages":[{"name":"a","slots":{"0":{"item_id":0}}}]}`), true},
		{"too many stages", json.RawMessage(`{"version":1,"pool":[],"stages":[` + strings.Repeat(`{"name":"s","slots":{}},`, maxStages) + `{"name":"s","slots":{}}]}`), true},
		{"stage name too long", json.RawMessage(`{"version":1,"pool":[],"stages":[{"name":"` + strings.Repeat("a", maxStageNameLen+1) + `","slots":{}}]}`), true},
		{"too many alternates", json.RawMessage(`{"version":1,"pool":[],"stages":[{"name":"a","slots":{"0":{"item_id":1,"alternates":` + manyAlts + `}}}]}`), true},
		{"alternate note too long", json.RawMessage(`{"version":1,"pool":[],"stages":[{"name":"a","slots":{"0":{"item_id":1,"alternates":[{"item_id":2,"note":"` + longNote + `"}]}}}]}`), true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			err := validatePayload(tt.payload)
			if (err != nil) != tt.wantErr {
				t.Errorf("validatePayload() error = %v, wantErr %v", err, tt.wantErr)
			}
		})
	}
}
