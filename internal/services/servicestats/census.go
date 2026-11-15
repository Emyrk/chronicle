package servicestats

import (
	"context"
	"fmt"
	"sort"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgtype"

	"github.com/Emyrk/chronicle/database"
)

// The census page answers "which classes and races are most common?" from the
// characters seen in listed raid logs, over two windows. It runs one aggregate
// per window (the same game_players scan the census page's own cache does) once
// an hour, never on a page request.

const (
	censusKey = "census"
	// censusCadence matches the census page cache's hourly refresh. The query is
	// one indexed scan of the characters updated in the window (two per run, 30
	// and 90 days), so hourly keeps the "Updated" line honest without load.
	censusCadence = time.Hour
	// censusMinSample is the number of characters seen in the last 30 days
	// below which the page is noindex: percentages over fewer are noise.
	censusMinSample = 100
)

// censusWindowDays are the windows the page shows, shortest first. The first is
// the one the lead and the sample size use.
var censusWindowDays = []int{30, 90}

const censusUnknown = "Unknown"

// censusRow is one class or race with its characters by faction.
type censusRow struct {
	Name     string `json:"name"`
	Alliance int64  `json:"alliance"`
	Horde    int64  `json:"horde"`
	// Unknown counts characters whose faction is not known.
	Unknown int64 `json:"unknown,omitempty"`
}

func (r censusRow) total() int64 { return r.Alliance + r.Horde + r.Unknown }

// censusWindow is the census for the last Days days. Rows are sorted by total,
// largest first, then name; "Unknown" rows (no class or race recorded) come last.
type censusWindow struct {
	Days int `json:"days"`
	// Total is every character counted, whatever its class, race or faction.
	Total   int64       `json:"total"`
	Classes []censusRow `json:"classes"`
	Races   []censusRow `json:"races"`
}

type censusPayload struct {
	Windows []censusWindow `json:"windows"`
}

type censusProducer struct{}

func (censusProducer) Key() string            { return censusKey }
func (censusProducer) Cadence() time.Duration { return censusCadence }
func (censusProducer) Timeout() time.Duration { return 0 }

func (censusProducer) Compute(ctx context.Context, tenant Tenant) ([]Output, error) {
	now := time.Now()
	var payload censusPayload
	for _, days := range censusWindowDays {
		rows, err := tenant.Store.StatsCensusCounts(ctx, pgtype.Timestamptz{Time: now.AddDate(0, 0, -days), Valid: true})
		if err != nil {
			return nil, fmt.Errorf("census counts for %d days: %w", days, err)
		}
		payload.Windows = append(payload.Windows, buildCensusWindow(rows, days, tenant.Flavor))
	}
	first := payload.Windows[0]
	if first.Total == 0 {
		return nil, nil
	}
	return []Output{{Key: censusKey, Payload: payload, SampleN: int(first.Total), MinSample: censusMinSample}}, nil
}

func censusFamily() Family {
	return Family{Pattern: "/stats/census", Producer: censusProducer{}, Render: renderCensus}
}

// buildCensusWindow groups the counts by class and by race, splitting each by
// faction.
func buildCensusWindow(rows []database.StatsCensusCountsRow, days int, flavor database.WoWFlavor) censusWindow {
	w := censusWindow{Days: days}
	classes := map[string]*censusRow{}
	races := map[string]*censusRow{}
	add := func(m map[string]*censusRow, name, faction string, n int64) {
		row := m[name]
		if row == nil {
			row = &censusRow{Name: name}
			m[name] = row
		}
		switch faction {
		case "Alliance":
			row.Alliance += n
		case "Horde":
			row.Horde += n
		default:
			row.Unknown += n
		}
	}
	for _, r := range rows {
		faction := censusFaction(r.Race, r.Faction, flavor)
		add(classes, censusClassName(r.Class), faction, r.Count)
		add(races, censusRaceName(r.Race, flavor), faction, r.Count)
		w.Total += r.Count
	}
	w.Classes, w.Races = sortedCensusRows(classes), sortedCensusRows(races)
	return w
}

