package serviceog

import (
	"context"
	"encoding/json"
	"fmt"
	"net"
	"net/http"
	"net/url"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/google/uuid"
	"golang.org/x/sync/errgroup"

	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/combatlog/parser/common/instances"
	"github.com/Emyrk/chronicle/combatlog/parser/common/instances/rankings"
	"github.com/Emyrk/chronicle/combatlog/parser/common/registry"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/frontend"
	"github.com/Emyrk/chronicle/internal/parsepolicy"
	"github.com/Emyrk/chronicle/internal/services/servicetenant"
	"github.com/Emyrk/chronicle/internal/timeparsepolicy"
)

// guildOGMaxRaids caps the progression rows on the guild card.
const guildOGMaxRaids = 4

// guildOGRaidShortNames are the progression labels the guild card prints.
// Raids missing here keep their full name.
var guildOGRaidShortNames = map[string]string{
	"Molten Core":             "MC",
	"Onyxia's Lair":           "Ony",
	"Onyxia Classic":          "Ony",
	"Blackwing Lair":          "BWL",
	"Zul'Gurub":               "ZG",
	"Ruins of Ahn'Qiraj":      "AQ20",
	"Temple of Ahn'Qiraj":     "AQ40",
	"Naxxramas":               "Naxx",
	"Emerald Sanctum":         "ES",
	"Tower of Karazhan":       "Kara",
	"Lower Tower of Karazhan": "LKara",
	"Upper Tower of Karazhan": "UKara",
	"Karazhan":                "Kara",
	"Gruul's Lair":            "Gruul",
	"Magtheridon's Lair":      "Mag",
	"Serpentshrine Cavern":    "SSC",
	"Tempest Keep":            "TK",
	"Hyjal Summit":            "Hyjal",
	"Black Temple":            "BT",
	"Zul'Aman":                "ZA",
	"Sunwell Plateau":         "SWP",
	"Vault of Archavon":       "VoA",
	"Obsidian Sanctum":        "OS",
	"Eye of Eternity":         "EoE",
	"Trial of the Crusader":   "ToC",
	"Ruby Sanctum":            "RS",
	"Icecrown Citadel":        "ICC",
}

func guildOGRaidShortName(name string) string {
	if short, ok := guildOGRaidShortNames[name]; ok {
		return short
	}
	return name
}

// guildOGRaid is the registry metadata the card needs for one raid.
type guildOGRaid struct {
	Order int
	Total int
	// Bosses lists the encounters that count toward progression; nil counts
	// every boss kill.
	Bosses map[string]struct{}
}

// guildOGRaids indexes the flavor's raids that have a known boss count, plus
// their derived names (Turtle splits "Tower of Karazhan" into Lower/Upper).
// A derived raid takes its order from DerivedRaidProgressionOrders and its
// bosses from the Bosses requirements of DerivedSpeedrunRules, the same rule
// as the frontend's selectSupportedInstanceProgressionBosses.
func guildOGRaids(details []registry.InstanceDetail) map[string]guildOGRaid {
	raids := make(map[string]guildOGRaid)
	for _, d := range details {
		if d.Category != instances.InstanceCategoryRaid {
			continue
		}
		if d.BossCount != nil && *d.BossCount > 0 {
			raid := guildOGRaid{Order: d.RaidProgressionOrder, Total: *d.BossCount}
			if d.ProgressionBosses != nil {
				raid.Bosses = make(map[string]struct{}, len(d.ProgressionBosses))
				for _, boss := range d.ProgressionBosses {
					raid.Bosses[boss] = struct{}{}
				}
			}
			raids[d.Name] = raid
		}
		for _, name := range d.DerivedNames {
			rules := d.DerivedSpeedrunRules[name]
			if rules == nil {
				continue
			}
			bosses := make(map[string]struct{})
			for _, req := range rules.Requirements {
				if req.Category == rankings.SpeedrunCategoryBosses {
					bosses[req.Name] = struct{}{}
				}
			}
			if len(bosses) == 0 {
				continue
			}
			raids[name] = guildOGRaid{Order: d.DerivedRaidProgressionOrders[name], Total: len(bosses), Bosses: bosses}
		}
	}
	return raids
}

// guildOGData is everything the guild card is built from.
type guildOGData struct {
	Guild      database.GetGuildByIDRow
	Theme      chroniclesdk.GuildPageTheme
	Members    int64
	Encounters []database.GuildEncounterKillsRow
	BestRuns   []database.GuildBestRunsRow
}

