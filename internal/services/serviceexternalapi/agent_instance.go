package serviceexternalapi

import (
	"cmp"
	"context"
	"errors"
	"fmt"
	"net/http"
	"slices"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/Emyrk/chronicle/api/chroniclesdk"
)

// Raid view bounds.
const (
	raidViewMaxPulls        = 40
	raidViewMaxKills        = 15
	raidViewTopDPS          = 5
	raidViewTopHPS          = 3
	raidViewMaxRoster       = 60
	raidViewMaxMissingRows  = 25
	raidViewSummaryDeadline = 10 * time.Second
)

// instanceView is the agent view of /instances/{id}: the run, its boss
// pulls, top performers per kill, deaths and missing consumables.
func (s *Service) instanceView(w http.ResponseWriter, r *http.Request) (int, string) {
	ctx := r.Context()
	instance, err := s.instanceByIdentifier(r)
	if errors.Is(err, pgx.ErrNoRows) {
		return s.notFoundView(w, r, "Raid not found", "No public raid has this link. It may be unlisted or deleted.")
	}
	if err != nil {
		return s.errorView(w, r, "Raid", err)
	}
	summary, err := s.loadSummaryContext(ctx, instance)
	if err != nil {
		return s.errorView(w, r, instance.Name, err)
	}
	records, err := s.db.InstanceRankingRecords(ctx, instance.ID)
	if err != nil {
		return s.errorView(w, r, instance.Name, err)
	}
	scores, err := s.db.GetParseScoreResultsForInstance(ctx, instance.ID)
	if err != nil {
		return s.errorView(w, r, instance.Name, err)
	}
	ranked := instanceRankingRecords(records, scores)

	links := newAgentLinks(r)
	instancePath := links.instancePath(instance.HashedSlug.String, instance.ID)
	apiPath := externalAPIPrefix + "/raidlogs" + instancePath
	started := instance.StartTime.Time.UTC()
	if !instance.StartTime.Valid && len(summary.pulls) > 0 {
		started = summary.pulls[0].StartTime
	}

	title := instance.Name
	if instance.GuildName.String != "" {
		title += " by " + instance.GuildName.String
	}
	var b strings.Builder
	b.WriteString(s.agentHeader(w, r, title))
	_, _ = fmt.Fprintf(&b, "- Realm: %s\n", markdownCell.Replace(instance.RealmName))
	if instance.GuildID.Valid {
		_, _ = fmt.Fprintf(&b, "- Guild: %s\n", markdownLink(instance.GuildName.String, links.agent("/g/"+instance.GuildID.UUID.String())))
	}
	if !started.IsZero() {
		_, _ = fmt.Fprintf(&b, "- Started: %s UTC\n", started.Format("2006-01-02 15:04"))
	}
	if instance.DifficultyName != "" {
		_, _ = fmt.Fprintf(&b, "- Difficulty: %s\n", markdownCell.Replace(instance.DifficultyName))
	}
	if instance.RecorderName != "" {
		_, _ = fmt.Fprintf(&b, "- Logged by: %s\n", markdownCell.Replace(instance.RecorderName))
	}
	_, _ = fmt.Fprintf(&b, "- Players: %d\n", len(summary.players))

	writeRaidPulls(&b, summary.pulls)
	writeRaidTopPerformers(&b, summary, ranked, links)

	summaryCtx, cancel := context.WithTimeout(ctx, raidViewSummaryDeadline)
	defer cancel()
	b.WriteString("\n## Deaths\n\n")
	deaths, err := s.computeDeathSummary(summaryCtx, instance)
	if err != nil {
		b.WriteString(summaryUnavailable(err))
	} else {
		writeRaidDeaths(&b, deaths)
	}
	_, _ = fmt.Fprintf(&b, "\nEvery death with killing blow and the last hits taken: %s\n", markdownLink("deaths", links.agent(apiPath+"/deaths?format=md")))

	b.WriteString("\n## Consumables\n\n")
	consumables, err := s.computeConsumablesSummary(summaryCtx, instance)
	if err != nil {
		b.WriteString(summaryUnavailable(err))
	} else {
		writeRaidMissingConsumables(&b, consumables, ranked)
	}
	_, _ = fmt.Fprintf(&b, "\nEvery consumable per pull and player: %s\n", markdownLink("consumables", links.agent(apiPath+"/consumables?format=md")))

	writeRaidRoster(&b, summary, links)

	b.WriteString("\n## Next links\n\n")
	var menu [][2]string
	if instance.GuildID.Valid {
		menu = append(menu,
			[2]string{"This guild's recent runs (search)", links.search(&searchNode{Field: "instance.guild_id", Op: chroniclesdk.InstanceSearchOpEq, Value: instance.GuildID.UUID.String()})},
			[2]string{"Guild page", links.agent("/g/" + instance.GuildID.UUID.String())})
	}
	if !started.IsZero() {
		weekStart := started.Truncate(24*time.Hour).AddDate(0, 0, -((int(started.Weekday()) + 6) % 7))
		menu = append(menu, [2]string{"Same raid this week on this realm (search)", links.search(&searchNode{And: []searchNode{
			pred("instance.name", chroniclesdk.InstanceSearchOpEq, instance.Name),
			pred("instance.realm", chroniclesdk.InstanceSearchOpEq, instance.RealmName),
			pred("instance.started_at", chroniclesdk.InstanceSearchOpGte, weekStart.Format(time.RFC3339)),
			pred("instance.started_at", chroniclesdk.InstanceSearchOpLt, weekStart.AddDate(0, 0, 7).Format(time.RFC3339)),
		}})})
	}
	menu = append(menu,
		[2]string{"Deaths in detail", links.agent(apiPath + "/deaths?format=md")},
		[2]string{"Consumables in detail", links.agent(apiPath + "/consumables?format=md")},
		[2]string{"Every DPS and HPS record (JSON)", links.agent(apiPath + "/ranking-records")},
		[2]string{"How to use Chronicle (llms.txt)", links.agent("/llms.txt")},
	)
	linkList(&b, menu)
	b.WriteString("\nFor the user:\n")
	linkList(&b, [][2]string{{"Open this raid in Chronicle", links.user(instancePath)}})
	return http.StatusOK, b.String()
}