func sortedCensusRows(m map[string]*censusRow) []censusRow {
	out := make([]censusRow, 0, len(m))
	for _, row := range m {
		out = append(out, *row)
	}
	sort.Slice(out, func(i, j int) bool {
		if (out[i].Name == censusUnknown) != (out[j].Name == censusUnknown) {
			return out[j].Name == censusUnknown
		}
		if out[i].total() != out[j].total() {
			return out[i].total() > out[j].total()
		}
		return out[i].Name < out[j].Name
	})
	return out
}

// censusFaction is the observed faction when the log recorded one, otherwise the
// race's faction, as the census page does. Blood Elves are Horde, except on
// Nightmare of Ursol servers, where the race is the Alliance High Elf.
func censusFaction(race database.WowPlayableRace, observed database.NullWowPlayerFaction, flavor database.WoWFlavor) string {
	if observed.Valid {
		return string(observed.WowPlayerFaction)
	}
	switch race {
	case database.WowPlayableRaceOrc, database.WowPlayableRaceTroll, database.WowPlayableRaceTauren,
		database.WowPlayableRaceScourge, database.WowPlayableRaceGoblin:
		return "Horde"
	case database.WowPlayableRaceHuman, database.WowPlayableRaceDwarf, database.WowPlayableRaceGnome,
		database.WowPlayableRaceNightElf, database.WowPlayableRaceDraenei:
		return "Alliance"
	case database.WowPlayableRaceBloodElf:
		if flavor.Has(database.FlavorNightmareOfUrsol) {
			return "Alliance"
		}
		return "Horde"
	default:
		return censusUnknown
	}
}

func censusRaceName(race database.WowPlayableRace, flavor database.WoWFlavor) string {
	switch race {
	case database.WowPlayableRaceScourge:
		return "Undead"
	case database.WowPlayableRaceNightElf:
		return "Night Elf"
	case database.WowPlayableRaceBloodElf:
		if flavor.Has(database.FlavorNightmareOfUrsol) {
			return "High Elf"
		}
		return "Blood Elf"
	case database.WowPlayableRaceUnknown, "":
		return censusUnknown
	default:
		return string(race)
	}
}

func censusClassName(class database.WowPlayableClass) string {
	switch class {
	case database.WowPlayableClassDEATHKNIGHT:
		return "Death Knight"
	case database.WowPlayableClassDEMONHUNTER:
		return "Demon Hunter"
	case database.WowPlayableClassUNKNOWN, "":
		return censusUnknown
	default:
		s := strings.ToLower(string(class))
		return strings.ToUpper(s[:1]) + s[1:]
	}
}

