package serviceog

import (
	"context"
	"encoding/json"
	"fmt"
	"math"
	"net/http"
	"net/url"
	"sort"
	"strconv"
	"strings"

	"github.com/google/uuid"

	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/combatlog/parser/common/instances"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/internal/services/servicetenant"
)

const (
	// leaderboardCardRows is the row count of a board drawn beside two others.
	leaderboardCardRows = 3
	// leaderboardCardListRows is the row count of a lone board.
	leaderboardCardListRows = 5
	// leaderboardCardHubRaids is how many raids the hub landing card shows.
	leaderboardCardHubRaids = 3
	// leaderboardCardNameLength caps names on the card (the renderer allows 28).
	leaderboardCardNameLength = 24
)

// leaderboardCardURL is the signed leaderboard card for a hub URL, or "" to
// keep the brand card: no OG service, no tenant, no stored highlights yet, a
// tab without a card (Statistics, Parsing, Rulesets), or an instance with no
// leaders. Highlights keep only three statistics rows, too few for a card.
//
// Highlights are the hub's own precomputed landing previews, read through a
// per-tenant cache that never blocks the request.
func (s *Service) leaderboardCardURL(r *http.Request, flavor database.WoWFlavor, tabID, instance string) string {
	if !s.ogServiceConfigured() || s.store == nil {
		return ""
	}
	tenant := servicetenant.TenantFromContext(r.Context())
	if tenant == nil {
		return ""
	}
	tenantID := tenant.ID
	previews := s.ogHighlights.Get(r.Context(), s.logger, func(ctx context.Context) ([]chroniclesdk.HubLandingPreview, error) {
		rows, err := s.store.ListLeaderboardHighlights(ctx, database.ListLeaderboardHighlightsParams{TenantID: tenantID, RealmScope: uuid.Nil})
		if err != nil {
			return nil, err
		}
		return decodeHighlights(rows), nil
	})
	params := leaderboardCardParams(previews, flavor, tabID, instance, r.URL.Query())
	if params == nil {
		return ""
	}
	params.Set("path", r.URL.EscapedPath())
	return s.ogImageURL(r, "leaderboard", params)
}

// decodeHighlights keeps every stored preview that decodes. A preview whose
// configuration fingerprint is out of date is still recent data, so the card
// uses it while the hub rebuilds.
func decodeHighlights(rows []database.LeaderboardHighlight) []chroniclesdk.HubLandingPreview {
	out := make([]chroniclesdk.HubLandingPreview, 0, len(rows))
	for _, row := range rows {
		var preview chroniclesdk.HubLandingPreview
		if json.Unmarshal(row.Payload, &preview) == nil {
			out = append(out, preview)
		}
	}
	return out
}

// leaderboardCardParams picks the card for a hub page. Overview on the hub
// landing shows the three highest-progression raids; every other page shows
// one raid, and a landing tab uses the highest-progression raid with data.
func leaderboardCardParams(previews []chroniclesdk.HubLandingPreview, flavor database.WoWFlavor, tabID, instance string, query url.Values) url.Values {
	raids := defaultPreviews(previews, flavor)
	if instance != "" {
		for _, preview := range raids {
			if strings.EqualFold(preview.InstanceName, instance) {
				return leaderboardRaidParams(preview, tabID, query)
			}
		}
		return nil
	}
	if tabID == "" {
		return hubCardParams(raids)
	}
	for _, preview := range raids {
		if params := leaderboardRaidParams(preview, tabID, query); params != nil {
			return params
		}
	}
	return nil
}

// defaultPreviews keeps one preview per instance (the default difficulty and
// size when there is one), highest raid progression first.
func defaultPreviews(previews []chroniclesdk.HubLandingPreview, flavor database.WoWFlavor) []chroniclesdk.HubLandingPreview {
	byName := make(map[string]chroniclesdk.HubLandingPreview)
	for _, preview := range previews {
		current, seen := byName[preview.InstanceName]
		isDefault := preview.DifficultyName == "" && preview.MaxPlayers == 0
		if !seen || (isDefault && (current.DifficultyName != "" || current.MaxPlayers != 0)) {
			byName[preview.InstanceName] = preview
		}
	}
	out := make([]chroniclesdk.HubLandingPreview, 0, len(byName))
	for _, preview := range byName {
		out = append(out, preview)
	}
	sort.Slice(out, func(i, j int) bool {
		oi, oj := instances.RaidProgressionOrder(out[i].InstanceName, flavor), instances.RaidProgressionOrder(out[j].InstanceName, flavor)
		if oi != oj {
			return oi > oj
		}
		return out[i].InstanceName < out[j].InstanceName
	})
	return out
}

