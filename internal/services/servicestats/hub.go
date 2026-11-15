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
)

type hubCounts struct {
	Raids    int64 `json:"raids"`
	Dungeons int64 `json:"dungeons"`
	Logs     int64 `json:"logs"`
	Players  int64 `json:"players"`
}

type hubInstance struct {
	Name       string `json:"name"`
	Slug       string `json:"slug"`
	Category   string `json:"category"` // "raid" or "dungeon"
	RunsRecent int64  `json:"runs_recent"`
	Runs       int64  `json:"runs"`
	Speedruns  int64  `json:"speedruns"`
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
func (hubProducer) Cadence() time.Duration { return time.Hour }
func (hubProducer) Timeout() time.Duration { return hubTimeout }

func (p hubProducer) Compute(ctx context.Context, _ Tenant) ([]Output, error) {
	now := p.now()
	since, sinceRecent := timestamptz(now.Add(-ActivityWindow)), timestamptz(now.Add(-hubRecent))

	activity, err := p.store.StatsHubActivity(ctx, database.StatsHubActivityParams{Since: since, SinceRecent: sinceRecent})
	if err != nil {
		return nil, fmt.Errorf("count activity: %w", err)
	}
	players, err := p.store.StatsHubPlayers(ctx, database.StatsHubPlayersParams{Since: since, SinceRecent: sinceRecent})
	if err != nil {
		return nil, fmt.Errorf("count players: %w", err)
	}
	instances, err := p.store.StatsHubInstances(ctx, database.StatsHubInstancesParams{Since: since, SinceRecent: sinceRecent})
	if err != nil {
		return nil, fmt.Errorf("list instances: %w", err)
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
		Recent:     hubCounts{Raids: activity.RaidsRecent, Dungeons: activity.DungeonsRecent, Logs: activity.LogsRecent, Players: players.PlayersRecent},
		Window:     hubCounts{Raids: activity.Raids, Dungeons: activity.Dungeons, Logs: activity.Logs, Players: players.Players},
		Instances:  []hubInstance{},
	}
	for _, in := range instances {
		slug := Slug(in.Name)
		if slug == "" {
			continue
		}
		payload.Instances = append(payload.Instances, hubInstance{
			Name: in.Name, Slug: slug, Category: in.Category,
			RunsRecent: in.RunsRecent, Runs: in.Runs, Speedruns: speedruns[in.Name],
		})
	}
	return []Output{{
		Key:       hubKey,
		Payload:   payload,
		SampleN:   int(activity.Raids + activity.Dungeons),
		MinSample: hubMinSample,
	}}, nil
}

func hubFamily(store database.Store, now func() time.Time) Family {
	return Family{Pattern: hubPath, Producer: hubProducer{store: store, now: now}, Render: renderHub}
}

// Slug turns an instance name into its /stats URL segment: lowercase words
// joined by "-", apostrophes dropped ("Onyxia's Lair" -> "onyxias-lair",
// "Temple of Ahn'Qiraj" -> "temple-of-ahnqiraj"). Empty if nothing is left.
func Slug(name string) string {
	var b strings.Builder
	dash := false
	for _, r := range strings.ToLower(name) {
		switch {
		case r == '\'' || r == '’':
			continue
		case r >= 'a' && r <= 'z' || r >= '0' && r <= '9':
			if dash && b.Len() > 0 {
				b.WriteByte('-')
			}
			dash = false
			b.WriteRune(r)
		default:
			dash = true
		}
	}
	return b.String()
}

// InstancePath and SpeedrunsPath are the per-instance /stats pages (A4/A5).
func InstancePath(slug string) string  { return "/stats/" + slug }
func SpeedrunsPath(slug string) string { return "/stats/" + slug + "/speedruns" }

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
// servers with different data never share a lead.
func hubLead(label string, asOf time.Time, p hubPayload) string {
	date := FormatDate(asOf)
	r := p.Recent
	var lead string
	if r.Raids+r.Dungeons > 0 {
		lead = fmt.Sprintf("As of %s, players uploaded %s and %s from %s to Chronicle in the last %d days, in %s, with %s seen in those logs.",
			date, plural(r.Raids, "raid", "raids"), plural(r.Dungeons, "dungeon run", "dungeon runs"), label, p.RecentDays,
			plural(r.Logs, "log", "logs"), plural(r.Players, "player", "players"))
		if top, ok := topInstance(p.Instances, "raid"); ok {
			lead += fmt.Sprintf(" The most-logged raid is %s, with %s in that time.", top.Name, plural(top.RunsRecent, "run", "runs"))
		} else if top, ok := topInstance(p.Instances, "dungeon"); ok {
			lead += fmt.Sprintf(" The most-logged dungeon is %s, with %s in that time.", top.Name, plural(top.RunsRecent, "run", "runs"))
		}
	} else {
		w := p.Window
		lead = fmt.Sprintf("As of %s, no raids or dungeons from %s were uploaded to Chronicle in the last %d days. Over the last %d days players uploaded %s and %s, with %s seen in those logs.",
			date, label, p.RecentDays, p.WindowDays, plural(w.Raids, "raid", "raids"), plural(w.Dungeons, "dungeon run", "dungeon runs"),
			plural(w.Players, "player", "players"))
	}
	return lead
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
		Caption: fmt.Sprintf("Activity on %s, from uploaded combat logs", label),
		Headers: []string{"Activity", recent, window},
		Rows: [][]Cell{
			{{Text: "Raids"}, {Text: FormatInt(p.Recent.Raids)}, {Text: FormatInt(p.Window.Raids)}},
			{{Text: "Dungeon runs"}, {Text: FormatInt(p.Recent.Dungeons)}, {Text: FormatInt(p.Window.Dungeons)}},
			{{Text: "Logs uploaded"}, {Text: FormatInt(p.Recent.Logs)}, {Text: FormatInt(p.Window.Logs)}},
			{{Text: "Players seen in uploaded logs"}, {Text: FormatInt(p.Recent.Players)}, {Text: FormatInt(p.Window.Players)}},
		},
	}}
	if len(p.Instances) > 0 {
		rows := make([][]Cell, 0, len(p.Instances))
		for _, in := range p.Instances {
			speedruns := Cell{Text: "-"}
			if in.Speedruns > 0 {
				speedruns = Cell{Text: plural(in.Speedruns, "speedrun", "speedruns"), Href: SpeedrunsPath(in.Slug)}
			}
			kind := "Raid"
			if in.Category == "dungeon" {
				kind = "Dungeon"
			}
			rows = append(rows, []Cell{
				{Text: in.Name, Href: InstancePath(in.Slug)}, {Text: kind},
				{Text: FormatInt(in.RunsRecent)}, {Text: FormatInt(in.Runs)}, speedruns,
			})
		}
		tables = append(tables, Table{
			Caption: fmt.Sprintf("Raids and dungeons logged on %s", label),
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
		Lead:        lead + " Counts cover logs players chose to upload, not everyone on the server.",
		SampleLabel: "raids and dungeon runs",
		Window:      strings.ToLower(window),
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