func renderCensus(site Site, _ Page, snap Snapshot) (Content, error) {
	p, err := Decode[censusPayload](snap)
	if err != nil {
		return Content{}, err
	}
	if len(p.Windows) == 0 {
		return Content{}, fmt.Errorf("census payload has no windows")
	}
	label := site.Label()
	asOf := FormatDate(snap.ComputedAt)
	recent := p.Windows[0]

	lead := fmt.Sprintf("As of %s, %s characters were seen in %s raid logs (last %d days).", asOf, FormatInt(recent.Total), label, recent.Days)
	if top := mostCommon(recent.Classes); top != nil {
		lead = fmt.Sprintf("As of %s, %s is the most common class among %s characters seen in %s raid logs (last %d days) at %s.",
			asOf, top.Name, FormatInt(recent.Total), label, recent.Days, percent(top.total(), recent.Total))
	}
	if factions := factionSentence(recent); factions != "" {
		lead += " " + factions
	}
	lead += " These are characters seen in uploaded combat logs, not the server's population."

	content := Content{
		Title:       fmt.Sprintf("Which classes and races are most common on %s?", label),
		Description: lead,
		Lead:        lead,
		SampleLabel: "characters",
		Window:      windowLabel(p.Windows),
		Table:       censusTable(fmt.Sprintf("Class by faction, last %d days", recent.Days), "Class", recent.Classes, recent.Total),
	}
	content.Sections = append(content.Sections, Section{
		ID:      "races",
		Heading: fmt.Sprintf("Race by faction, last %d days", recent.Days),
		Table:   censusTable(fmt.Sprintf("Race by faction, last %d days", recent.Days), "Race", recent.Races, recent.Total),
	})
	for _, w := range p.Windows[1:] {
		content.Sections = append(content.Sections,
			Section{
				ID:      fmt.Sprintf("classes-%dd", w.Days),
				Heading: fmt.Sprintf("Class by faction, last %d days", w.Days),
				Paragraphs: []string{fmt.Sprintf("%s characters were seen in %s raid logs in the last %d days.",
					FormatInt(w.Total), label, w.Days)},
				Table: censusTable(fmt.Sprintf("Class by faction, last %d days", w.Days), "Class", w.Classes, w.Total),
			},
			Section{
				ID:      fmt.Sprintf("races-%dd", w.Days),
				Heading: fmt.Sprintf("Race by faction, last %d days", w.Days),
				Table:   censusTable(fmt.Sprintf("Race by faction, last %d days", w.Days), "Race", w.Races, w.Total),
			},
		)
	}
	content.Sections = append(content.Sections, Section{
		ID:      "what-this-counts",
		Heading: "What these numbers count",
		Paragraphs: []string{
			"Each character counts once per window, however many raids it appeared in. The census counts characters seen in listed raid logs that players uploaded to Chronicle; characters seen only in unlisted logs or in invalidated logs are left out.",
			"It is not the server's population: players who never upload, or raid with people who don't, do not appear. Percentages are shares of the characters counted in that window. Faction is the one the log recorded, or the race's faction when it did not.",
		},
	})
	content.Links = []Link{
		{Text: "Interactive census", Href: "/census"},
		{Text: "Character armory", Href: "/armory"},
		{Text: "Leaderboards", Href: "/leaderboards"},
		{Text: "Recent raids", Href: "/recent"},
	}
	return content, nil
}

// mostCommon is the largest row that has a known name (the first on a tie), or nil.
func mostCommon(rows []censusRow) *censusRow {
	var top *censusRow
	for i := range rows {
		if rows[i].Name == censusUnknown || rows[i].total() == 0 {
			continue
		}
		if top == nil || rows[i].total() > top.total() {
			top = &rows[i]
		}
	}
	return top
}

// factionSentence is "By faction, 61.2% are Horde and 38.8% Alliance." over the
// characters with a known faction, or "" when none have one.
func factionSentence(w censusWindow) string {
	var horde, alliance int64
	for _, c := range w.Classes {
		horde += c.Horde
		alliance += c.Alliance
	}
	known := horde + alliance
	if known == 0 {
		return ""
	}
	return fmt.Sprintf("By faction, %s are Horde and %s Alliance.", percent(horde, known), percent(alliance, known))
}

func windowLabel(windows []censusWindow) string {
	days := make([]string, len(windows))
	for i, w := range windows {
		days[i] = fmt.Sprint(w.Days)
	}
	if len(days) == 1 {
		return fmt.Sprintf("last %s days", days[0])
	}
	return fmt.Sprintf("last %s and %s days", strings.Join(days[:len(days)-1], ", "), days[len(days)-1])
}

func percent(part, total int64) string {
	if total <= 0 {
		return "0.0%"
	}
	return fmt.Sprintf("%.1f%%", float64(part)*100/float64(total))
}

// censusTable is a class or race table: counts by faction, a total, and its
// share of every character counted. The Unknown-faction column appears only when
// some row has one.
func censusTable(caption, nameHeader string, rows []censusRow, total int64) *Table {
	var unknown bool
	for _, r := range rows {
		unknown = unknown || r.Unknown > 0
	}
	headers := []string{nameHeader, "Alliance", "Horde"}
	if unknown {
		headers = append(headers, "Unknown faction")
	}
	headers = append(headers, "Total", "Share")
	table := &Table{Caption: caption, Headers: headers}
	for _, r := range rows {
		cells := []Cell{{Text: r.Name}, {Text: FormatInt(r.Alliance)}, {Text: FormatInt(r.Horde)}}
		if unknown {
			cells = append(cells, Cell{Text: FormatInt(r.Unknown)})
		}
		cells = append(cells, Cell{Text: FormatInt(r.total())}, Cell{Text: percent(r.total(), total)})
		table.Rows = append(table.Rows, cells)
	}
	return table
}