func summaryUnavailable(err error) string {
	switch {
	case errors.Is(err, errSummaryBusy), errors.Is(err, context.DeadlineExceeded):
		return "Not ready yet: Chronicle is busy summarizing. Fetch this page again in a minute.\n"
	case errors.Is(err, errEventStreamTooLong):
		return "This raid's event data is too large to summarize.\n"
	}
	return "Unavailable for this raid.\n"
}

func writeRaidPulls(b *strings.Builder, pulls []SummaryPull) {
	b.WriteString("\n## Boss pulls\n\n")
	if len(pulls) == 0 {
		b.WriteString("No boss pulls recorded.\n")
		return
	}
	b.WriteString("| Boss | Attempt | Outcome | Duration |\n|---|---|---|---|\n")
	for _, p := range pulls[:min(len(pulls), raidViewMaxPulls)] {
		_, _ = fmt.Fprintf(b, "| %s | %d | %s | %s |\n", markdownCell.Replace(p.Encounter), p.Attempt, p.Outcome, formatPullTime(p.DurationMs))
	}
	if len(pulls) > raidViewMaxPulls {
		_, _ = fmt.Fprintf(b, "\n%d more pulls not shown.\n", len(pulls)-raidViewMaxPulls)
	}
}

// writeRaidTopPerformers lists the top DPS and HPS on each kill.
func writeRaidTopPerformers(b *strings.Builder, summary *summaryContext, ranked []InstanceRankingRecord, links agentLinks) {
	byEncounter := make(map[uuid.UUID][]InstanceRankingRecord)
	for _, rec := range ranked {
		if rec.EncounterID != nil {
			byEncounter[*rec.EncounterID] = append(byEncounter[*rec.EncounterID], rec)
		}
	}
	b.WriteString("\n## Top performers per kill\n\n")
	kills := 0
	for _, pull := range summary.pulls {
		recs := byEncounter[pull.EncounterID]
		if pull.Outcome != "kill" || len(recs) == 0 {
			continue
		}
		if kills++; kills > raidViewMaxKills {
			b.WriteString("More kills not shown; see the ranking records link below.\n")
			break
		}
		_, _ = fmt.Fprintf(b, "### %s (%s)\n\n", markdownCell.Replace(pull.Encounter), formatPullTime(pull.DurationMs))
		player := func(rec InstanceRankingRecord) string {
			return markdownLink(rec.PlayerName, links.agent(links.armoryPath(summary.instance.RealmName, rec.PlayerName)))
		}
		parse := func(p *InstanceRankingParse) string {
			if p == nil {
				return "-"
			}
			return fmt.Sprintf("%d", p.DisplayScore)
		}
		b.WriteString("| DPS | Player | Class | Spec | Parse |\n|---|---|---|---|---|\n")
		for _, rec := range topBy(recs, raidViewTopDPS, func(r InstanceRankingRecord) float64 { return r.DPS }) {
			_, _ = fmt.Fprintf(b, "| %.0f | %s | %s | %s | %s |\n", rec.DPS, player(rec), markdownCell.Replace(dashIfEmpty(rec.PlayerClass)), markdownCell.Replace(dashIfEmpty(rec.PlayerSpec)), parse(rec.DPSParse))
		}
		b.WriteString("\n| HPS | Player | Class | Spec | Parse |\n|---|---|---|---|---|\n")
		for _, rec := range topBy(recs, raidViewTopHPS, func(r InstanceRankingRecord) float64 { return r.HPS }) {
			_, _ = fmt.Fprintf(b, "| %.0f | %s | %s | %s | %s |\n", rec.HPS, player(rec), markdownCell.Replace(dashIfEmpty(rec.PlayerClass)), markdownCell.Replace(dashIfEmpty(rec.PlayerSpec)), parse(rec.HPSParse))
		}
		b.WriteString("\n")
	}
	if kills == 0 {
		b.WriteString("No ranked kills in this raid.\n")
	}
}

