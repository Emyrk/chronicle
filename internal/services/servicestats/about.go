package servicestats

import (
	"context"
	"fmt"
	"time"
)

// The about page is A1's placeholder that proves the path end to end. A2
// replaces it with the server hub. It reuses the threshold check's counts, so
// it runs no query of its own.

const (
	aboutKey       = "about"
	aboutMinSample = 10
)

type aboutPayload struct {
	Raids int64 `json:"raids"`
	// Players is nil when the threshold check did not count players.
	Players    *int64 `json:"players,omitempty"`
	WindowDays int    `json:"window_days"`
}

type aboutProducer struct{}

func (aboutProducer) Key() string            { return aboutKey }
func (aboutProducer) Cadence() time.Duration { return ActivityCadence }
func (aboutProducer) Timeout() time.Duration { return 0 }

func (aboutProducer) Compute(_ context.Context, tenant Tenant) ([]Output, error) {
	a := tenant.Activity
	return []Output{{
		Key:       aboutKey,
		Payload:   aboutPayload{Raids: a.Raids, Players: a.Players, WindowDays: a.WindowDays},
		SampleN:   int(a.Raids),
		MinSample: aboutMinSample,
	}}, nil
}

func aboutFamily() Family {
	return Family{Pattern: "/stats/about", Producer: aboutProducer{}, Render: renderAbout}
}

func renderAbout(site Site, _ Page, snap Snapshot) (Content, error) {
	p, err := Decode[aboutPayload](snap)
	if err != nil {
		return Content{}, err
	}
	label := site.Label()
	window := fmt.Sprintf("last %d days", p.WindowDays)
	asOf := FormatDate(snap.ComputedAt)
	summary := fmt.Sprintf("As of %s, players uploaded %s raids from %s to Chronicle in the %s.",
		asOf, FormatInt(p.Raids), label, window)
	rows := [][]Cell{{{Text: "Raids logged"}, {Text: FormatInt(p.Raids)}}}
	if p.Players != nil {
		summary = fmt.Sprintf("As of %s, players uploaded %s raids with %s distinct players from %s to Chronicle in the %s.",
			asOf, FormatInt(p.Raids), FormatInt(*p.Players), label, window)
		rows = append(rows, []Cell{{Text: "Distinct players seen"}, {Text: FormatInt(*p.Players)}})
	}
	return Content{
		Title:       fmt.Sprintf("How much raiding is logged on %s?", label),
		Description: summary,
		Lead:        summary + " These are raids seen in uploaded combat logs, not everything played on the server.",
		SampleLabel: "raids",
		Window:      window,
		Tables: []Table{{
			Caption: fmt.Sprintf("Raid activity on %s, %s", label, window),
			Headers: []string{"Metric", "Count"},
			Rows:    rows,
		}},
		Links: []Link{
			{Text: "Recent raids", Href: "/recent"},
			{Text: "Leaderboards", Href: "/leaderboards"},
			{Text: "Census", Href: "/census"},
			{Text: "Upload your logs", Href: "/upload"},
		},
	}, nil
}