// guildOGParams builds the `template=guild` params (minus host/product, which
// ogImageURL adds). host makes a site-relative logo URL absolute.
func guildOGParams(host string, d guildOGData, raids map[string]guildOGRaid) url.Values {
	q := url.Values{}
	q.Set("name", d.Guild.Name)
	if d.Members > 0 {
		q.Set("members", strconv.FormatInt(d.Members, 10))
	}
	if icon := guildOGLogoURL(host, d.Theme.LogoURL); icon != "" {
		q.Set("icon", icon)
	}
	if accent := strings.TrimPrefix(strings.TrimSpace(d.Theme.PrimaryColor), "#"); accent != "" {
		q.Set("accent", accent)
	}
	if len(d.Theme.Tags) > 0 {
		q.Set("tag", string(d.Theme.Tags[0]))
	}

	var since time.Time
	for _, e := range d.Encounters {
		if _, ok := raids[e.InstanceName]; !ok {
			continue
		}
		if e.FirstKilledAt.Valid && (since.IsZero() || e.FirstKilledAt.Time.Before(since)) {
			since = e.FirstKilledAt.Time
		}
	}
	if !since.IsZero() {
		q.Set("since", since.UTC().Format("2006-01"))
	}

	prog := guildOGProgression(d.Encounters, raids)
	if len(prog) > 0 {
		q.Set("prog", strings.Join(prog, ","))
	} else if logged := guildOGRaidsLogged(d.Encounters, raids); logged > 0 {
		// No progression: the activity fallback only shows estimated raid nights.
		// Aggregate player scores are not ready for guild Open Graph cards.
		q.Set("raids", strconv.Itoa(logged))
	}

	// Best clear: the fastest full clear of the furthest raid the guild has cleared.
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
	if best != nil {
		q.Set("best", strconv.FormatInt(best.DurationMs/1000, 10))
		q.Set("bestraid", guildOGRaidShortName(best.InstanceName))
	}

	return q
}

// guildOGProgression returns up to guildOGMaxRaids `short:down:total` items,
// the furthest raids the guild has killed bosses in, in progression order.
// Each raid counts its best size/difficulty variant.
func guildOGProgression(encounters []database.GuildEncounterKillsRow, raids map[string]guildOGRaid) []string {
	type variantKey struct {
		instance   string
		difficulty string
		maxPlayers int32
	}
	killed := make(map[variantKey]map[string]struct{})
	for _, e := range encounters {
		raid, ok := raids[e.InstanceName]
		if !ok {
			continue
		}
		if raid.Bosses != nil {
			if _, ok := raid.Bosses[e.EncounterName]; !ok {
				continue
			}
		}
		key := variantKey{e.InstanceName, e.DifficultyName, e.MaxPlayers}
		if killed[key] == nil {
			killed[key] = make(map[string]struct{})
		}
		killed[key][e.EncounterName] = struct{}{}
	}

	down := make(map[string]int)
	for key, bosses := range killed {
		down[key.instance] = max(down[key.instance], len(bosses))
	}
	names := make([]string, 0, len(down))
	for name := range down {
		names = append(names, name)
	}
	sort.Slice(names, func(i, j int) bool {
		if raids[names[i]].Order != raids[names[j]].Order {
			return raids[names[i]].Order < raids[names[j]].Order
		}
		return names[i] < names[j]
	})
	if len(names) > guildOGMaxRaids {
		names = names[len(names)-guildOGMaxRaids:]
	}

	prog := make([]string, 0, len(names))
	for _, name := range names {
		total := raids[name].Total
		prog = append(prog, fmt.Sprintf("%s:%d:%d", guildOGRaidShortName(name), min(down[name], total), total))
	}
	return prog
}

// guildOGRaidsLogged approximates the guild's logged raid nights: per raid,
// the most kills of any one boss. Dungeons don't count.
func guildOGRaidsLogged(encounters []database.GuildEncounterKillsRow, raids map[string]guildOGRaid) int {
	most := make(map[string]int)
	for _, e := range encounters {
		if _, ok := raids[e.InstanceName]; !ok {
			continue
		}
		most[e.InstanceName] = max(most[e.InstanceName], int(e.Kills))
	}
	total := 0
	for _, n := range most {
		total += n
	}
	return total
}

// guildOGLogoMaxLen drops logo URLs too long to be worth signing into the image URL.
const guildOGLogoMaxLen = 512

