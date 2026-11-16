package servicestats

import (
	"context"
	"fmt"
	"sort"
	"strings"
	"time"

	"github.com/Emyrk/chronicle/database"
)

// The hub at /stats answers "is <server> active?" and "where do I upload logs
// for <server>?" from the server's own numbers.

const (
	hubKey       = "hub"
	hubPath      = "/stats"
	hubRecent    = 30 * 24 * time.Hour
	hubMinSample = 10
	hubTimeout   = 5 * time.Minute
	// hubCadence: the players scan covers 180 days, so the hub refreshes
	// every 3 hours rather than hourly.
	hubCadence = 3 * time.Hour
)

type hubCounts struct {
	Raids    int64 `json:"raids"`
	Dungeons int64 `json:"dungeons"`
	Logs     int64 `json:"logs"`
	Players  int64 `json:"players"`
}

type hubInstance struct {
	Name       string `json:"name"`
	Category   string `json:"category"` // "raid" or "dungeon"
	RunsRecent int64  `json:"runs_recent"`
	Runs       int64  `json:"runs"`
	Speedruns  int64  `json:"speedruns"`
	// Path and SpeedrunsPath are set only when that page is stored for the
	// tenant, so the hub never links to a page that would be 404.
	Path          string `json:"path,omitempty"`
	SpeedrunsPath string `json:"speedruns_path,omitempty"`
}

type hubPayload struct {
	RecentDays int           `json:"recent_days"`
	WindowDays int           `json:"window_days"`
	Recent     hubCounts     `json:"recent"`
	Window     hubCounts     `json:"window"`
	Instances  []hubInstance `json:"instances"`
}

type hubProducer struct {
	store database.Store
	now   func() time.Time
}

func (hubProducer) Key() string            { return hubKey }
func (hubProducer) Cadence() time.Duration { return hubCadence }
func (hubProducer) Timeout() time.Duration { return hubTimeout }

func (p hubProducer) Compute(ctx context.Context, _ Tenant) ([]Output, error) {
	// Windows start at a UTC day boundary, so the payload (and with it
	// payload_changed_at and IndexNow) only changes when the data does or a
	// day rolls over, not on every refresh.
	day := p.now().UTC().Truncate(24 * time.Hour)
	since, sinceRecent := timestamptz(day.Add(-ActivityWindow)), timestamptz(day.Add(-hubRecent))

	instances, err := p.store.StatsHubInstances(ctx, database.StatsHubInstancesParams{Since: since, SinceRecent: sinceRecent})
	if err != nil {
		return nil, fmt.Errorf("list instances: %w", err)
	}
	logs, err := p.store.StatsHubLogs(ctx, database.StatsHubLogsParams{Since: since, SinceRecent: sinceRecent})
	if err != nil {
		return nil, fmt.Errorf("count logs: %w", err)
	}
	players, err := p.store.StatsHubPlayers(ctx, database.StatsHubPlayersParams{Since: since, SinceRecent: sinceRecent})
	if err != nil {
		return nil, fmt.Errorf("count players: %w", err)
	}
	speedrunRows, err := p.store.StatsHubSpeedruns(ctx)
	if err != nil {
		return nil, fmt.Errorf("count speedruns: %w", err)
	}
	speedruns := make(map[string]int64, len(speedrunRows))
	for _, r := range speedrunRows {
		speedruns[r.InstanceName] = r.Speedruns
	}

	payload := hubPayload{
		RecentDays: int(hubRecent.Hours() / 24),
		WindowDays: int(ActivityWindow.Hours() / 24),
		Recent:     hubCounts{Logs: logs.LogsRecent, Players: players.PlayersRecent},
		Window:     hubCounts{Logs: logs.Logs, Players: players.Players},
		Instances:  []hubInstance{},
	}
	for _, in := range instances {
		// Each logical run has one instance name, so totals are sums.
		if in.Category == "raid" {
			payload.Recent.Raids += in.RunsRecent
			payload.Window.Raids += in.Runs
		} else {
			payload.Recent.Dungeons += in.RunsRecent
			payload.Window.Dungeons += in.Runs
		}
		hi := hubInstance{Name: in.Name, Category: in.Category, RunsRecent: in.RunsRecent, Runs: in.Runs, Speedruns: speedruns[in.Name]}
		hi.Path, hi.SpeedrunsPath = instanceLinks(hi)
		payload.Instances = append(payload.Instances, hi)
	}
	return []Output{{
		Key:       hubKey,
		Payload:   payload,
		SampleN:   int(payload.Window.Raids + payload.Window.Dungeons),
		MinSample: hubMinSample,
	}}, nil
}

// instanceLinks returns an instance's page and speedruns page paths when they
// exist for the tenant. Per-instance pages arrive with A4/A5 under
// /stats/raids/{instance} and /stats/dungeons/{instance} (shared helpers in
// #2038). Until those families are registered there is nothing to link, so
// the hub shows instance names as plain text.
func instanceLinks(hubInstance) (path, speedrunsPath string) {
	return "", ""
}

func hubFamily(store database.Store, now func() time.Time) Family {
	return Family{Pattern: hubPath, Producer: hubProducer{store: store, now: now}, Render: renderHub}
}

// topInstance returns the instance of a category with the most recent runs
// (ties: more runs in the window, then name).
func topInstance(instances []hubInstance, category string) (hubInstance, bool) {
	var candidates []hubInstance
	for _, in := range instances {
		if in.Category == category && in.RunsRecent > 0 {
			candidates = append(candidates, in)
		}
	}
	if len(candidates) == 0 {
		return hubInstance{}, false
	}
	sort.SliceStable(candidates, func(i, j int) bool {
		a, b := candidates[i], candidates[j]
		if a.RunsRecent != b.RunsRecent {
			return a.RunsRecent > b.RunsRecent
		}
		if a.Runs != b.Runs {
			return a.Runs > b.Runs
		}
		return a.Name < b.Name
	})
	return candidates[0], true
}