// hubCardParams is the hub landing: per raid, the top Peak player, the top
// Mastery player and the fastest-clear guild, each labelled with its metric.
func hubCardParams(raids []chroniclesdk.HubLandingPreview) url.Values {
	params := url.Values{"chip": {"Leaderboards"}, "view": {"Top raids"}}
	board := 0
	for _, preview := range raids {
		var rows []string
		if p := preview.Player.Peak; len(p) > 0 {
			rows = append(rows, playerRow(p[0], "peak", "Peak"))
		}
		if p := preview.Player.RankedMastery; len(p) > 0 {
			rows = append(rows, playerRow(p[0], "mastery", "Mastery"))
		}
		if c := preview.Speedruns; len(c) > 0 {
			rows = append(rows, clearRow(c[0], "Fastest clear"))
		}
		if len(rows) == 0 {
			continue
		}
		if board == 0 {
			params.Set("art", ogArtSlug(preview.InstanceName))
		}
		board++
		params.Set(fmt.Sprintf("b%d", board), preview.InstanceName)
		params.Set(fmt.Sprintf("r%d", board), strings.Join(rows, ","))
		if board == leaderboardCardHubRaids {
			break
		}
	}
	if board == 0 {
		return nil
	}
	return params
}

// leaderboardCardBoard is one board: a title and its encoded rows.
type leaderboardCardBoard struct {
	title string
	rows  []string
}

// leaderboardRaidParams is one raid's card for tabID, or nil when the tab has no card
// or the raid has no leaders for it.
func leaderboardRaidParams(preview chroniclesdk.HubLandingPreview, tabID string, query url.Values) url.Values {
	chip, view := "Leaderboards", ""
	if tab, ok := leaderboardOGTabs[tabID]; ok {
		chip = tab.Label
	}
	var boards []leaderboardCardBoard
	switch tabID {
	case "":
		boards = []leaderboardCardBoard{
			{"Peak", playerRows(preview.Player.Peak, "peak", leaderboardCardRows)},
			{"Mastery", playerRows(preview.Player.RankedMastery, "mastery", leaderboardCardRows)},
			{"Fastest clear", clearRows(preview.Speedruns, leaderboardCardRows)},
		}
	case "ratings":
		boards, view = ratingBoards(preview, query)
	case "speedruns":
		view = "Fastest full clears"
		boards = []leaderboardCardBoard{{"Full clear", clearRows(preview.Speedruns, leaderboardCardListRows)}}
	case "performances":
		view = "Best single-fight DPS"
		boards = []leaderboardCardBoard{{"DPS", performanceRows(preview.Performances, leaderboardCardListRows)}}
	default:
		return nil
	}

	params := url.Values{"raid": {preview.InstanceName}, "art": {ogArtSlug(preview.InstanceName)}, "chip": {chip}}
	if view != "" {
		params.Set("view", view)
	}
	board := 0
	for _, b := range boards {
		if len(b.rows) == 0 {
			continue
		}
		board++
		params.Set(fmt.Sprintf("b%d", board), b.title)
		params.Set(fmt.Sprintf("r%d", board), strings.Join(b.rows, ","))
	}
	if board == 0 {
		return nil
	}
	return params
}

// ratingBoards follows the shareable ?rating= and ?subject= views: one tall
// board for a chosen rating, else Peak, Mastery and Renown side by side.
func ratingBoards(preview chroniclesdk.HubLandingPreview, query url.Values) ([]leaderboardCardBoard, string) {
	guilds := query.Get("subject") == "guild" || query.Get("subject") == "guilds"
	type metric struct{ key, label, tone string }
	metrics := []metric{{"peak", "Peak", "peak"}, {"mastery", "Mastery", "mastery"}, {"renown", "Renown", "renown"}}
	rowsFor := func(m metric, limit int) []string {
		if guilds {
			switch m.key {
			case "peak":
				return guildRows(preview.Guild.Peak, m.tone, limit)
			case "mastery":
				return guildRows(preview.Guild.RankedMastery, m.tone, limit)
			default:
				return guildRows(preview.Guild.Renown, m.tone, limit)
			}
		}
		switch m.key {
		case "peak":
			return playerRows(preview.Player.Peak, m.tone, limit)
		case "mastery":
			return playerRows(preview.Player.RankedMastery, m.tone, limit)
		default:
			return playerRows(preview.Player.Renown, m.tone, limit)
		}
	}
	prefix := ""
	if guilds {
		prefix = "Guild "
	}
	for _, m := range metrics {
		if query.Get("rating") == m.key {
			return []leaderboardCardBoard{{prefix + m.label, rowsFor(m, leaderboardCardListRows)}}, prefix + m.label
		}
	}
	boards := make([]leaderboardCardBoard, 0, len(metrics))
	for _, m := range metrics {
		boards = append(boards, leaderboardCardBoard{prefix + m.label, rowsFor(m, leaderboardCardRows)})
	}
	return boards, ""
}