// guildOGLogoDomain is Chronicle's own domain; logos on it or its subdomains
// are Chronicle-hosted.
const guildOGLogoDomain = "chronicleclassic.com"

// guildOGLogoURL returns the guild logo as an absolute https URL when it is
// Chronicle-hosted (the page's own host, or chronicleclassic.com and its
// subdomains), so the OG service never fetches from a host a guild admin
// picked. Anything else, or anything over guildOGLogoMaxLen, returns "" and
// the card draws the monogram.
func guildOGLogoURL(host, raw string) string {
	raw = strings.TrimSpace(raw)
	if raw == "" || len(raw) > guildOGLogoMaxLen {
		return ""
	}
	if strings.HasPrefix(raw, "/") && !strings.HasPrefix(raw, "//") {
		raw = "https://" + host + raw
	}
	u, err := url.Parse(raw)
	if err != nil || u.Scheme != "https" || u.Host == "" || u.User != nil || len(u.String()) > guildOGLogoMaxLen {
		return ""
	}
	logoHost := strings.ToLower(u.Hostname())
	pageHost := strings.ToLower(host)
	if h, _, err := net.SplitHostPort(pageHost); err == nil {
		pageHost = h
	}
	if logoHost != pageHost && logoHost != guildOGLogoDomain && !strings.HasSuffix(logoHost, "."+guildOGLogoDomain) {
		return ""
	}
	return u.String()
}

// guildOGCardTimeout bounds the guild card's queries. OG data resolves on
// every HTML load of the page, browsers included, so the card must not hold up
// the first byte for long; a query that runs out just leaves its part off.
const guildOGCardTimeout = 1500 * time.Millisecond

// guildOG builds the Open Graph metadata for /g/{guildID}. The guild lookup
// (title and description) gets 5s; the card's queries only run when the OG
// service is configured, in parallel under guildOGCardTimeout.
func (s *Service) guildOG(r *http.Request, rawID string) *frontend.OGData {
	guildID, err := uuid.Parse(rawID)
	if err != nil {
		return nil
	}
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	db := s.store
	guild, err := db.GetGuildByID(ctx, guildID)
	if err != nil {
		return nil
	}

	host := ogHost(r)
	og := &frontend.OGData{
		Title:       guild.Name,
		Description: fmt.Sprintf("%s guild: raid progression and best clears on Chronicle.", guild.Name),
		URL:         fmt.Sprintf("https://%s/g/%s", host, guild.ID),
	}
	if s.imageBaseURL == nil || s.signingKey == "" {
		return og
	}

	// Each lookup is best effort: a failure or timeout leaves its params off
	// the card. Each goroutine writes only its own field; all are read after Wait.
	ctx, cancelCard := context.WithTimeout(ctx, guildOGCardTimeout)
	defer cancelCard()
	data := guildOGData{Guild: guild}
	tenantID := servicetenant.TenantIDFromContext(ctx)
	lookbackDays := int64(parsepolicy.DefaultLookbackDays)
	var g errgroup.Group
	g.Go(func() error {
		if page, err := db.GetGuildPage(ctx, guildID); err == nil {
			_ = json.Unmarshal(page.Theme, &data.Theme)
		}
		return nil
	})
	g.Go(func() error {
		data.Members, _ = db.CountGuildPlayers(ctx, guildID)
		return nil
	})
	g.Go(func() error {
		data.Encounters, _ = db.GuildEncounterKills(ctx, guildID)
		return nil
	})
	g.Go(func() error {
		data.BestRuns, _ = db.GuildBestRuns(ctx, database.GuildBestRunsParams{
			TenantID:       tenantID,
			GuildID:        guildID,
			SinceDays:      lookbackDays,
			LookbackDays:   int32(lookbackDays),
			PolicyVersion:  int16(timeparsepolicy.PolicyVersion),
			QueryVersion:   timeparsepolicy.QueryVersion,
			MinParseSample: timeparsepolicy.MinSampleForParse,
		})
		return nil
	})
	_ = g.Wait()

	var raids map[string]guildOGRaid
	if s.chronicle != nil {
		raids = guildOGRaids(s.chronicle.RegistryForFlavor(s.resolvedSiteFlavor(ctx)).AllInstanceDetails())
	}
	if imageURL := s.ogImageURL(r, "guild", guildOGParams(host, data, raids)); imageURL != "" {
		og.ImageURL = imageURL
	}
	return og
}