func plural(n int64, one, many string) string {
	if n == 1 {
		return "1 " + one
	}
	return FormatInt(n) + " " + many
}

// hubLead builds the answer-first lead from the server's own numbers, so two
// servers with different data never share a lead. Counts are by when the
// raids happened, as recorded in uploaded logs.
func hubLead(label string, asOf time.Time, p hubPayload) string {
	date := FormatDate(asOf)
	r := p.Recent
	if r.Raids+r.Dungeons > 0 {
		lead := fmt.Sprintf("As of %s, uploaded logs show %s and %s on %s in the last %d days, from %s, with %s seen in them.",
			date, plural(r.Raids, "raid", "raids"), plural(r.Dungeons, "dungeon run", "dungeon runs"), label, p.RecentDays,
			plural(r.Logs, "log", "logs"), plural(r.Players, "player", "players"))
		if top, ok := topInstance(p.Instances, "raid"); ok {
			lead += fmt.Sprintf(" The most-run raid in those logs is %s, with %s in that time.", top.Name, plural(top.RunsRecent, "run", "runs"))
		} else if top, ok := topInstance(p.Instances, "dungeon"); ok {
			lead += fmt.Sprintf(" The most-run dungeon in those logs is %s, with %s in that time.", top.Name, plural(top.RunsRecent, "run", "runs"))
		}
		return lead
	}
	w := p.Window
	return fmt.Sprintf("As of %s, uploaded logs show no raids or dungeon runs on %s in the last %d days. Over the last %d days they show %s and %s, from %s, with %s seen in them.",
		date, label, p.RecentDays, p.WindowDays, plural(w.Raids, "raid", "raids"), plural(w.Dungeons, "dungeon run", "dungeon runs"),
		plural(w.Logs, "log", "logs"), plural(w.Players, "player", "players"))
}

func renderHub(site Site, _ Page, snap Snapshot) (Content, error) {
	p, err := Decode[hubPayload](snap)
	if err != nil {
		return Content{}, err
	}
	label := site.Label()
	lead := hubLead(label, snap.ComputedAt, p)
	recent, window := fmt.Sprintf("Last %d days", p.RecentDays), fmt.Sprintf("Last %d days", p.WindowDays)

	tables := []Table{{
		Caption: fmt.Sprintf("Raids and dungeons run on %s, from uploaded logs", label),
		Headers: []string{"Activity", recent, window},
		Rows: [][]Cell{
			{{Text: "Raids"}, {Text: FormatInt(p.Recent.Raids)}, {Text: FormatInt(p.Window.Raids)}},
			{{Text: "Dungeon runs"}, {Text: FormatInt(p.Recent.Dungeons)}, {Text: FormatInt(p.Window.Dungeons)}},
			{{Text: "Logs with those runs"}, {Text: FormatInt(p.Recent.Logs)}, {Text: FormatInt(p.Window.Logs)}},
			{{Text: "Players seen in uploaded logs"}, {Text: FormatInt(p.Recent.Players)}, {Text: FormatInt(p.Window.Players)}},
		},
	}}
	if len(p.Instances) > 0 {
		rows := make([][]Cell, 0, len(p.Instances))
		for _, in := range p.Instances {
			speedruns := Cell{Text: "-"}
			if in.Speedruns > 0 {
				speedruns = Cell{Text: plural(in.Speedruns, "speedrun", "speedruns"), Href: in.SpeedrunsPath}
			}
			kind := "Raid"
			if in.Category == "dungeon" {
				kind = "Dungeon"
			}
			rows = append(rows, []Cell{
				{Text: in.Name, Href: in.Path}, {Text: kind},
				{Text: FormatInt(in.RunsRecent)}, {Text: FormatInt(in.Runs)}, speedruns,
			})
		}
		tables = append(tables, Table{
			Caption: fmt.Sprintf("Runs per raid and dungeon on %s, from uploaded logs", label),
			Headers: []string{"Instance", "Type", "Runs, " + strings.ToLower(recent), "Runs, " + strings.ToLower(window), "Qualified speedruns"},
			Rows:    rows,
		})
	}

	var sections []Section
	if !site.UploadsDisabled {
		sections = append(sections, Section{
			ID:      "upload",
			Heading: fmt.Sprintf("How do I upload logs for %s?", label),
			Paragraphs: []string{
				"Upload a combat log in your browser. The download page lists the Chronicle addon and Sidekick, which can upload logs for you.",
			},
			Links: []Link{
				{Text: "Upload a combat log", Href: "/upload"},
				{Text: "Download the addon and Sidekick", Href: "/download"},
			},
		})
	}

	return Content{
		Title:       fmt.Sprintf("Raid logs, rankings and census for %s", label),
		Description: lead,
		Lead:        lead + " Counts cover logs players chose to upload, by when each raid happened, not everyone on the server.",
		SampleLabel: "raids and dungeon runs",
		Window:      fmt.Sprintf("last %d and %d days", p.RecentDays, p.WindowDays),
		Tables:      tables,
		Sections:    sections,
		Links: []Link{
			{Text: "Recent raids", Href: "/recent"},
			{Text: "Leaderboards", Href: "/leaderboards"},
			{Text: "Census: classes and races seen in logs", Href: "/census"},
			{Text: "Most-worn gear", Href: "/gear/trends"},
			{Text: "Speedrun rules", Href: "/speedrunning"},
		},
	}, nil
}
