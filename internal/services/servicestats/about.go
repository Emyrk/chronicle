package servicestats

import (
	"context"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5/pgtype"

	"github.com/Emyrk/chronicle/database"
)

// The about page is A1's placeholder that proves the path end to end and
// hosts the shared methodology section. A2 replaces it with the server hub.

const (
	aboutKey       = "about"
	aboutWindow    = 30 * 24 * time.Hour
	aboutMinSample = 10
)

type aboutPayload struct {
	Raids   int64 `json:"raids"`
	Players int64 `json:"players"`
	// WindowDays is stored so the text matches the data even if the window
	// constant changes before the next refresh.
	WindowDays int `json:"window_days"`
}

type aboutProducer struct {
	store database.Store
}

func (aboutProducer) Key() string            { return aboutKey }
func (aboutProducer) Cadence() time.Duration { return 6 * time.Hour }

func (p aboutProducer) Compute(ctx context.Context, _ Tenant) (any, int, error) {
	row, err := p.store.StatsTenantActivity(ctx, pgtype.Timestamptz{Time: time.Now().Add(-aboutWindow), Valid: true})
	if err != nil {
		return nil, 0, err
	}
	return aboutPayload{Raids: row.RaidCount, Players: row.PlayerCount, WindowDays: int(aboutWindow.Hours() / 24)}, int(row.RaidCount), nil
}

func aboutPage(store database.Store) Page {
	return Page{
		Path:      "/stats/about",
		Producer:  aboutProducer{store: store},
		MinSample: aboutMinSample,
		Render:    renderAbout,
	}
}

func renderAbout(site Site, snap Snapshot) (Content, error) {
	p, err := Decode[aboutPayload](snap)
	if err != nil {
		return Content{}, err
	}
	label := site.Label()
	window := fmt.Sprintf("last %d days", p.WindowDays)
	asOf := FormatDate(snap.ComputedAt)
	return Content{
		Title: fmt.Sprintf("How much raiding is logged on %s?", label),
		Description: fmt.Sprintf("As of %s, players uploaded %s raids with %s distinct players from %s to Chronicle in the %s.",
			asOf, FormatInt(p.Raids), FormatInt(p.Players), label, window),
		Lead: fmt.Sprintf("As of %s, players uploaded %s raids with %s distinct players from %s to Chronicle in the %s. "+
			"These are raids and players seen in uploaded combat logs, not the server's full population.",
			asOf, FormatInt(p.Raids), FormatInt(p.Players), label, window),
		SampleLabel: "raids",
		Window:      window,
		Table: &Table{
			Caption: fmt.Sprintf("Raid activity on %s, %s", label, window),
			Headers: []string{"Metric", "Count"},
			Rows: [][]Cell{
				{{Text: "Raids logged"}, {Text: FormatInt(p.Raids)}},
				{{Text: "Distinct players seen"}, {Text: FormatInt(p.Players)}},
			},
		},
		Methodology: []string{
			"Chronicle builds these pages from combat logs that players upload. Only listed logs count; unlisted uploads are excluded.",
			"A raid uploaded by several players counts once. Player counts are distinct characters seen in those logs, so they undercount the server's real population.",
			"Each page shows when its numbers were last computed and how many records they are based on. Pages with too few records are kept out of search engines.",
		},
		Links: []Link{
			{Text: "Recent raids", Href: "/recent"},
			{Text: "Leaderboards", Href: "/leaderboards"},
			{Text: "Census", Href: "/census"},
			{Text: "Upload your logs", Href: "/upload"},
		},
	}, nil
}
