package serviceog

import (
	"context"
	"fmt"
	"net/http"
	"net/url"
	"path"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/Emyrk/chronicle/api/db2sdk"
	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/authz"
	"github.com/Emyrk/chronicle/frontend"
	"github.com/Emyrk/chronicle/internal/wowspec"
)

// Routes returns the Open Graph route definitions for the frontend handler.
func (s *Service) Routes() []frontend.OGRoute {
	routes := make([]frontend.OGRoute, 0, len(staticOGRoutes)+5)
	for pattern, metadata := range staticOGRoutes {
		pattern, metadata := pattern, metadata
		routes = append(routes, frontend.OGRoute{
			Pattern: pattern,
			Resolve: func(r *http.Request) *frontend.OGData {
				og := flavorStaticOG(pattern, seoProductName(s.resolvedSiteFlavor(r.Context())), metadata, canonicalRequestURL(s, r))
				if metadata.Image != "" {
					og.ImageURL = canonicalOrigin(s, r) + metadata.Image
				}
				return og
			},
		})
	}
	routes = append(routes, []frontend.OGRoute{
		{
			Pattern: "/instances/{idOrSlug}",
			Resolve: func(r *http.Request) *frontend.OGData {
				return s.instanceOG(r, ogHost(r), chi.URLParam(r, "idOrSlug"))
			},
		},
		{
			Pattern: "/s/{code}",
			Resolve: func(r *http.Request) *frontend.OGData {
				return s.shareOG(r, ogHost(r), chi.URLParam(r, "code"))
			},
		},
		{
			Pattern: "/g/{guildID}",
			Resolve: func(r *http.Request) *frontend.OGData {
				return s.guildOG(r, chi.URLParam(r, "guildID"))
			},
		},
		{
			Pattern: "/armory/{realm}/{player}",
			Resolve: func(r *http.Request) *frontend.OGData {
				return s.armoryOG(r, chi.URLParam(r, "realm"), chi.URLParam(r, "player"))
			},
		},
		{
			Pattern: "/talents",
			Resolve: func(r *http.Request) *frontend.OGData {
				return flavorTalentCalculatorOG(ogHost(r), seoProductName(s.resolvedSiteFlavor(r.Context())), "", "")
			},
		},
		{
			Pattern: "/talents/{class}",
			Resolve: func(r *http.Request) *frontend.OGData {
				class, build := chi.URLParam(r, "class"), r.URL.Query().Get("build")
				og := flavorTalentCalculatorOG(ogHost(r), seoProductName(s.resolvedSiteFlavor(r.Context())), class, build)
				if params := talentOGImageParams(class, build); params != nil {
					if imageURL := s.ogImageURL(r, "talents", params); imageURL != "" {
						og.ImageURL = imageURL
					}
				}
				return og
			},
		},
	}...)
	routes = append(routes, s.leaderboardRoutes()...)
	// Any page without its own image, or whose lookup failed, gets the brand card.
	for i := range routes {
		routes[i].Resolve = s.withBrandOG(routes[i].Resolve)
	}
	// Every other page (blog posts, tools, 404s) gets only the brand image; its
	// own title and description stay as rendered. Chi tries this route last.
	brandOnly := s.withBrandOG(func(*http.Request) *frontend.OGData { return &frontend.OGData{} })
	routes = append(routes, frontend.OGRoute{
		Pattern: "/*",
		Resolve: func(r *http.Request) *frontend.OGData {
			if path.Ext(r.URL.Path) != "" {
				return nil // a static asset, not a page
			}
			return brandOnly(r)
		},
	})
	return routes
}

type staticOGMetadata struct {
	Title       string
	Description string
	// Image is an optional site-relative social preview image path.
	Image string
}

func seoProductName(flavor database.WoWFlavor) string {
	switch {
	case flavor.Has(database.FlavorWoWForever):
		return "WoW Forever"
	case flavor.Has(database.FlavorKronos):
		return "Kronos"
	case flavor.Has(database.FlavorChromieCraft):
		return "ChromieCraft"
	case flavor.Has(database.FlavorWarmane):
		return "Warmane"
	case flavor.Has(database.FlavorEpoch):
		return "Epoch Reborn"
	case flavor.Has(database.FlavorVanillaPlus):
		return "VanillaPlus"
	case flavor.Has(database.FlavorOctoWoW):
		return "OctoWoW"
	case flavor.Has(database.FlavorCapybara):
		return "CapybaraCraft"
	case flavor.Has(database.FlavorSunreach):
		return "Sun Reach"
	case flavor.Has(database.FlavorFaebright):
		return "Faebright"
	case flavor.Has(database.FlavorMoonwell):
		return "Moonwell"
	case flavor.Has(database.FlavorAshenWoW):
		return "AshenWoW"
	case flavor.Has(database.FlavorHellfire):
		return "Hellfire WoW"
	case flavor.Has(database.FlavorCrusaderStorm):
		return "Crusader Storm"
	case flavor.Has(database.FlavorLunatic):
		return "Level One Lunatics"
	default:
		return ""
	}
}

