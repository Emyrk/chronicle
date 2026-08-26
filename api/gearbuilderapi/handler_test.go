package gearbuilderapi

import (
	"encoding/json"
	"strings"
	"testing"
)

func TestValidateGearListTitle(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name    string
		title   string
		wantErr bool
	}{
		{"valid", "My Gear List", false},
		{"empty", "", true},
		{"whitespace only", "   ", true},
		{"too long", strings.Repeat("a", maxGearListTitleLen+1), true},
		{"max length", strings.Repeat("a", maxGearListTitleLen), false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			err := validateGearListTitle(tt.title)
			if (err != nil) != tt.wantErr {
				t.Errorf("validateGearListTitle(%q) error = %v, wantErr %v", tt.title, err, tt.wantErr)
			}
		})
	}
}

func TestValidatePayload(t *testing.T) {
	t.Parallel()

	longNote := strings.Repeat("n", maxSlotNoteLen+1)
	manyAlts := `[` + strings.Repeat(`{"item_id":1},`, maxAlternatesPerSlot) + `{"item_id":1}]`

	tests := []struct {
		name    string
		payload json.RawMessage
		wantErr bool
	}{
		{"empty", nil, false},
		{"empty stages", json.RawMessage(`{"version":2,"stages":[]}`), false},
		{"valid document", json.RawMessage(`{"version":2,"stages":[{"name":"Pre-Raid","slots":{
			"0":{"item_id":16921,"enchant_id":2543,"gem_enchant_ids":[111,0,333],"note":"crafted","alternates":[{"item_id":22718,"note":"cheaper"}]},
			"18":{"item_id":45}
		}}]}`), false},
		{"invalid JSON", json.RawMessage(`{invalid`), true},
		{"too large", json.RawMessage(strings.Repeat("x", maxPayloadBytes+1)), true},
		{"missing version", json.RawMessage(`{"stages":[]}`), true},
		{"wrong version", json.RawMessage(`{"version":1,"stages":[]}`), true},
		{"legacy v1 slot shape", json.RawMessage(`{"version":2,"stages":[{"name":"a","slots":{"0":16921}}]}`), true},
		{"unknown field", json.RawMessage(`{"version":2,"stages":[],"extra":true}`), true},
		{"slot key out of range", json.RawMessage(`{"version":2,"stages":[{"name":"a","slots":{"19":{"item_id":1}}}]}`), true},
		{"slot key not a number", json.RawMessage(`{"version":2,"stages":[{"name":"a","slots":{"head":{"item_id":1}}}]}`), true},
		{"item id zero", json.RawMessage(`{"version":2,"stages":[{"name":"a","slots":{"0":{"item_id":0}}}]}`), true},
		{"negative alternate item id", json.RawMessage(`{"version":2,"stages":[{"name":"a","slots":{"0":{"item_id":1,"alternates":[{"item_id":-5}]}}}]}`), true},
		{"too many stages", json.RawMessage(`{"version":2,"stages":[` + strings.Repeat(`{"name":"s","slots":{}},`, maxStagesPerList) + `{"name":"s","slots":{}}]}`), true},
		{"stage name too long", json.RawMessage(`{"version":2,"stages":[{"name":"` + strings.Repeat("a", maxStageNameLen+1) + `","slots":{}}]}`), true},
		{"too many gems", json.RawMessage(`{"version":2,"stages":[{"name":"a","slots":{"0":{"item_id":1,"gem_enchant_ids":[1,2,3,4]}}}]}`), true},
		{"negative gem enchant id", json.RawMessage(`{"version":2,"stages":[{"name":"a","slots":{"0":{"item_id":1,"gem_enchant_ids":[-1]}}}]}`), true},
		{"note too long", json.RawMessage(`{"version":2,"stages":[{"name":"a","slots":{"0":{"item_id":1,"note":"` + longNote + `"}}}]}`), true},
		{"alternate note too long", json.RawMessage(`{"version":2,"stages":[{"name":"a","slots":{"0":{"item_id":1,"alternates":[{"item_id":2,"note":"` + longNote + `"}]}}}]}`), true},
		{"too many alternates", json.RawMessage(`{"version":2,"stages":[{"name":"a","slots":{"0":{"item_id":1,"alternates":` + manyAlts + `}}}]}`), true},
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

func TestValidateStatWeightName(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name    string
		input   string
		wantErr bool
	}{
		{"valid", "Tank Weights", false},
		{"empty", "", true},
		{"too long", strings.Repeat("n", maxStatWeightNameLen+1), true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			err := validateStatWeightName(tt.input)
			if (err != nil) != tt.wantErr {
				t.Errorf("validateStatWeightName(%q) error = %v, wantErr %v", tt.input, err, tt.wantErr)
			}
		})
	}
}

func TestValidateWeightsPayload(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name    string
		weights json.RawMessage
		wantErr bool
	}{
		{"valid", json.RawMessage(`{"stamina":1.0}`), false},
		{"empty", nil, false},
		{"invalid JSON", json.RawMessage(`not json`), true},
		{"too large", json.RawMessage(strings.Repeat("x", maxWeightsPayloadSize+1)), true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			err := validateWeightsPayload(tt.weights)
			if (err != nil) != tt.wantErr {
				t.Errorf("validateWeightsPayload() error = %v, wantErr %v", err, tt.wantErr)
			}
		})
	}
}
