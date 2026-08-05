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

func TestValidateVisibility(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name    string
		vis     string
		wantErr bool
	}{
		{"public", "public", false},
		{"unlisted", "unlisted", false},
		{"private", "private", false},
		{"invalid", "secret", true},
		{"empty", "", true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			err := validateVisibility(tt.vis)
			if (err != nil) != tt.wantErr {
				t.Errorf("validateVisibility(%q) error = %v, wantErr %v", tt.vis, err, tt.wantErr)
			}
		})
	}
}

func TestValidatePayload(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name    string
		payload json.RawMessage
		wantErr bool
	}{
		{"valid JSON", json.RawMessage(`{"stages":[]}`), false},
		{"empty", nil, false},
		{"invalid JSON", json.RawMessage(`{invalid`), true},
		{"too large", json.RawMessage(strings.Repeat("x", maxPayloadBytes+1)), true},
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