// topBy returns up to n records with a positive metric, highest first.
func topBy(recs []InstanceRankingRecord, n int, metric func(InstanceRankingRecord) float64) []InstanceRankingRecord {
	out := make([]InstanceRankingRecord, 0, len(recs))
	for _, rec := range recs {
		if metric(rec) > 0 {
			out = append(out, rec)
		}
	}
	slices.SortFunc(out, func(a, b InstanceRankingRecord) int { return cmp.Compare(metric(b), metric(a)) })
	return out[:min(len(out), n)]
}

// writeRaidDeaths summarizes each pull: death count, first death and its
// killing blow.
func writeRaidDeaths(b *strings.Builder, deaths *deathSummary) {
	if len(deaths.pulls) == 0 {
		b.WriteString("No boss pulls recorded.\n")
		return
	}
	b.WriteString("| Boss | Attempt | Outcome | Deaths | First death | Killing blow |\n|---|---|---|---|---|---|\n")
	for _, pull := range deaths.pulls[:min(len(deaths.pulls), raidViewMaxPulls)] {
		first, blow := "-", "-"
		if pull.FirstDeath != nil {
			first = fmt.Sprintf("%s at %s", pull.FirstDeath.Player, formatPullTime(pull.FirstDeath.TimeIntoPullMs))
		}
		if len(pull.Deaths) > 0 {
			blow = killingBlowText(pull.Deaths[0])
		}
		_, _ = fmt.Fprintf(b, "| %s | %d | %s | %d | %s | %s |\n", markdownCell.Replace(pull.Encounter), pull.Attempt, pull.Outcome,
			pull.TotalDeaths, markdownCell.Replace(first), markdownCell.Replace(blow))
	}
	if len(deaths.pulls) > raidViewMaxPulls {
		_, _ = fmt.Fprintf(b, "\n%d more pulls not shown.\n", len(deaths.pulls)-raidViewMaxPulls)
	}
}

// consumableKind classifies a consumable by name: "flask", "elixir", "food"
// or "". Chronicle has no item categories for consumables, so this is a
// name match and can miss unusual items.
func consumableKind(name string) string {
	n := strings.ToLower(name)
	switch {
	case strings.Contains(n, "flask"):
		return "flask"
	case strings.Contains(n, "elixir"):
		return "elixir"
	}
	for _, word := range foodWords {
		if strings.Contains(n, word) {
			return "food"
		}
	}
	return ""
}

var foodWords = []string{
	"well fed", "food", "feast", "dumpling", "squid", "steak", "stew", "soup", "kabob", "chili", "fillet",
	"jerky", "omelet", "sagefish", "mightfish", "nightfin", "tuber", "sausage", "ribs", "chops", "bread",
	"cookie", "mushroom", "egg", "clam", "crab", "trout", "salmon", "tender", "cheese", "pie",
}

