package servicestats

import (
	"context"
	"fmt"
	"net/url"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/Emyrk/chronicle/database"
)

// The speedruns page (/stats/{raids|dungeons}/{instance}/speedruns, see
// SpeedrunsPath) answers "what is the fastest <instance> clear?" from the
// speedrun leaderboard's own queries: SpeedrunInstanceBoards lists the boards
// (instance, difficulty, raid size) that have a qualified run, and
// SpeedrunLeaderboard ranks a board. The leaderboard's rules therefore apply as
// they do in the app: qualified runs only, listed logs, no mixed-difficulty
// runs, duplicate uploads collapsed, each guild's best run, full-clear timing.
// Guild names only: no player names or lists.

const (
	speedrunsKey = "speedruns"
	// speedrunsCadence is every three hours. Each board costs one leaderboard
	// query, the one the app already runs on demand, and that query ranks every
	// qualified run of the board before its limit, so it is heavier than it looks;
	// records are rare, so a few hours is soon enough for a new one to show.
	speedrunsCadence = 3 * time.Hour
	// speedrunsTimeout is longer than the default because a tenant can have a
	// board per instance, difficulty and raid size.
	speedrunsTimeout = 5 * time.Minute
	// speedrunsShown is how many ranks the table shows.
	speedrunsShown = 25
	// speedrunsFetch is how many guilds' runs are read per board, so the page can
	// say how many guilds are ranked. Each guild has at most one row.
	speedrunsFetch = 1000
	// speedrunsMinSample is the number of ranked guilds on an instance's main
	// board below which the page is noindex: one or two clears are not a ranking.
	speedrunsMinSample = 3
)

// speedrunRun is one ranked clear.
type speedrunRun struct {
	Rank        int       `json:"rank"`
	Guild       string    `json:"guild"`
	GuildID     string    `json:"guild_id,omitempty"`
	DurationMs  int64     `json:"duration_ms"`
	CompletedAt time.Time `json:"completed_at"`
	// RaidID is the SPA identifier of the raid: its hashed slug, else its ID.
	RaidID string `json:"raid_id"`
}

// speedrunBoard is one difficulty and raid size of an instance.
type speedrunBoard struct {
	Difficulty string `json:"difficulty"`
	MaxPlayers int32  `json:"max_players"`
	// Ranked is how many guilds have a ranked clear on the board; Runs holds the
	// fastest speedrunsShown of them.
	Ranked int           `json:"ranked"`
	Runs   []speedrunRun `json:"runs"`
}

type speedrunsPayload struct {
	Instance string `json:"instance"`
	// Boards are sorted main board first (most ranked guilds, then larger raids).
	Boards []speedrunBoard `json:"boards"`
}

// speedrunsProducer publishes one category's pages: raids and dungeons are
// separate families (separate producers, so a failing one never blocks the
// other), each under its own literal path segment.
type speedrunsProducer struct{ category InstanceCategory }

func (p speedrunsProducer) Key() string          { return speedrunsKey + "-" + string(p.category) }
func (speedrunsProducer) Cadence() time.Duration { return speedrunsCadence }
func (speedrunsProducer) Timeout() time.Duration { return speedrunsTimeout }

func (p speedrunsProducer) Compute(ctx context.Context, tenant Tenant) ([]Output, error) {
	boards, err := tenant.Store.SpeedrunInstanceBoards(ctx)
	if err != nil {
		return nil, fmt.Errorf("list speedrun boards: %w", err)
	}
	categoryRows, err := tenant.Store.StatsSpeedrunInstanceCategories(ctx)
	if err != nil {
		return nil, fmt.Errorf("list speedrun instance categories: %w", err)
	}
	categories := make(map[string]InstanceCategory, len(categoryRows))
	for _, r := range categoryRows {
		if c, ok := CategoryFromDB(r.Category.String); ok {
			categories[r.InstanceName] = c
		}
	}
	byInstance := map[string]*speedrunsPayload{}
	slugOwner := map[string]string{}
	var names []string
	for _, b := range boards {
		if categories[b.InstanceName] != p.category {
			continue // another category's family publishes it, or it has no pages
		}
		slug := InstanceSlug(b.InstanceName)
		if slug == "" {
			continue
		}
		// Two instance names that slug alike would share a URL. Keep the first
		// with a ranked clear, by name, so the page never mixes two instances.
		if owner, taken := slugOwner[slug]; taken && owner != b.InstanceName {
			continue
		}

		rows, err := tenant.Store.SpeedrunLeaderboard(ctx, database.SpeedrunLeaderboardParams{
			InstanceName:             b.InstanceName,
			FilterDifficulty:         true,
			DifficultyName:           b.DifficultyName,
			FilterInstanceMaxPlayers: true,
			InstanceMaxPlayers:       int16(b.MaxPlayers),
			ResultLimit:              speedrunsFetch,
		})
		if err != nil {
			return nil, fmt.Errorf("speedrun leaderboard for %s: %w", b.InstanceName, err)
		}
		board := buildSpeedrunBoard(b.DifficultyName, b.MaxPlayers, rows)
		if board.Ranked == 0 {
			continue
		}
		slugOwner[slug] = b.InstanceName
		payload := byInstance[slug]
		if payload == nil {
			payload = &speedrunsPayload{Instance: b.InstanceName}
			byInstance[slug] = payload
			names = append(names, slug)
		}
		payload.Boards = append(payload.Boards, board)
	}

	sort.Strings(names)
	outputs := make([]Output, 0, len(names))
	for _, slug := range names {
		payload := byInstance[slug]
		sortSpeedrunBoards(payload.Boards)
		outputs = append(outputs, Output{
			Key:       PageKey(p.Key(), slug),
			Payload:   payload,
			SampleN:   payload.Boards[0].Ranked,
			MinSample: speedrunsMinSample,
		})
	}
	return outputs, nil
}