// Rows are `name:kind:value:tone:sub` (services/og leaderboard.tsx): kind is
// the player's class slug or "guild"; realm names never appear.

func playerRow(e chroniclesdk.HubPlayerRatingEntry, tone, sub string) string {
	return cardRow(e.PlayerName, ogClassSlug(e.PlayerClass), ratingValue(e.Score, tone), tone, sub)
}

func playerRows(entries []chroniclesdk.HubPlayerRatingEntry, tone string, limit int) []string {
	rows := make([]string, 0, limit)
	for _, e := range entries {
		if len(rows) == limit {
			break
		}
		if row := playerRow(e, tone, cardSpec(e.PlayerSpec)); row != "" {
			rows = append(rows, row)
		}
	}
	return rows
}

func guildRows(entries []chroniclesdk.HubGuildRatingEntry, tone string, limit int) []string {
	rows := make([]string, 0, limit)
	for _, e := range entries {
		if len(rows) == limit {
			break
		}
		if row := cardRow(e.GuildName, "guild", ratingValue(e.Score, tone), tone, ""); row != "" {
			rows = append(rows, row)
		}
	}
	return rows
}

func clearRow(e chroniclesdk.SpeedrunLeaderboardEntry, sub string) string {
	if e.DurationMs <= 0 {
		return ""
	}
	return cardRow(e.GuildName, "guild", strconv.FormatInt(e.DurationMs/1000, 10), "time", sub)
}

func clearRows(entries []chroniclesdk.SpeedrunLeaderboardEntry, limit int) []string {
	rows := make([]string, 0, limit)
	for _, e := range entries {
		if len(rows) == limit {
			break
		}
		sub := ""
		if e.PlayerCount > 0 {
			sub = fmt.Sprintf("%d players", e.PlayerCount)
		}
		if row := clearRow(e, sub); row != "" {
			rows = append(rows, row)
		}
	}
	return rows
}

func performanceRows(entries []chroniclesdk.RankingsEntry, limit int) []string {
	rows := make([]string, 0, limit)
	for _, e := range entries {
		if len(rows) == limit {
			break
		}
		if e.DPS <= 0 {
			continue
		}
		if row := cardRow(e.PlayerName, ogClassSlug(e.PlayerClass), strconv.Itoa(int(math.Round(e.DPS))), "gold", cardName(e.EncounterName)); row != "" {
			rows = append(rows, row)
		}
	}
	return rows
}

// ratingValue formats a score as the hub does: Peak and Mastery to one
// decimal, Renown as a whole number.
func ratingValue(score float64, tone string) string {
	if tone == "renown" {
		return strconv.Itoa(int(math.Round(score)))
	}
	return strconv.FormatFloat(score, 'f', 1, 64)
}

// cardSpec hides the placeholder specs the hub hides.
func cardSpec(spec string) string {
	if spec == "Unknown" {
		return ""
	}
	return cardName(spec)
}

// cardName drops the row delimiters and caps a name for the card.
func cardName(name string) string {
	name = strings.TrimSpace(strings.NewReplacer(",", "", ":", "").Replace(name))
	if runes := []rune(name); len(runes) > leaderboardCardNameLength {
		name = string(runes[:leaderboardCardNameLength])
	}
	return name
}

// cardRow encodes one row, or "" when it has no name.
func cardRow(name, kind, value, tone, sub string) string {
	name = cardName(name)
	if name == "" || value == "" {
		return ""
	}
	return strings.Join([]string{name, kind, value, tone, cardName(sub)}, ":")
}
