package serviceeventrepair

import (
	"fmt"

	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/google/uuid"
)

type razorgoreOmission struct {
	EncounterID uuid.UUID `json:"encounter_id"`
	Stream      string    `json:"stream"`
	UnitGUID    string    `json:"unit_guid"`
	Amount      int64     `json:"amount"`
	Count       int       `json:"count"`
	Reason      string    `json:"reason"`
}

// Omitted quantities are effective contributions, not a guessed player's credit.
// Aggregation order follows the validated event timeline for stable plan seals.
func recordRazorgoreOmission(p *RazorgoreRepairPlan, encounterID uuid.UUID, stream string, unit guid.GUID, amount int64, reason string) {
	if p == nil || amount <= 0 {
		return
	}
	if p.Details == nil {
		p.Details = map[string]any{}
	}
	rows, _ := p.Details["omissions"].([]razorgoreOmission)
	for i := range rows {
		r := &rows[i]
		if r.EncounterID == encounterID && r.Stream == stream && r.UnitGUID == unit.String() && r.Reason == reason {
			r.Amount += amount
			r.Count++
			p.Details["omissions"] = rows
			return
		}
	}
	rows = append(rows, razorgoreOmission{EncounterID: encounterID, Stream: stream, UnitGUID: unit.String(), Amount: amount, Count: 1, Reason: reason})
	p.Details["omissions"] = rows
	p.Warnings = append(p.Warnings, fmt.Sprintf("Omitted %s contributions for %s in encounter %s: %s; quantities are recorded in details.omissions", stream, unit, encounterID, reason))
}