// speedrunsFamily is the fastest-clears family of one category. Its pattern has
// the category as a literal, and "speedruns" as a literal after the instance, so
// it beats the boss family (/stats/{category}/{instance}/{boss}) on that URL.
func speedrunsFamily(category InstanceCategory) Family {
	return Family{
		Pattern:  "/stats/" + string(category) + "/{instance}/speedruns",
		Producer: speedrunsProducer{category: category},
		Render:   renderSpeedruns,
	}
}

// buildSpeedrunBoard ranks a leaderboard query's rows (already ordered fastest
// first, one per guild). Rows without a guild or a time are skipped.
func buildSpeedrunBoard(difficulty string, maxPlayers int32, rows []database.SpeedrunLeaderboardRow) speedrunBoard {
	board := speedrunBoard{Difficulty: difficulty, MaxPlayers: maxPlayers}
	ranked := make([]database.SpeedrunLeaderboardRow, 0, len(rows))
	for _, r := range rows {
		if r.GuildID.Valid && r.GuildName != "" && r.DurationMs > 0 && r.CompletionTime.Valid {
			ranked = append(ranked, r)
		}
	}
	// The query orders by duration only, so equal times could come back in
	// either order from run to run. Break ties by guild ID, so an unchanged board
	// gives an unchanged payload (payload_changed_at, the sitemap, IndexNow).
	sort.SliceStable(ranked, func(i, j int) bool {
		if ranked[i].DurationMs != ranked[j].DurationMs {
			return ranked[i].DurationMs < ranked[j].DurationMs
		}
		return ranked[i].GuildID.UUID.String() < ranked[j].GuildID.UUID.String()
	})
	for _, r := range ranked {
		board.Ranked++
		if len(board.Runs) >= speedrunsShown {
			continue
		}
		raid := r.InstanceID.String()
		if r.HashedSlug.Valid && r.HashedSlug.String != "" {
			raid = r.HashedSlug.String
		}
		board.Runs = append(board.Runs, speedrunRun{
			Rank:        board.Ranked,
			Guild:       r.GuildName,
			GuildID:     r.GuildID.UUID.String(),
			DurationMs:  r.DurationMs,
			CompletedAt: r.CompletionTime.Time.UTC(),
			RaidID:      raid,
		})
	}
	return board
}

// sortSpeedrunBoards puts the main board first: most ranked guilds, then the
// larger raid size, then the difficulty name.
func sortSpeedrunBoards(boards []speedrunBoard) {
	sort.SliceStable(boards, func(i, j int) bool {
		a, b := boards[i], boards[j]
		if a.Ranked != b.Ranked {
			return a.Ranked > b.Ranked
		}
		if a.MaxPlayers != b.MaxPlayers {
			return a.MaxPlayers > b.MaxPlayers
		}
		return a.Difficulty < b.Difficulty
	})
}

// boardLabel names a board: its difficulty and raid size, without repeating the
// size when the difficulty already carries it ("25 Player").
func boardLabel(b speedrunBoard) string {
	difficulty := capitalize(b.Difficulty)
	size := ""
	if b.MaxPlayers > 0 {
		size = strconv.Itoa(int(b.MaxPlayers))
	}
	switch {
	case difficulty != "" && (size == "" || strings.Contains(difficulty, size)):
		return difficulty
	case difficulty != "" && size != "":
		return difficulty + ", " + size + " players"
	case size != "":
		return size + " players"
	default:
		return ""
	}
}