// writeRaidMissingConsumables lists, per player, how many boss kills they
// did without a flask, an elixir or food. Kill rosters come from the
// ranking records, so players who weren't ranked on a kill aren't counted.
func writeRaidMissingConsumables(b *strings.Builder, consumables *consumablesSummary, ranked []InstanceRankingRecord) {
	roster := make(map[uuid.UUID]map[string]string) // encounter -> player GUID -> name
	for _, rec := range ranked {
		if rec.EncounterID == nil {
			continue
		}
		if roster[*rec.EncounterID] == nil {
			roster[*rec.EncounterID] = make(map[string]string)
		}
		roster[*rec.EncounterID][rec.PlayerGUID] = rec.PlayerName
	}
	type missing struct {
		name                       string
		kills, flask, elixir, food int
	}
	players := make(map[string]*missing)
	kills := 0
	for _, pull := range consumables.pulls {
		present := roster[pull.EncounterID]
		if pull.Outcome != "kill" || len(present) == 0 {
			continue
		}
		kills++
		had := make(map[string]map[string]bool)
		for _, p := range pull.Players {
			had[p.Player.GUID] = make(map[string]bool)
			for _, c := range p.Consumables {
				had[p.Player.GUID][consumableKind(c.Name)] = true
			}
		}
		for id, name := range present {
			m := players[id]
			if m == nil {
				m = &missing{name: name}
				players[id] = m
			}
			m.kills++
			if !had[id]["flask"] {
				m.flask++
			}
			if !had[id]["elixir"] {
				m.elixir++
			}
			if !had[id]["food"] {
				m.food++
			}
		}
	}
	if kills == 0 {
		b.WriteString("No ranked boss kills to check.\n")
		return
	}
	rows := make([]*missing, 0, len(players))
	for _, m := range players {
		if m.flask+m.elixir+m.food > 0 {
			rows = append(rows, m)
		}
	}
	slices.SortFunc(rows, func(a, b *missing) int {
		return cmp.Or(cmp.Compare(b.flask+b.elixir+b.food, a.flask+a.elixir+a.food), strings.Compare(a.name, b.name))
	})
	_, _ = fmt.Fprintf(b, "Players missing a flask, an elixir or food on boss kills (%d kills checked). Items are classified by name, so unusual items can be missed.\n\n", kills)
	if len(rows) == 0 {
		b.WriteString("Everyone had a flask, an elixir and food on every kill.\n")
		return
	}
	b.WriteString("| Player | Kills | No flask | No elixir | No food |\n|---|---|---|---|---|\n")
	for _, m := range rows[:min(len(rows), raidViewMaxMissingRows)] {
		_, _ = fmt.Fprintf(b, "| %s | %d | %d | %d | %d |\n", markdownCell.Replace(m.name), m.kills, m.flask, m.elixir, m.food)
	}
	if len(rows) > raidViewMaxMissingRows {
		_, _ = fmt.Fprintf(b, "\n%d more players not shown.\n", len(rows)-raidViewMaxMissingRows)
	}
}

func writeRaidRoster(b *strings.Builder, summary *summaryContext, links agentLinks) {
	players := make([]SummaryPlayer, 0, len(summary.players))
	for _, p := range summary.players {
		players = append(players, p)
	}
	slices.SortFunc(players, func(a, b SummaryPlayer) int {
		return cmp.Or(strings.Compare(a.Name, b.Name), strings.Compare(a.GUID, b.GUID))
	})
	b.WriteString("\n## Players (character pages)\n\n")
	if len(players) == 0 {
		b.WriteString("No players recorded.\n")
		return
	}
	parts := make([]string, 0, min(len(players), raidViewMaxRoster))
	for _, p := range players[:min(len(players), raidViewMaxRoster)] {
		text := markdownLink(p.Name, links.agent(links.armoryPath(summary.instance.RealmName, p.Name)))
		if p.Class != "" {
			text += " (" + markdownCell.Replace(strings.ToLower(p.Class)) + ")"
		}
		parts = append(parts, text)
	}
	b.WriteString(strings.Join(parts, ", ") + "\n")
	if len(players) > raidViewMaxRoster {
		_, _ = fmt.Fprintf(b, "\n%d more players not shown.\n", len(players)-raidViewMaxRoster)
	}
}