func flavorStaticOG(pattern, productName string, metadata staticOGMetadata, canonicalURL string) *frontend.OGData {
	description := metadata.Description
	if productName != "" {
		switch pattern {
		case "/":
			description = fmt.Sprintf("Analyze %s combat logs with damage, healing, death, rankings, and raid performance reports. Upload logs and compare players and guilds.", productName)
		case "/recent":
			description = fmt.Sprintf("Browse recently uploaded %s combat logs and raid performance reports.", productName)
		}
	}
	return &frontend.OGData{Title: metadata.Title, Description: description, URL: canonicalURL}
}

var staticOGRoutes = map[string]staticOGMetadata{
	"/":             {Title: "Raid Logs and Performance Analysis", Description: defaultSEODescription},
	"/recent":       {Title: "Recent Raids", Description: "Explore recently uploaded raid logs and performance reports."},
	"/guilds":       {Title: "Guilds", Description: "Find guild rosters, raid history, and performance analytics."},
	"/armory":       {Title: "Character Armory", Description: "Search character profiles, equipment, talents, and raid performance."},
	"/wowdb":        {Title: "World of Warcraft Database", Description: "Explore game data and reference information."},
	"/technical":    {Title: "Technical Reference", Description: "Explore Chronicle combat analysis references."},
	"/census":       {Title: "Realm Census", Description: "Explore character and population statistics."},
	"/speedrunning": {Title: "Speedrunning", Description: "Explore raid speedrunning records and performance."},
	"/tools":        {Title: "Tools", Description: "Explore Chronicle raid and character analysis tools."},
	"/download": {
		Title:       "Chronicle Sidekick",
		Description: "A free tray app for Windows, macOS and Linux that finds WoW, watches your combat log and uploads your raid to Chronicle in one click.",
		Image:       "/c/images/og/sidekick.jpg",
	},
}

// talentClassSlugs maps calculator URL slugs to display and wowspec names.
var talentClassSlugs = map[string]struct {
	Display string
	Spec    string // wowspec.InferSpec class key
}{
	"warrior":     {"Warrior", "WARRIOR"},
	"paladin":     {"Paladin", "PALADIN"},
	"hunter":      {"Hunter", "HUNTER"},
	"rogue":       {"Rogue", "ROGUE"},
	"priest":      {"Priest", "PRIEST"},
	"shaman":      {"Shaman", "SHAMAN"},
	"mage":        {"Mage", "MAGE"},
	"warlock":     {"Warlock", "WARLOCK"},
	"druid":       {"Druid", "DRUID"},
	"deathknight": {"Death Knight", "DEATH_KNIGHT"},
	"pet":         {"Hunter Pet", ""},
}

var talentPetSlugs = map[string]struct{}{
	"pet": {},
}

// talentBuildSummary sums the digits of each dash-separated tab section of a
// positional build string, e.g. "0532-31-55" → [10, 4, 10].
func talentBuildSummary(build string) (summary [3]uint8, total int) {
	for i, section := range strings.SplitN(build, "-", 3) {
		var points int
		for _, ch := range section {
			if ch >= '0' && ch <= '9' {
				points += int(ch - '0')
			}
		}
		if points > 255 {
			points = 255
		}
		summary[i] = uint8(points)
		total += points
	}
	return summary, total
}

// ogHost returns the request host for og:url construction (keeping tenant
// subdomains like capy.chronicleclassic.com), falling back to the canonical
// domain when the Host header contains anything unexpected. The og:url meta
// is rendered by text/template (no HTML escaping), so the host must be
// strictly validated before echoing.
func ogHost(r *http.Request) string {
	host := strings.ToLower(r.Host)
	for _, ch := range host {
		if (ch < 'a' || ch > 'z') && (ch < '0' || ch > '9') && ch != '.' && ch != '-' && ch != ':' {
			return "chronicleclassic.com"
		}
	}
	if host == "" {
		return "chronicleclassic.com"
	}
	return host
}

