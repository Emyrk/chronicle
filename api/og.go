package api

import (
	"context"
	"fmt"
	"net/http"
	"strings"
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

// OGRoutes returns the Open Graph route definitions for the frontend handler.
func (api *API) OGRoutes() []frontend.OGRoute {
	return []frontend.OGRoute{
		{
			Pattern: "/instances/{idOrSlug}",
			Resolve: func(r *http.Request) *frontend.OGData {
				return api.instanceOG(chi.URLParam(r, "idOrSlug"))
			},
		},
		{
			Pattern: "/s/{code}",
			Resolve: func(r *http.Request) *frontend.OGData {
				return api.shareOG(chi.URLParam(r, "code"))
			},
		},
		{
			Pattern: "/armory/{realm}/{player}",
			Resolve: func(r *http.Request) *frontend.OGData {
				return api.armoryOG(chi.URLParam(r, "realm"), chi.URLParam(r, "player"))
			},
		},
		{
			Pattern: "/talents",
			Resolve: func(r *http.Request) *frontend.OGData {
				return talentCalculatorOG(ogHost(r), "", "")
			},
		},
		{
			Pattern: "/talents/{class}",
			Resolve: func(r *http.Request) *frontend.OGData {
				return talentCalculatorOG(ogHost(r), chi.URLParam(r, "class"), r.URL.Query().Get("build"))
			},
		},
	}
}

// talentClassSlugs maps calculator URL slugs to display and wowspec names.
var talentClassSlugs = map[string]struct {
	Display string
	Spec    string // wowspec.InferSpec class key
}{
	"warrior":      {"Warrior", "WARRIOR"},
	"paladin":      {"Paladin", "PALADIN"},
	"hunter":       {"Hunter", "HUNTER"},
	"rogue":        {"Rogue", "ROGUE"},
	"priest":       {"Priest", "PRIEST"},
	"shaman":       {"Shaman", "SHAMAN"},
	"mage":         {"Mage", "MAGE"},
	"warlock":      {"Warlock", "WARLOCK"},
	"druid":        {"Druid", "DRUID"},
	"deathknight":  {"Death Knight", "DEATH_KNIGHT"},
	"pet-ferocity": {"Ferocity Hunter Pet", ""},
	"pet-tenacity": {"Tenacity Hunter Pet", ""},
	"pet-cunning":  {"Cunning Hunter Pet", ""},
}

var talentPetSlugs = map[string]struct{}{
	"pet-ferocity": {},
	"pet-tenacity": {},
	"pet-cunning":  {},
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

// talentCalculatorOG builds Open Graph metadata for talent calculator links.
// classSlug and build may be empty ("/talents" landing page).
func talentCalculatorOG(host, classSlug, build string) *frontend.OGData {
	cls, ok := talentClassSlugs[strings.ToLower(classSlug)]
	if !ok {
		return &frontend.OGData{
			Title:       "Talent Calculator",
			Description: "Plan, share, and compare class and hunter pet talent builds.",
			URL:         fmt.Sprintf("https://%s/talents", host),
		}
	}
	build = sanitizeBuildParam(build)

	classURL := fmt.Sprintf("https://%s/talents/%s", host, strings.ToLower(classSlug))
	if build == "" {
		return &frontend.OGData{
			Title:       fmt.Sprintf("%s Talent Calculator", cls.Display),
			Description: fmt.Sprintf("Plan and share %s talent builds.", cls.Display),
			URL:         classURL,
		}
	}

	summary, total := talentBuildSummary(build)
	if _, isPet := talentPetSlugs[strings.ToLower(classSlug)]; isPet {
		return &frontend.OGData{
			Title:       fmt.Sprintf("%s (%d points)", cls.Display, total),
			Description: fmt.Sprintf("A %d-point %s talent build. Open it in the talent calculator.", total, cls.Display),
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
		Description: fmt.Sprintf("A %d-point %s talent build. Open it in the talent calculator.", total, cls.Display),
		URL:         fmt.Sprintf("%s?build=%s", classURL, build),
	}
}

func (api *API) instanceOG(idOrSlug string) *frontend.OGData {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	inst, err := resolveInstance(ctx, api.Opts.Zed, idOrSlug)
	if err != nil {
		return nil
	}

	return api.buildInstanceOG(ctx, inst)
}

func (api *API) shareOG(code string) *frontend.OGData {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	db := api.Opts.Zed
	shared, err := db.GetSharedViewByCode(ctx, code)
	if err != nil {
		return nil
	}

	// Resolve instance: try by ID first, fall back to slug if ID was nulled (reparse).
	var inst database.LogInstancesGuild
	if shared.InstanceID.Valid {
		inst, err = db.Instance(ctx, shared.InstanceID.UUID)
	} else if shared.InstanceSlug != "" {
		inst, err = db.InstanceBySlug(ctx, pgtype.Text{String: shared.InstanceSlug, Valid: true})
	} else {
		return nil
	}
	if err != nil {
		return nil
	}

	return api.buildInstanceOG(ctx, inst)
}

func (api *API) buildInstanceOG(ctx context.Context, inst database.LogInstancesGuild) *frontend.OGData {
	db := api.Opts.Zed

	encounters, _ := db.EncountersByInstanceID(ctx, inst.ID)
	players, _ := db.InstancePlayersByInstanceID(ctx, inst.ID)

	bossKills := 0
	var startDate time.Time
	var endDate time.Time
	var combatDuration time.Duration
	for _, e := range encounters {
		if e.Boss && (e.KillType == database.KillTypeClean || e.KillType == database.KillTypePartial) {
			bossKills++
		}
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
		title.WriteString(fmt.Sprintf("%s — ", inst.GuildName.String))
	}
	title.WriteString(inst.Name)
	title.WriteString(" on [" + inst.RealmName + "]")

	var desc strings.Builder
	sep := " · "
	desc.WriteString(startDate.Format("Jan 2, 2006"))
	desc.WriteString(sep)

	desc.WriteString(fmt.Sprintf("%dh %dm", hours, minutes))
	desc.WriteString(sep)

	desc.WriteString(fmt.Sprintf("%d players", len(players)))
	desc.WriteString("\n")
	desc.WriteString("Raid performance and contribution analysis tool by Chronicle.")

	identifier := inst.ID.String()
	if inst.HashedSlug.Valid && inst.HashedSlug.String != "" {
		identifier = inst.HashedSlug.String
	}

	return &frontend.OGData{
		Title:       title.String(),
		Description: desc.String(),
		URL:         fmt.Sprintf("https://chronicleclassic.com/instances/%s", identifier),
	}
}

func (api *API) armoryOG(realm, player string) *frontend.OGData {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	db := api.Opts.Zed

	realmID, err := uuid.Parse(realm)
	if err != nil {
		r, dbErr := api.Opts.Zed.GetWoWServerRealmByName(ctx, realm)
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
	title.WriteString(fmt.Sprintf("%s — Character", p.Name))

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

	desc.WriteString(fmt.Sprintf("%s%s (%s) — %d %s %s",
		p.Name, guild, p.RealmName,
		60, race, class,
	))

	return &frontend.OGData{
		Title:       title.String(),
		Description: desc.String(),
		URL:         fmt.Sprintf("https://chronicleclassic.com/armory/%s/%s", realm, p.ID),
	}
}

func resolveInstance(ctx context.Context, db *authz.Authz, idOrSlug string) (database.LogInstancesGuild, error) {
	id, err := uuid.Parse(idOrSlug)
	if err == nil {
		return db.Instance(ctx, id)
	}
	return db.InstanceBySlug(ctx, pgtype.Text{String: idOrSlug, Valid: true})
}
