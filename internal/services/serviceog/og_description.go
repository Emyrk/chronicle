package serviceog

import (
	"fmt"
	"net/url"
	"strconv"
	"strings"
	"time"

	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/database"
)

// Page descriptions carry real figures from the data the share cards already
// load, so a crawler (or an AI assistant) reading the HTML without JavaScript
// sees them. Every builder returns "" when it has no number to show, and the
// caller then keeps the boilerplate description. Names that appear are guild and
// player names, never realm names.

// ogCount formats a count with thousands separators.
func ogCount(n int64) string {
	s := strconv.FormatInt(n, 10)
	if n < 1000 {
		return s
	}
	var b strings.Builder
	for i, c := range s {
		if i > 0 && (len(s)-i)%3 == 0 {
			b.WriteByte(',')
		}
		b.WriteRune(c)
	}
	return b.String()
}

// ogClock formats a duration in milliseconds as m:ss, or h:mm:ss from an hour.
func ogClock(ms int64) string {
	secs := ms / 1000
	if secs >= 3600 {
		return fmt.Sprintf("%d:%02d:%02d", secs/3600, secs/60%60, secs%60)
	}
	return fmt.Sprintf("%d:%02d", secs/60, secs%60)
}

func plural(n int64, one, many string) string {
	if n == 1 {
		return ogCount(n) + " " + one
	}
	return ogCount(n) + " " + many
}

// guildOGBestRun is the fastest full clear of the furthest raid the guild has
// cleared, or nil.
func guildOGBestRun(d guildOGData, raids map[string]guildOGRaid) *database.GuildBestRunsRow {
	var best *database.GuildBestRunsRow
	for i, run := range d.BestRuns {
		raid, ok := raids[run.InstanceName]
		if !ok || run.DurationMs <= 0 {
			continue
		}
		if best == nil || raid.Order > raids[best.InstanceName].Order {
			best = &d.BestRuns[i]
		}
	}
	return best
}

// guildOGDescription is "Name on Product: 7/8 BWL, 3/9 AQ40 · 42 boss kills ·
// 25 players · best BWL clear 33:12. …", from the guild card's own data. It
// returns "" when the guild has no progression, kills or members to report.
func guildOGDescription(d guildOGData, raids map[string]guildOGRaid, product string) string {
	var parts []string

	// guildOGProgression lists the furthest raids last; lead with the furthest.
	prog := guildOGProgression(d.Encounters, raids)
	var raidsDown []string
	for i := len(prog) - 1; i >= 0 && len(raidsDown) < 3; i-- {
		fields := strings.Split(prog[i], ":")
		if len(fields) == 3 {
			raidsDown = append(raidsDown, fields[1]+"/"+fields[2]+" "+fields[0])
		}
	}
	if len(raidsDown) > 0 {
		parts = append(parts, strings.Join(raidsDown, ", "))
	}

	var kills int64
	for _, e := range d.Encounters {
		kills += int64(e.Kills)
	}
	var facts []string
	if kills > 0 {
		facts = append(facts, plural(kills, "boss kill", "boss kills"))
	}
	if d.Members > 0 {
		facts = append(facts, plural(d.Members, "player", "players"))
	}
	if best := guildOGBestRun(d, raids); best != nil {
		facts = append(facts, "best "+guildOGRaidShortName(best.InstanceName)+" clear "+ogClock(best.DurationMs))
	}
	if len(facts) > 0 {
		parts = append(parts, strings.Join(facts, " · "))
	}
	if len(parts) == 0 {
		return ""
	}

	subject := d.Guild.Name
	if product != "" {
		subject += " on " + product
	}
	return subject + ": " + strings.Join(parts, " · ") + ". Raid progression and best clears on Chronicle."
}

// censusOGDescription leads the census description with the faction counts the
// card shows, or returns "" when neither faction has a counted character.
func censusOGDescription(params url.Values, product, base string) string {
	if params == nil {
		return ""
	}
	horde, _ := strconv.ParseInt(params.Get("horde"), 10, 64)
	alliance, _ := strconv.ParseInt(params.Get("alliance"), 10, 64)
	days, _ := strconv.Atoi(params.Get("days"))
	if horde == 0 && alliance == 0 {
		return ""
	}
	lead := fmt.Sprintf("Horde %s vs Alliance %s", ogCount(horde), ogCount(alliance))
	lead += fmt.Sprintf(": characters seen in the last %d days", days)
	if product != "" {
		lead += " on " + product
	}
	return lead + ". " + base
}