// sanitizeBuildParam keeps only the characters valid in a positional build
// string (digits and dashes). The og:url meta is rendered by text/template
// (no HTML escaping), so nothing user-controlled may pass through verbatim.
func sanitizeBuildParam(build string) string {
	var b strings.Builder
	for _, ch := range build {
		if (ch >= '0' && ch <= '9') || ch == '-' {
			b.WriteRune(ch)
		}
	}
	return b.String()
}

// talentCalculatorOG builds generic Open Graph metadata for talent calculator links.
// classSlug and build may be empty ("/talents" landing page).
func talentCalculatorOG(host, classSlug, build string) *frontend.OGData {
	return flavorTalentCalculatorOG(host, "", classSlug, build)
}

func flavorTalentCalculatorOG(host, productName, classSlug, build string) *frontend.OGData {
	productName = strings.TrimSpace(productName)
	cls, ok := talentClassSlugs[strings.ToLower(classSlug)]
	if !ok {
		description := "Plan, share, and compare class talent builds."
		if productName != "" {
			description = fmt.Sprintf("Build, share, and compare %s class talent builds with Chronicle's talent calculator.", productName)
		}
		return &frontend.OGData{
			Title:       "Talent Calculator",
			Description: description,
			URL:         fmt.Sprintf("https://%s/talents", host),
		}
	}
	build = sanitizeBuildParam(build)

	classURL := fmt.Sprintf("https://%s/talents/%s", host, strings.ToLower(classSlug))
	className := cls.Display
	if productName != "" {
		className = productName + " " + className
	}
	if build == "" {
		description := fmt.Sprintf("Plan and share %s talent builds.", cls.Display)
		if productName != "" {
			description = fmt.Sprintf("Plan, compare, and share %s talent builds with Chronicle's talent calculator.", className)
		}
		return &frontend.OGData{
			Title:       fmt.Sprintf("%s Talent Calculator", cls.Display),
			Description: description,
			URL:         classURL,
		}
	}

	summary, total := talentBuildSummary(build)
	if _, isPet := talentPetSlugs[strings.ToLower(classSlug)]; isPet {
		return &frontend.OGData{
			Title:       fmt.Sprintf("%s (%d/%d/%d)", cls.Display, summary[0], summary[1], summary[2]),
			Description: fmt.Sprintf("A %d-point %s talent build. Open it in the talent calculator.", total, className),
			URL:         fmt.Sprintf("%s?build=%s", classURL, build),
		}
	}

	spec := wowspec.InferSpec(cls.Spec, summary)
	title := fmt.Sprintf("%s %s (%d/%d/%d)", spec, cls.Display, summary[0], summary[1], summary[2])
	if spec == "Unknown" {
		title = fmt.Sprintf("%s (%d/%d/%d)", cls.Display, summary[0], summary[1], summary[2])
	}
	return &frontend.OGData{
		Title:       title,
		Description: fmt.Sprintf("A %d-point %s talent build. Open it in the talent calculator.", total, className),
		URL:         fmt.Sprintf("%s?build=%s", classURL, build),
	}
}

// talentOGImageParams returns the OG service `talents` card params for a
// calculator link: class, and with a build, points per tree ("17-34-0", or one
// number for a pet) and the inferred spec when there is one. Unknown class → nil.
func talentOGImageParams(classSlug, build string) url.Values {
	slug := strings.ToLower(classSlug)
	cls, ok := talentClassSlugs[slug]
	if !ok {
		return nil
	}
	params := url.Values{"class": {slug}}
	build = sanitizeBuildParam(build)
	if build == "" {
		return params
	}
	summary, total := talentBuildSummary(build)
	if _, isPet := talentPetSlugs[slug]; isPet {
		params.Set("points", strconv.Itoa(total))
		return params
	}
	params.Set("points", fmt.Sprintf("%d-%d-%d", summary[0], summary[1], summary[2]))
	if spec := wowspec.InferSpec(cls.Spec, summary); spec != "Unknown" {
		params.Set("spec", spec)
	}
	return params
}

func (s *Service) instanceOG(r *http.Request, host, idOrSlug string) *frontend.OGData {
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	inst, err := resolveInstance(ctx, s.store, idOrSlug)
	if err != nil {
		return nil
	}

	return s.buildInstanceOG(ctx, r, host, inst, nil)
}

