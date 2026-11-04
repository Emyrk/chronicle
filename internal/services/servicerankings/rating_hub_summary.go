package servicerankings

import (
	"database/sql"
	"errors"
	"net/http"
	"strconv"
	"strings"

	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/api/db2sdk"
	"github.com/Emyrk/chronicle/api/httpapi"
	types "github.com/Emyrk/chronicle/combatlog/parser/types"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/internal/services/servicetenant"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

type hubLandingCohort struct {
	instance, difficulty string
	size                 int16
}

// V1 rankings use exact cohorts even when max_players is zero, and their
// empty encounter selection means a complete-run DPS board, not a boss board.
// bosses is the instance's preset; without it the board would rank every encounter, Trash included.
func hubLandingPerformanceParams(cohort chroniclesdk.RankingsInstanceSummary, realmNames, bosses []string) database.RankingsLeaderboardParams {
	return database.RankingsLeaderboardParams{
		InstanceNames: []string{cohort.InstanceName}, EncounterNames: bosses, DifficultyNames: []string{cohort.DifficultyName},
		FilterMaxPlayers: cohort.MaxPlayers, ExactCohort: true, Metric: "dps", RealmNames: realmNames,
		QueryLimit: 3,
	}
}

func hubLandingStatisticsParams(cohort chroniclesdk.RankingsInstanceSummary, realmNames []string) database.RankingsBoxPlotStatsParams {
	return database.RankingsBoxPlotStatsParams{
		InstanceNames: []string{cohort.InstanceName}, DifficultyNames: []string{cohort.DifficultyName},
		FilterMaxPlayers: cohort.MaxPlayers, ExactCohort: true, Metric: "dps", RealmNames: realmNames,
	}
}

const (
	// The overview's guild Best Performances card lists eight runs; the podium shows three of them.
	hubOverviewSpeedrunLimit = 8
	// The overview's Best Performances card lists eight players.
	hubOverviewPerformanceLimit = 8
)

// hubResolveCohort picks the exact raid cohort for an instance overview: the
// requested one when published, otherwise the cohort with the most kills, so a
// first visit shows the main population instead of asking for a choice.
func hubResolveCohort(instances []chroniclesdk.RankingsInstanceSummary, instance, difficulty string, size int16, requested bool) (chroniclesdk.HubSelectedCohort, bool) {
	var best *chroniclesdk.RankingsInstanceSummary
	for i := range instances {
		v := &instances[i]
		if v.InstanceName != instance || v.Category != "raid" {
			continue
		}
		if requested && v.DifficultyName == difficulty && v.MaxPlayers == size {
			return chroniclesdk.HubSelectedCohort{DifficultyName: v.DifficultyName, MaxPlayers: v.MaxPlayers}, true
		}
		if best == nil || v.TotalKills > best.TotalKills {
			best = v
		}
	}
	if best == nil {
		return chroniclesdk.HubSelectedCohort{}, false
	}
	return chroniclesdk.HubSelectedCohort{DifficultyName: best.DifficultyName, MaxPlayers: best.MaxPlayers}, true
}

// hubPeakRaw is the published throughput behind a Peak score; zero means unknown.
func hubPeakRaw(v float64) *float64 {
	if v <= 0 {
		return nil
	}
	return &v
}

// hubPresetBosses is the instance's default boss selection, as /leaderboards
// shows it: the default ranking encounter set, else the progression bosses.
func hubPresetBosses(sets []chroniclesdk.RankingEncounterSet, progression []string) []string {
	var preset []string
	for _, set := range sets {
		if set.ID == "" {
			preset = set.Encounters
			break
		}
	}
	if preset == nil && len(sets) > 0 {
		preset = sets[0].Encounters
	}
	if len(preset) == 0 {
		preset = progression
	}
	out := make([]string, 0, len(preset))
	for _, name := range preset {
		if name != "Trash" {
			out = append(out, name)
		}
	}
	return out
}

// hubRaidDepth is the raid board's length: ten on the Ratings tab (boss_depth 3), else five.
func hubRaidDepth(bossDepth int32) int32 {
	if bossDepth >= 3 {
		return 10
	}
	return 5
}

// hubFillCategories gives every cohort of an instance the instance's category.
// A cohort's category comes from its latest categorized log, so a cohort whose
// logs were never categorized (seen: Naxxramas 10 next to a raid Naxxramas 25)
// would otherwise drop out of the raid grid and the cohort picker.
func hubFillCategories(instances []chroniclesdk.RankingsInstanceSummary) {
	categories := map[string]string{}
	for _, v := range instances {
		if v.Category != "" && (categories[v.InstanceName] == "" || v.Category == "raid") {
			categories[v.InstanceName] = v.Category
		}
	}
	for i := range instances {
		if instances[i].Category == "" {
			instances[i].Category = categories[instances[i].InstanceName]
		}
	}
}

// hubClassFilter is the DB class for a class filter, or "" for every class.
// HeroClassToDB maps an empty class to UNKNOWN, which would match no player.
func hubClassFilter(class string) string {
	if class == "" {
		return ""
	}
	return string(db2sdk.HeroClassToDB(types.HeroClasses(class)))
}

type hubSummaryInput struct {
	instance, featured, difficulty, metric, class, spec, subSpec, tab string
	// set is two or more chosen bosses; ratings and performances span them.
	set []string
	// window and renownWindow pick the rating windows (180 days, or all time).
	window, renownWindow string
	// bossDepth is how many leaders each boss board returns (1, or 3 for the Ratings tab).
	bossDepth int32
	size      int16
	exact     bool
	realmIDs  []uuid.UUID
}

func parseHubSummaryInput(r *http.Request) (hubSummaryInput, error) {
	q := r.URL.Query()
	for key, values := range q {
		switch key {
		case "instance_name", "encounter_name", "encounter_names", "window", "boss_depth", "difficulty_name", "max_players", "performance_metric", "class", "spec", "sub_spec", "realm_ids", "tab":
		default:
			return hubSummaryInput{}, errors.New("unknown parameter: " + key)
		}
		if len(values) != 1 {
			return hubSummaryInput{}, errors.New(key + " must appear once")
		}
	}
	in := hubSummaryInput{instance: q.Get("instance_name"), featured: q.Get("encounter_name"), difficulty: q.Get("difficulty_name"), metric: q.Get("performance_metric"), class: q.Get("class"), spec: q.Get("spec"), subSpec: q.Get("sub_spec"), tab: q.Get("tab")}
	if q.Has("encounter_names") {
		if q.Has("encounter_name") {
			return in, errors.New("encounter_name and encounter_names are exclusive")
		}
		seen := map[string]bool{}
		for _, name := range strings.Split(q.Get("encounter_names"), ",") {
			name = strings.TrimSpace(name)
			if name == "" || seen[name] {
				continue
			}
			seen[name] = true
			in.set = append(in.set, name)
		}
		if len(in.set) < 2 || len(in.set) > 64 {
			return in, errors.New("encounter_names must list 2 to 64 bosses")
		}
	}
	switch q.Get("window") {
	case "", "period":
		in.window, in.renownWindow = "period", "period"
	case "all":
		in.window, in.renownWindow = "all_time", "career"
	default:
		return in, errors.New("window must be period or all")
	}
	switch q.Get("boss_depth") {
	case "", "1":
		in.bossDepth = 1
	case "3":
		in.bossDepth = 3
	default:
		return in, errors.New("boss_depth must be 1 or 3")
	}
	if in.instance == "" && (q.Has("encounter_name") || q.Has("encounter_names") || q.Has("window") || q.Has("boss_depth") || q.Has("difficulty_name") || q.Has("max_players") || q.Has("class") || q.Has("spec") || q.Has("sub_spec") || q.Has("performance_metric")) {
		return in, errors.New("instance_name is required for selected overview filters")
	}
	if in.tab == "" {
		in.tab = "overview"
	}
	switch in.tab {
	case "overview", "ratings", "performances", "speedruns", "statistics", "parsing", "rulesets":
	default:
		return in, errors.New("invalid tab")
	}
	if in.instance != "" && q.Has("tab") {
		return in, errors.New("tab is only supported for the all-instances landing")
	}
	if q.Has("difficulty_name") != q.Has("max_players") {
		return in, errors.New("difficulty_name and max_players must be supplied together")
	}
	if q.Has("max_players") {
		size, err := strconv.ParseInt(q.Get("max_players"), 10, 16)
		if err != nil || size < 0 {
			return in, errors.New("invalid max_players")
		}
		in.size = int16(size)
		in.exact = true
	}
	if in.metric == "" {
		in.metric = "dps"
	}
	if in.metric != "dps" && in.metric != "hps" {
		return in, errors.New("invalid performance_metric")
	}
	if in.featured != "" && strings.TrimSpace(in.featured) == "" {
		return in, errors.New("invalid encounter_name")
	}
	if q.Has("realm_ids") {
		if q.Get("realm_ids") == "" {
			return in, errors.New("invalid realm_ids")
		}
		if len(strings.Split(q.Get("realm_ids"), ",")) > 64 {
			return in, errors.New("too many realm_ids")
		}
		seen := map[uuid.UUID]bool{}
		for _, part := range strings.Split(q.Get("realm_ids"), ",") {
			id, err := uuid.Parse(strings.TrimSpace(part))
			if err != nil || id == uuid.Nil {
				return in, errors.New("invalid realm_ids")
			}
			if !seen[id] {
				in.realmIDs = append(in.realmIDs, id)
				seen[id] = true
			}
		}
	}
	return in, nil
}

func emptyHubBoard() chroniclesdk.HubRatingBoard {
	return chroniclesdk.HubRatingBoard{Player: chroniclesdk.HubPlayerRatings{Peak: []chroniclesdk.HubPlayerRatingEntry{}, RankedMastery: []chroniclesdk.HubPlayerRatingEntry{}, Renown: []chroniclesdk.HubPlayerRatingEntry{}}, Guild: chroniclesdk.HubGuildRatings{Peak: []chroniclesdk.HubGuildRatingEntry{}, RankedMastery: []chroniclesdk.HubGuildRatingEntry{}, Renown: []chroniclesdk.HubGuildRatingEntry{}}}
}

// handleHubSummary serves tenant-wide public metadata and bounded published previews.
func (s *Service) handleHubSummary(w http.ResponseWriter, r *http.Request) {
	in, err := parseHubSummaryInput(r)
	if err != nil {
		tenantRatingBad(w, r, err.Error())
		return
	}
	ctx := r.Context()
	tenant := servicetenant.TenantIDFromContext(ctx)
	out := chroniclesdk.HubSummary{Instances: []chroniclesdk.RankingsInstanceSummary{}, LandingPreviews: []chroniclesdk.HubLandingPreview{}, Realms: []chroniclesdk.HubRealm{}, Encounters: []chroniclesdk.RankingsEncounterSummary{}, Ratings: chroniclesdk.HubRatings{Raid: emptyHubBoard(), Bosses: []chroniclesdk.HubBossRating{}}, Performances: []chroniclesdk.RankingsEntry{}, Speedruns: []chroniclesdk.SpeedrunLeaderboardEntry{}}
	instances, err := s.store.HubSummaryInstances(ctx, tenant)
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}
	for _, v := range instances {
		players := chroniclesdk.TopPlayersFromJSON(v.TopPlayers)
		if players == nil {
			players = []chroniclesdk.RankingsInstanceTopPlayer{}
		}
		for i := range players {
			players[i].PlayerClass = normalizeClassName(players[i].PlayerClass)
		}
		out.Instances = append(out.Instances, chroniclesdk.RankingsInstanceSummary{InstanceName: v.InstanceName, DifficultyName: v.DifficultyName, MaxPlayers: v.MaxPlayers, Category: v.Category, TotalKills: v.TotalKills, TopPlayers: players})
	}
	hubFillCategories(out.Instances)
	realms, err := s.store.HubSummaryRealms(ctx, tenant)
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}
	for _, v := range realms {
		out.Realms = append(out.Realms, chroniclesdk.HubRealm{ID: v.ID, Name: v.Name})
	}
	// Resolve selected realm IDs from this tenant's public realm list. Never let
	// an unknown ID turn into an unfiltered speedrun or performance query.
	var realmNames []string
	if len(in.realmIDs) > 0 {
		realmNames = []string{}
		for _, id := range in.realmIDs {
			for _, realm := range out.Realms {
				if realm.ID == id {
					realmNames = append(realmNames, realm.Name)
					break
				}
			}
		}
	}
	if len(in.realmIDs) > 0 && len(realmNames) != len(in.realmIDs) {
		tenantRatingBad(w, r, "realm_ids must belong to this tenant")
		return
	}
	if in.instance == "" {
		// Return only the board needed for this tab. All-realm performance
		// leaders are already maintained in the instance summary; a filtered
		// realm or the statistics tab uses the corresponding v1 query.
		byCohort := make(map[hubLandingCohort]int, len(out.Instances))
		for _, summary := range out.Instances {
			key := hubLandingCohort{summary.InstanceName, summary.DifficultyName, summary.MaxPlayers}
			byCohort[key] = len(out.LandingPreviews)
			board := emptyHubBoard()
			out.LandingPreviews = append(out.LandingPreviews, chroniclesdk.HubLandingPreview{
				InstanceName: summary.InstanceName, DifficultyName: summary.DifficultyName, MaxPlayers: summary.MaxPlayers,
				Player: board.Player, Guild: board.Guild, Performances: []chroniclesdk.RankingsEntry{},
				Statistics: []chroniclesdk.RankingsBoxPlotStats{}, Speedruns: []chroniclesdk.SpeedrunLeaderboardEntry{},
			})
		}
		evolving, modeErr := ratingEvolvingReader(ctx, s.store, tenant)
		if modeErr != nil {
			httpapi.InternalServerError(w, modeErr)
			return
		}
		generation, genErr := s.store.GetActiveTenantRatingGeneration(ctx, tenant)
		if genErr != nil && !errors.Is(genErr, pgx.ErrNoRows) && !errors.Is(genErr, sql.ErrNoRows) {
			httpapi.InternalServerError(w, genErr)
			return
		}
		if evolving {
			generation = uuid.Nil
		}
		if (in.tab == "overview" || in.tab == "ratings") && (evolving || (genErr == nil && generation != uuid.Nil)) {
			params := database.HubLandingRatingRowsParams{TenantID: tenant, GenerationID: generation, RealmIds: in.realmIDs}
			var rows []database.HubLandingRatingRowsRow
			var e error
			if evolving {
				var selected []database.EvolvingHubLandingRatingRowsRow
				selected, e = s.store.EvolvingHubLandingRatingRows(ctx, database.EvolvingHubLandingRatingRowsParams{TenantID: params.TenantID, GenerationID: params.GenerationID, RealmIds: params.RealmIds})
				for _, row := range selected {
					rows = append(rows, database.HubLandingRatingRowsRow(row))
				}
			} else {
				rows, e = s.store.HubLandingRatingRows(ctx, params)
			}
			if e != nil {
				httpapi.InternalServerError(w, e)
				return
			}
			if !evolving {
				out.GenerationID = &generation
			}
			for _, v := range rows {
				index, found := byCohort[hubLandingCohort{v.InstanceName, v.DifficultyName, v.MaxPlayers}]
				if !found {
					continue
				}
				preview := &out.LandingPreviews[index]
				if v.Subject == "guild" {
					id, e := uuid.Parse(v.SubjectID)
					if e != nil {
						httpapi.InternalServerError(w, e)
						return
					}
					preview.Guild.Renown = append(preview.Guild.Renown, chroniclesdk.HubGuildRatingEntry{
						RealmID: v.RealmID, RealmName: v.RealmName, GuildID: id, GuildName: v.SubjectName, Score: v.Score,
					})
					continue
				}
				entry := chroniclesdk.HubPlayerRatingEntry{
					RealmID: v.RealmID, RealmName: v.RealmName, PlayerGUID: v.SubjectID, PlayerName: v.SubjectName,
					PlayerClass: normalizeClassName(v.PlayerClass), PlayerSpec: v.PlayerSpec, PlayerSubSpec: v.PlayerSubSpec, Score: v.Score,
					PeakRaw: hubPeakRaw(v.PeakRaw),
				}
				switch v.RatingMetric {
				case "peak":
					preview.Player.Peak = append(preview.Player.Peak, entry)
				case "ranked_mastery":
					preview.Player.RankedMastery = append(preview.Player.RankedMastery, entry)
				case "renown":
					preview.Player.Renown = append(preview.Player.Renown, entry)
				}
			}
		}
		if in.tab == "overview" || in.tab == "speedruns" {
			runs, e := s.store.HubLandingSpeedruns(ctx, database.HubLandingSpeedrunsParams{TenantID: tenant, RealmIds: in.realmIDs})
			if e != nil {
				httpapi.InternalServerError(w, e)
				return
			}
			for _, v := range runs {
				index, found := byCohort[hubLandingCohort{v.InstanceName, v.DifficultyName, v.MaxPlayers}]
				if !found {
					continue
				}
				preview := &out.LandingPreviews[index]
				entry := chroniclesdk.SpeedrunLeaderboardEntry{
					InstanceID: v.InstanceID, Slug: v.HashedSlug.String, DifficultyName: v.DifficultyName,
					DurationMs: v.DurationMs, GuildID: v.GuildID.UUID, GuildName: v.GuildName,
					RealmName: v.RealmName, StartTime: v.StartTime.Time, CompletionTime: v.CompletionTime.Time,
					PlayerCount: v.PlayerCount, GuildLogoURL: v.GuildLogoUrl,
					ParserVersion: v.ParserVersion, AddonVersion: v.AddonVersion,
				}
				if v.DuplicateGroupID.Valid {
					entry.DuplicateGroupID = &v.DuplicateGroupID.UUID
				}
				preview.Speedruns = append(preview.Speedruns, entry)
			}
		}
		statisticsShown := map[string]bool{}
		// Each instance's preset bosses, for realm-filtered performance boards.
		presets := map[string][]string{}
		if len(in.realmIDs) > 0 && (in.tab == "overview" || in.tab == "performances") {
			for _, detail := range s.registryForRequest(ctx).AllInstanceDetails() {
				sets := make([]chroniclesdk.RankingEncounterSet, 0, len(detail.RankingEncounterSets))
				for _, set := range detail.RankingEncounterSets {
					sets = append(sets, chroniclesdk.RankingEncounterSet{ID: set.ID, Label: set.Label, Encounters: set.Encounters})
				}
				presets[detail.Name] = hubPresetBosses(sets, detail.ProgressionBosses)
			}
		}
		for i, cohort := range out.Instances {
			if in.tab == "overview" || in.tab == "performances" {
				// The maintained instance summary already stores the top three
				// complete-run DPS players. Only a realm-filtered board needs the
				// v1 query to find its own top three rather than filter global top three.
				if len(in.realmIDs) == 0 {
					for _, player := range cohort.TopPlayers {
						out.LandingPreviews[i].Performances = append(out.LandingPreviews[i].Performances, chroniclesdk.RankingsEntry{
							InstanceName: cohort.InstanceName, PlayerGUID: player.PlayerGUID,
							PlayerName: player.PlayerName, PlayerClass: player.PlayerClass,
							RealmName: player.RealmName, DPS: player.DPS,
						})
					}
				} else {
					performances, e := s.store.RankingsLeaderboardNoJIT(ctx, hubLandingPerformanceParams(cohort, realmNames, presets[cohort.InstanceName]))
					if e != nil {
						httpapi.InternalServerError(w, e)
						return
					}
					for _, v := range performances {
						entry := chroniclesdk.RankingsEntry{
							InstanceName: v.InstanceName, EncounterName: v.EncounterName, PlayerGUID: v.PlayerGuid,
							PlayerName: v.PlayerName, PlayerClass: normalizeClassName(v.PlayerClass), PlayerSpec: v.PlayerSpec,
							PlayerRole: v.PlayerRole, PlayerLevel: v.PlayerLevel, DifficultyName: v.DifficultyName,
							MaxPlayers: v.MaxPlayers, RealmID: v.RealmID, RealmName: v.RealmName,
							GuildName: v.GuildName, GuildID: v.GuildID, DamageDone: v.DamageDone,
							HealingDone: v.HealingDone, AbsorbedDone: v.AbsorbedDone, DurationSecs: v.DurationSecs,
							DPS: v.Dps, HPS: v.Hps, LogHashedSlug: v.LogHashedSlug, KilledAt: v.KilledAt.Time,
						}
						if v.PlayerSubSpec != "" {
							entry.SubSpec = &v.PlayerSubSpec
						}
						if v.TalentLayout != "" {
							entry.TalentLayout = &v.TalentLayout
						}
						out.LandingPreviews[i].Performances = append(out.LandingPreviews[i].Performances, entry)
					}
				}
			}
			if in.tab != "statistics" || statisticsShown[cohort.InstanceName] {
				continue
			}
			stats, e := s.store.RankingsBoxPlotStatsNoJIT(ctx, hubLandingStatisticsParams(cohort, realmNames))
			if e != nil {
				httpapi.InternalServerError(w, e)
				return
			}
			for _, v := range stats {
				if len(out.LandingPreviews[i].Statistics) == 3 {
					break
				}
				out.LandingPreviews[i].Statistics = append(out.LandingPreviews[i].Statistics, chroniclesdk.RankingsBoxPlotStats{
					PlayerClass: normalizeClassName(v.PlayerClass), PlayerSpec: v.PlayerSpec,
					PlayerSubSpec: v.PlayerSubSpec, MinDPS: v.MinDps, Q1DPS: v.Q1Dps,
					MedianDPS: v.MedianDps, Q3DPS: v.Q3Dps, MaxDPS: v.MaxDps, Count: v.Count,
				})
			}
			statisticsShown[cohort.InstanceName] = len(out.LandingPreviews[i].Statistics) > 0
		}
		httpapi.Write(ctx, w, http.StatusOK, out)
		return
	}
	known := false
	for _, v := range out.Instances {
		known = known || v.InstanceName == in.instance
	}
	if !known {
		httpapi.Write(ctx, w, http.StatusOK, out)
		return
	}
	// A stale or missing URL cohort must not silently broaden to another population:
	// resolve it to one exact published cohort instead.
	if cohort, ok := hubResolveCohort(out.Instances, in.instance, in.difficulty, in.size, in.exact); ok {
		in.difficulty, in.size, in.exact = cohort.DifficultyName, cohort.MaxPlayers, true
	} else {
		in.exact = false
	}
	if in.exact {
		out.SelectedCohort = &chroniclesdk.HubSelectedCohort{DifficultyName: in.difficulty, MaxPlayers: in.size}
	}
	out.ProgressionBosses = []string{}
	out.RankingEncounterSets = []chroniclesdk.RankingEncounterSet{}
	for _, detail := range s.registryForRequest(ctx).AllInstanceDetails() {
		if detail.Name != in.instance {
			continue
		}
		out.ProgressionBosses = append(out.ProgressionBosses, detail.ProgressionBosses...)
		for _, set := range detail.RankingEncounterSets {
			out.RankingEncounterSets = append(out.RankingEncounterSets, chroniclesdk.RankingEncounterSet{ID: set.ID, Label: set.Label, Encounters: set.Encounters})
		}
		break
	}
	// No chosen bosses means the instance's preset, as the encounter sidebar shows it.
	if in.featured == "" && len(in.set) == 0 {
		in.set = hubPresetBosses(out.RankingEncounterSets, out.ProgressionBosses)
	}
	filters, err := s.store.HubSummaryFilters(ctx, database.HubSummaryFiltersParams{TenantID: tenant, InstanceName: in.instance})
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}
	out.Filters = []chroniclesdk.RankingsFilterClass{}
	classIndex := map[string]int{}
	specIndex := map[string]map[string]int{}
	for _, row := range filters {
		class := normalizeClassName(row.PlayerClass)
		ci, exists := classIndex[class]
		if !exists {
			ci = len(out.Filters)
			classIndex[class] = ci
			specIndex[class] = map[string]int{}
			out.Filters = append(out.Filters, chroniclesdk.RankingsFilterClass{PlayerClass: class, Specs: []chroniclesdk.RankingsFilterSpec{}})
		}
		si, exists := specIndex[class][row.PlayerSpec]
		if !exists {
			si = len(out.Filters[ci].Specs)
			specIndex[class][row.PlayerSpec] = si
			out.Filters[ci].Specs = append(out.Filters[ci].Specs, chroniclesdk.RankingsFilterSpec{Spec: row.PlayerSpec, SubSpecs: []string{}})
		}
		if row.PlayerSubSpec != "" {
			out.Filters[ci].Specs[si].SubSpecs = append(out.Filters[ci].Specs[si].SubSpecs, row.PlayerSubSpec)
		}
	}
	encounters, err := s.store.HubSummaryEncounters(ctx, database.HubSummaryEncountersParams{TenantID: tenant, InstanceName: in.instance})
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}
	for _, v := range encounters {
		out.Encounters = append(out.Encounters, chroniclesdk.RankingsEncounterSummary{EncounterName: v.EncounterName, TotalKills: v.TotalKills, TopDPS: v.TopDps})
	}
	if in.featured != "" {
		found := false
		for _, v := range out.Encounters {
			if v.EncounterName == in.featured {
				found = true
				break
			}
		}
		if !found {
			in.featured = "" // A stale deep link falls back to the full-clear overview.
		}
	}
	evolving, modeErr := ratingEvolvingReader(ctx, s.store, tenant)
	if modeErr != nil {
		httpapi.InternalServerError(w, modeErr)
		return
	}
	generation, genErr := s.store.GetActiveTenantRatingGeneration(ctx, tenant)
	if genErr != nil && !errors.Is(genErr, pgx.ErrNoRows) && !errors.Is(genErr, sql.ErrNoRows) {
		httpapi.InternalServerError(w, genErr)
		return
	}
	if evolving {
		generation = uuid.Nil
	}
	if evolving || (genErr == nil && generation != uuid.Nil) {
		params := database.HubSummaryRatingRowsParams{TenantID: tenant, GenerationID: generation, InstanceName: in.instance, FeaturedEncounter: in.featured, DifficultyName: in.difficulty, MaxPlayers: in.size, ExactCohort: in.exact, PerformanceMetric: in.metric, PlayerClass: hubClassFilter(in.class), PlayerSpec: in.spec, PlayerSubSpec: in.subSpec, RealmIds: in.realmIDs, WindowKind: in.window, RenownWindow: in.renownWindow, BossDepth: in.bossDepth}
		var rows []database.HubSummaryRatingRowsRow
		var e error
		if evolving {
			var selected []database.EvolvingHubSummaryRatingRowsRow
			selected, e = s.store.EvolvingHubSummaryRatingRows(ctx, database.EvolvingHubSummaryRatingRowsParams(params))
			for _, row := range selected {
				rows = append(rows, database.HubSummaryRatingRowsRow(row))
			}
		} else {
			rows, e = s.store.HubSummaryRatingRows(ctx, params)
		}
		if e != nil {
			httpapi.InternalServerError(w, e)
			return
		}
		if !evolving {
			out.GenerationID = &generation
		}
		byBoss := map[string]int{}
		for _, v := range rows {
			board := &out.Ratings.Raid
			if v.Board == "boss" {
				index, exists := byBoss[v.EncounterName]
				if !exists {
					index = len(out.Ratings.Bosses)
					byBoss[v.EncounterName] = index
					out.Ratings.Bosses = append(out.Ratings.Bosses, chroniclesdk.HubBossRating{EncounterName: v.EncounterName, HubRatingBoard: emptyHubBoard()})
				}
				board = &out.Ratings.Bosses[index].HubRatingBoard
			}
			if v.Subject == "guild" {
				id, e := uuid.Parse(v.SubjectID)
				if e != nil {
					httpapi.InternalServerError(w, e)
					return
				}
				entry := chroniclesdk.HubGuildRatingEntry{RealmID: v.RealmID, RealmName: v.RealmName, GuildID: id, GuildName: v.SubjectName, Score: v.Score}
				switch v.RatingMetric {
				case "peak":
					board.Guild.Peak = append(board.Guild.Peak, entry)
				case "ranked_mastery":
					board.Guild.RankedMastery = append(board.Guild.RankedMastery, entry)
				case "renown":
					board.Guild.Renown = append(board.Guild.Renown, entry)
				}
				continue
			}
			entry := chroniclesdk.HubPlayerRatingEntry{RealmID: v.RealmID, RealmName: v.RealmName, PlayerGUID: v.SubjectID, PlayerName: v.SubjectName, PlayerClass: normalizeClassName(v.PlayerClass), PlayerSpec: v.PlayerSpec, PlayerSubSpec: v.PlayerSubSpec, Score: v.Score, PeakRaw: hubPeakRaw(v.PeakRaw)}
			switch v.RatingMetric {
			case "peak":
				board.Player.Peak = append(board.Player.Peak, entry)
			case "ranked_mastery":
				board.Player.RankedMastery = append(board.Player.RankedMastery, entry)
			case "renown":
				board.Player.Renown = append(board.Player.Renown, entry)
			}
		}

	}
	if (evolving || (genErr == nil && generation != uuid.Nil)) && in.featured == "" && len(in.set) > 0 {
		params := database.HubSetRatingRowsParams{TenantID: tenant, GenerationID: generation, InstanceName: in.instance, EncounterNames: in.set, DifficultyName: in.difficulty, MaxPlayers: in.size, PerformanceMetric: in.metric, PlayerClass: hubClassFilter(in.class), PlayerSpec: in.spec, PlayerSubSpec: in.subSpec, RealmIds: in.realmIDs, WindowKind: in.window, RenownWindow: in.renownWindow, Depth: hubRaidDepth(in.bossDepth)}
		var rows []database.HubSetRatingRowsRow
		var e error
		if evolving {
			var selected []database.EvolvingHubSetRatingRowsRow
			selected, e = s.store.EvolvingHubSetRatingRows(ctx, database.EvolvingHubSetRatingRowsParams(params))
			for _, row := range selected {
				rows = append(rows, database.HubSetRatingRowsRow(row))
			}
		} else {
			rows, e = s.store.HubSetRatingRows(ctx, params)
		}
		if e != nil {
			httpapi.InternalServerError(w, e)
			return
		}
		board := emptyHubBoard()
		for _, v := range rows {
			// Peak and Mastery need an exact cohort; Renown is instance-wide.
			if v.RatingMetric != "renown" && !in.exact {
				continue
			}
			if v.Subject == "guild" {
				id, e := uuid.Parse(v.SubjectID)
				if e != nil {
					httpapi.InternalServerError(w, e)
					return
				}
				entry := chroniclesdk.HubGuildRatingEntry{RealmID: v.RealmID, RealmName: v.RealmName, GuildID: id, GuildName: v.SubjectName, Score: v.Score}
				switch v.RatingMetric {
				case "peak":
					board.Guild.Peak = append(board.Guild.Peak, entry)
				case "ranked_mastery":
					board.Guild.RankedMastery = append(board.Guild.RankedMastery, entry)
				case "renown":
					board.Guild.Renown = append(board.Guild.Renown, entry)
				}
				continue
			}
			entry := chroniclesdk.HubPlayerRatingEntry{RealmID: v.RealmID, RealmName: v.RealmName, PlayerGUID: v.SubjectID, PlayerName: v.SubjectName, PlayerClass: normalizeClassName(v.PlayerClass), PlayerSpec: v.PlayerSpec, PlayerSubSpec: v.PlayerSubSpec, Score: v.Score, PeakRaw: hubPeakRaw(v.PeakRaw)}
			switch v.RatingMetric {
			case "peak":
				board.Player.Peak = append(board.Player.Peak, entry)
			case "ranked_mastery":
				board.Player.RankedMastery = append(board.Player.RankedMastery, entry)
			case "renown":
				board.Player.Renown = append(board.Player.Renown, entry)
			}
		}
		out.Ratings.Raid = board
	}
	// The overview's podium shows full clears for the preset and any set of
	// bosses; set kill times live on the Speedruns tab.
	if in.exact && in.featured == "" {
		speed, e := s.store.SpeedrunLeaderboard(ctx, database.SpeedrunLeaderboardParams{InstanceName: in.instance, FilterDifficulty: true, DifficultyName: in.difficulty, FilterInstanceMaxPlayers: true, InstanceMaxPlayers: in.size, RealmNames: realmNames, ResultLimit: hubOverviewSpeedrunLimit})
		if e != nil {
			httpapi.InternalServerError(w, e)
			return
		}
		for _, v := range speed {
			out.Speedruns = append(out.Speedruns, db2sdk.SpeedrunLeaderboardEntry(v))
		}
	}
	if in.exact {
		// Rank across the chosen bosses, the preset's included. No list would rank
		// every encounter, Trash segments among them.
		encounters := in.set
		if in.featured != "" {
			encounters = []string{in.featured}
		}
		rows, e := s.store.RankingsLeaderboardNoJIT(ctx, database.RankingsLeaderboardParams{InstanceNames: []string{in.instance}, EncounterNames: encounters, DifficultyNames: []string{in.difficulty}, FilterMaxPlayers: in.size, ExactCohort: true, Class: hubClassFilter(in.class), Spec: in.spec, SubSpec: in.subSpec, Metric: in.metric, RealmNames: realmNames, QueryLimit: hubOverviewPerformanceLimit})
		if e != nil {
			httpapi.InternalServerError(w, e)
			return
		}
		for _, v := range rows {
			out.Performances = append(out.Performances, chroniclesdk.RankingsEntry{InstanceName: v.InstanceName, EncounterName: v.EncounterName, PlayerGUID: v.PlayerGuid, PlayerName: v.PlayerName, PlayerClass: normalizeClassName(v.PlayerClass), PlayerSpec: v.PlayerSpec, PlayerRole: v.PlayerRole, PlayerLevel: v.PlayerLevel, DifficultyName: v.DifficultyName, MaxPlayers: v.MaxPlayers, RealmID: v.RealmID, RealmName: v.RealmName, GuildName: v.GuildName, GuildID: v.GuildID, DamageDone: v.DamageDone, HealingDone: v.HealingDone, AbsorbedDone: v.AbsorbedDone, DurationSecs: v.DurationSecs, DPS: v.Dps, HPS: v.Hps, LogHashedSlug: v.LogHashedSlug, KilledAt: v.KilledAt.Time})
		}
	}
	httpapi.Write(ctx, w, http.StatusOK, out)
}