// leaderboardOGFacts is one sentence of leaderboard figures for a hub URL, drawn
// from the stored highlights the card uses: top ratings, fastest full clear or
// best single-fight DPS, per tab. It returns "" for tabs without highlights
// (Statistics, Parsing, Rulesets), an instance with no leaders, or no previews.
func leaderboardOGFacts(previews []chroniclesdk.HubLandingPreview, flavor database.WoWFlavor, tabID, instance string, query url.Values) string {
	var facts []string
	raid := ""
	pick := func(match func(chroniclesdk.HubLandingPreview) []string) {
		for _, preview := range defaultPreviews(previews, flavor) {
			if instance != "" && !strings.EqualFold(preview.InstanceName, instance) {
				continue
			}
			if got := match(preview); len(got) > 0 {
				facts, raid = got, preview.InstanceName
				return
			}
		}
	}
	switch tabID {
	case "", "ratings":
		guilds := query.Get("subject") == "guild" || query.Get("subject") == "guilds"
		pick(func(p chroniclesdk.HubLandingPreview) []string {
			var out []string
			if guilds {
				if e := first(p.Guild.Peak); e != nil && e.Score > 0 {
					out = append(out, fmt.Sprintf("top guild Peak %s (%s)", ratingValue(e.Score, "peak"), e.GuildName))
				}
				if e := first(p.Guild.RankedMastery); e != nil && e.Score > 0 {
					out = append(out, fmt.Sprintf("top guild Mastery %s (%s)", ratingValue(e.Score, "mastery"), e.GuildName))
				}
			} else {
				if e := first(p.Player.Peak); e != nil && e.Score > 0 {
					out = append(out, fmt.Sprintf("top Peak %s (%s)", ratingValue(e.Score, "peak"), e.PlayerName))
				}
				if e := first(p.Player.RankedMastery); e != nil && e.Score > 0 {
					out = append(out, fmt.Sprintf("top Mastery %s (%s)", ratingValue(e.Score, "mastery"), e.PlayerName))
				}
			}
			if tabID == "" {
				if e := first(p.Speedruns); e != nil && e.DurationMs > 0 {
					out = append(out, fmt.Sprintf("fastest clear %s (%s)", ogClock(e.DurationMs), e.GuildName))
				}
			}
			return out
		})
	case "speedruns":
		pick(func(p chroniclesdk.HubLandingPreview) []string {
			if e := first(p.Speedruns); e != nil && e.DurationMs > 0 {
				return []string{fmt.Sprintf("fastest full clear %s (%s)", ogClock(e.DurationMs), e.GuildName)}
			}
			return nil
		})
	case "performances":
		pick(func(p chroniclesdk.HubLandingPreview) []string {
			if e := first(p.Performances); e != nil && e.DPS > 0 {
				return []string{fmt.Sprintf("best single-fight DPS %s (%s)", ogCount(int64(e.DPS+0.5)), e.PlayerName)}
			}
			return nil
		})
	}
	if len(facts) == 0 {
		return ""
	}
	sentence := strings.Join(facts, ", ")
	sentence = strings.ToUpper(sentence[:1]) + sentence[1:]
	if instance == "" && raid != "" {
		sentence = raid + ": " + sentence
	}
	return sentence + "."
}

func first[T any](s []T) *T {
	if len(s) == 0 {
		return nil
	}
	return &s[0]
}

// instanceOGDescription is "Jan 2, 2006 · 2h 3m · 40 players · 9 bosses killed"
// plus the standing tagline. Figures that are unknown (a log with no encounters
// has no date or duration) are left out rather than printed as zero.
func instanceOGDescription(start time.Time, dur time.Duration, players, bossesKilled int) string {
	var parts []string
	if !start.IsZero() {
		parts = append(parts, start.Format("Jan 2, 2006"))
	}
	if dur > 0 {
		parts = append(parts, fmt.Sprintf("%dh %dm", int(dur.Hours()), int(dur.Minutes())%60))
	}
	if players > 0 {
		parts = append(parts, plural(int64(players), "player", "players"))
	}
	if bossesKilled > 0 {
		parts = append(parts, plural(int64(bossesKilled), "boss killed", "bosses killed"))
	}
	const tagline = "Raid performance and contribution analysis tool by Chronicle."
	if len(parts) == 0 {
		return tagline
	}
	return strings.Join(parts, " · ") + "\n" + tagline
}

// instanceBossesKilled counts the distinct bosses a log killed, counting a kill
// with adds still alive as a kill.
func instanceBossesKilled(encounters []database.LogInstanceEncounter) int {
	killed := make(map[string]struct{})
	for _, e := range encounters {
		if e.Boss && (e.KillType == database.KillTypeClean || e.KillType == database.KillTypePartial) {
			killed[e.Name] = struct{}{}
		}
	}
	return len(killed)
}