func (s *Service) shareOG(r *http.Request, host, code string) *frontend.OGData {
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	db := s.store
	shared, err := db.GetSharedViewByCode(ctx, code)
	if err != nil {
		return nil
	}

	// Resolve instance: try by ID first, fall back to slug if ID was nulled (reparse).
	var inst database.LogInstancesGuild
	if shared.InstanceID.Valid {
		inst, err = db.PublicInstance(ctx, shared.InstanceID.UUID)
	} else if shared.InstanceSlug != "" {
		inst, err = db.PublicInstanceBySlug(ctx, pgtype.Text{String: shared.InstanceSlug, Valid: true})
	} else {
		return nil
	}
	if err != nil {
		return nil
	}

	return s.buildInstanceOG(ctx, r, host, inst, shared.Payload)
}

// buildInstanceOG builds an instance page's OG data. sharePayload is the
// /s/{code} share payload, nil for the instance page itself: when its view
// selects one player and one boss kill, the image is the parse card.
func (s *Service) buildInstanceOG(ctx context.Context, r *http.Request, host string, inst database.LogInstancesGuild, sharePayload []byte) *frontend.OGData {
	db := s.store

	encounters, _ := db.EncountersByInstanceID(ctx, inst.ID)
	players, playersErr := db.InstancePlayersByInstanceID(ctx, inst.ID)

	var startDate time.Time
	var endDate time.Time
	var combatDuration time.Duration
	for _, e := range encounters {
		if e.StartTime.Valid && e.EndTime.Valid {
			combatDuration += e.EndTime.Time.Sub(e.StartTime.Time)
		}
		if e.StartTime.Valid && (startDate.IsZero() || e.StartTime.Time.Before(startDate)) {
			startDate = e.StartTime.Time
		}
		if e.EndTime.Valid && (endDate.IsZero() || e.EndTime.Time.After(endDate)) {
			endDate = e.EndTime.Time
		}
	}

	dur := endDate.Sub(startDate)
	hours := int(dur.Hours())
	minutes := int(dur.Minutes()) % 60

	var title strings.Builder
	if inst.GuildName.String != "" {
		fmt.Fprintf(&title, "%s — ", inst.GuildName.String)
	}
	title.WriteString(inst.Name)

	var desc strings.Builder
	sep := " · "
	desc.WriteString(startDate.Format("Jan 2, 2006"))
	desc.WriteString(sep)

	fmt.Fprintf(&desc, "%dh %dm", hours, minutes)
	desc.WriteString(sep)

	fmt.Fprintf(&desc, "%d players", len(players))
	desc.WriteString("\n")
	desc.WriteString("Raid performance and contribution analysis tool by Chronicle.")

	identifier := inst.ID.String()
	if inst.HashedSlug.Valid && inst.HashedSlug.String != "" {
		identifier = inst.HashedSlug.String
	}

	if inst.TenantSlug.Valid && inst.TenantSlug.String != "" && s.tenant != nil && s.tenant.PrimaryDomain() != "" {
		host = inst.TenantSlug.String + "." + s.tenant.PrimaryDomain()
	}

	og := &frontend.OGData{
		Title:       title.String(),
		Description: desc.String(),
		URL:         fmt.Sprintf("https://%s/instances/%s", host, identifier),
		ImageURL:    instanceOGImageURL(host, inst.Name),
	}
	if s.ogServiceConfigured() {
		base := raidCard{
			Host:     host,
			Guild:    inst.GuildName.String,
			Raid:     inst.Name,
			Date:     startDate,
			Duration: dur,
		}
		if playersErr == nil {
			n := len(players)
			base.Players = &n
			base.Comp = raidComposition(players)
		}
		if imageURL := s.instanceCardURL(r, inst, encounters, base, sharePayload); imageURL != "" {
			og.ImageURL = imageURL
		}
	}
	return og
}