// formatClock formats a duration in milliseconds as m:ss, with minutes running
// past 60 ("95:30"), truncating seconds: the way the leaderboard's speedrun hub
// shows a time, so the same run reads the same here and in the app.
func formatClock(ms int64) string {
	secs := ms / 1000
	return fmt.Sprintf("%d:%02d", secs/60, secs%60)
}

func speedrunTable(caption string, b speedrunBoard) *Table {
	t := &Table{Caption: caption, Headers: []string{"Rank", "Guild", "Time", "Date", "Raid"}}
	for _, r := range b.Runs {
		guild := Cell{Text: r.Guild}
		if r.GuildID != "" {
			guild.Href = "/g/" + r.GuildID
		}
		t.Rows = append(t.Rows, []Cell{
			{Text: strconv.Itoa(r.Rank)},
			guild,
			{Text: formatClock(r.DurationMs)},
			{Text: FormatDate(r.CompletedAt)},
			{Text: "View raid", Href: "/instances/" + r.RaidID},
		})
	}
	return t
}

func renderSpeedruns(site Site, _ Page, snap Snapshot) (Content, error) {
	p, err := Decode[speedrunsPayload](snap)
	if err != nil {
		return Content{}, err
	}
	if len(p.Boards) == 0 || len(p.Boards[0].Runs) == 0 {
		return Content{}, fmt.Errorf("speedruns payload has no ranked runs")
	}
	label := site.Label()
	main := p.Boards[0]
	best := main.Runs[0]

	subject := p.Instance
	if len(p.Boards) > 1 {
		if l := boardLabel(main); l != "" {
			subject += " (" + l + ")"
		}
	}
	lead := fmt.Sprintf("The fastest %s clear on %s is %s by %s, set %s.", subject, label, formatClock(best.DurationMs), best.Guild, FormatDate(best.CompletedAt))
	lead += fmt.Sprintf(" As of %s, %s ranked, each with its best valid full-raid clear.",
		FormatDate(snap.ComputedAt), plural(main.Ranked, "guild is", "guilds are"))
	lead += " These are clears from uploaded combat logs that meet the speedrun rules, not every clear on the server."

	content := Content{
		Title:       fmt.Sprintf("What is the fastest %s clear on %s?", p.Instance, label),
		Description: lead,
		Lead:        lead,
		SampleLabel: "ranked guilds",
		Window:      "all time",
		Links: []Link{
			{Text: "Interactive speedrun leaderboards", Href: "/leaderboards/" + url.PathEscape(strings.ReplaceAll(p.Instance, " ", "-")) + "/speedruns"},
			{Text: "Speedrunning rules", Href: "/speedrunning"},
			{Text: "Recent raids", Href: "/recent"},
		},
	}
	caption := fmt.Sprintf("Fastest %s clears, top %d", subject, speedrunsShown)
	if main.Ranked < speedrunsShown {
		caption = fmt.Sprintf("Fastest %s clears", subject)
	}
	content.Table = speedrunTable(caption, main)

	for _, b := range p.Boards[1:] {
		name := boardLabel(b)
		heading := "Fastest clears"
		if name != "" {
			heading += ": " + name
		}
		content.Sections = append(content.Sections, Section{
			Heading: heading,
			Paragraphs: []string{fmt.Sprintf("The fastest %s (%s) clear is %s by %s, set %s. %s ranked.",
				p.Instance, name, formatClock(b.Runs[0].DurationMs), b.Runs[0].Guild, FormatDate(b.Runs[0].CompletedAt),
				capitalize(plural(b.Ranked, "guild is", "guilds are")))},
			Table: speedrunTable(heading, b),
		})
	}
	content.Sections = append(content.Sections, Section{
		Heading: "What counts as a clear",
		Paragraphs: []string{
			"A clear is ranked when one log shows every required boss of the raid killed on a single difficulty, recorded by the Chronicle addon or a server-side logging module, in a listed log, with the raid attributed to a guild: the guild with more than half of the players who did damage or healing. Time is the full raid, from the first fight to the last required kill.",
			"Where a raid has a level cap, every player who fought must be at or under it: Classic raids are capped at level 60 on TBC and Wrath servers, and TBC raids at 70 on Wrath servers. Deadmines (level 26) and Ragefire Chasm (level 20) have caps everywhere. One player over the cap, or with an unknown level, disqualifies the run.",
			"Each guild appears once, with its fastest valid clear. A raid uploaded by several players counts once. The table shows guild names only.",
		},
	})
	return content, nil
}

func plural(n int, one, many string) string {
	if n == 1 {
		return "1 " + one
	}
	return FormatInt(int64(n)) + " " + many
}

func capitalize(s string) string {
	if s == "" {
		return s
	}
	return strings.ToUpper(s[:1]) + s[1:]
}