// instanceCardURL returns the signed boss share card URL when sharePayload
// selects one boss kill (selected players are ignored) and the kill has a
// ranked top DPS or HPS, else the raid report card's. Both cards' lookups
// share one raidCardTimeout budget, so a boss share card that falls back
// can't double the wait.
func (s *Service) instanceCardURL(r *http.Request, inst database.LogInstancesGuild, encounters []database.LogInstanceEncounter, base raidCard, sharePayload []byte) string {
	loadReq := r
	if sharePayload != nil {
		if enc, ok := shareBossSelection(sharePayload, encounters); ok {
			ctx, cancel := context.WithTimeout(r.Context(), raidCardTimeout)
			defer cancel()
			loadReq = r.WithContext(ctx)
			card, ok := s.loadBossShareCard(loadReq, inst, enc, bossShareCard{
				Host:  base.Host,
				Raid:  base.Raid,
				Guild: base.Guild,
			})
			if ok {
				return s.ogImageURL(r, "parse", bossShareCardParams(card))
			}
		}
	}
	// The raid card and the clear card load in parallel on loadReq, so after
	// a parse card fallback both stay inside the same deadline. The clear
	// card wins when the run is a qualified speedrun with a 90+ time-parse.
	var (
		wg             sync.WaitGroup
		card           raidCard
		speedrun       clearCard
		killTimeParses []int
		killTimeAvg    *int
		isClear        bool
	)
	wg.Go(func() { card = s.loadRaidCard(loadReq, inst, encounters, base) })
	wg.Go(func() { speedrun, isClear = s.loadClearCard(loadReq, inst, encounters) })
	wg.Go(func() { killTimeParses, killTimeAvg = s.loadRaidKillTimeParses(loadReq, inst, encounters) })
	wg.Wait()
	card.KillTimeParses = killTimeParses
	card.KillTimeAvg = killTimeAvg
	if isClear {
		return s.ogImageURL(r, "clear", clearCardParams(card, speedrun))
	}
	return s.ogImageURL(r, "raid", raidCardParams(card))
}

func instanceOGImageURL(host, instanceName string) string {
	imagePath, ok := frontend.InstanceOGImage(instanceName)
	if !ok {
		return ""
	}
	return fmt.Sprintf("https://%s%s", host, imagePath)
}

func (s *Service) armoryOG(r *http.Request, realm, player string) *frontend.OGData {
	// The request context carries the tenant, which scopes the lookups.
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()
	host := ogHost(r)

	db := s.store

	realmID, err := uuid.Parse(realm)
	if err != nil {
		r, dbErr := s.store.GetWoWServerRealmByName(ctx, realm)
		if dbErr != nil {
			return nil
		}
		realmID = r.ID
	}

	identifier := parseArmoryPlayerGUID(player)

	p, err := db.GetGamePlayerByGUID(ctx, database.GetGamePlayerByGUIDParams{
		RealmID:    realmID,
		Identifier: identifier,
		Name:       player,
	})
	if err != nil {
		return nil
	}

	var title strings.Builder
	fmt.Fprintf(&title, "%s — Character", p.Name)

	var desc strings.Builder
	guild := ""
	if p.GuildName.String != "" {
		guild = fmt.Sprintf(" <%s>", p.GuildName.String)
	}

	race := string(db2sdk.HeroRace(p.Race))
	switch p.Race {
	case database.WowPlayableRaceScourge:
		race = "Undead"
	case database.WowPlayableRaceBloodElf:
		race = "Blood Elf"
	case database.WowPlayableRaceNightElf:
		race = "Night Elf"
	}

	class := string(db2sdk.HeroClass(p.Class))
	class = strings.ToLower(class)
	class = strings.ToUpper(string(class[0])) + class[1:]

	level := ""
	if p.Level > 0 {
		level = fmt.Sprintf("%d ", p.Level)
	}
	fmt.Fprintf(&desc, "%s%s — %s%s %s",
		p.Name, guild,
		level, race, class,
	)

	og := &frontend.OGData{
		Title:       title.String(),
		Description: desc.String(),
		URL:         fmt.Sprintf("https://%s/armory/%s/%s", host, realm, p.ID),
	}
	// Skip the stat lookups when there's no OG service to draw the card.
	if s.imageBaseURL != nil && s.signingKey != "" {
		params := characterCardParams(p, race, class, s.fetchCharacterCardStats(ctx, p))
		if u := s.ogImageURL(r, "character", params); u != "" {
			og.ImageURL = u
		}
	}
	return og
}

func resolveInstance(ctx context.Context, db *authz.Authz, idOrSlug string) (database.LogInstancesGuild, error) {
	id, err := uuid.Parse(idOrSlug)
	if err == nil {
		return db.PublicInstance(ctx, id)
	}
	return db.PublicInstanceBySlug(ctx, pgtype.Text{String: idOrSlug, Valid: true})
}
