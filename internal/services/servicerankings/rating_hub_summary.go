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
func hubLandingPerformanceParams(cohort chroniclesdk.RankingsInstanceSummary, realmNames []string) database.RankingsLeaderboardParams {
	return database.RankingsLeaderboardParams{
		InstanceNames: []string{cohort.InstanceName}, DifficultyNames: []string{cohort.DifficultyName},
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

type hubSummaryInput struct {
	instance, featured, difficulty, metric, class, spec, subSpec string
	size                                                         int16
	exact                                                        bool
	realmIDs                                                     []uuid.UUID
}

func parseHubSummaryInput(r *http.Request) (hubSummaryInput, error) {
	q := r.URL.Query()
	for key, values := range q {
		switch key {
		case "instance_name", "encounter_name", "difficulty_name", "max_players", "performance_metric", "class", "spec", "sub_spec", "realm_ids":
		default:
			return hubSummaryInput{}, errors.New("unknown parameter: " + key)
		}
		if len(values) != 1 {
			return hubSummaryInput{}, errors.New(key + " must appear once")
		}
	}
	in := hubSummaryInput{instance: q.Get("instance_name"), featured: q.Get("encounter_name"), difficulty: q.Get("difficulty_name"), metric: q.Get("performance_metric"), class: q.Get("class"), spec: q.Get("spec"), subSpec: q.Get("sub_spec")}
	if in.instance == "" && (q.Has("encounter_name") || q.Has("difficulty_name") || q.Has("max_players") || q.Has("class") || q.Has("spec") || q.Has("sub_spec") || q.Has("performance_metric")) {
		return in, errors.New("instance_name is required for selected overview filters")
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
		// Ratings and speedruns use bounded bulk queries. V1 performance and
		// statistics queries below run once per published cohort (at most 64
		// each); this trades database work for one cacheable HTTP response.
		// Instance top_players is aggregate DPS, not this performance board.
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
		generation, genErr := s.store.GetActiveTenantRatingGeneration(ctx, tenant)
		if genErr != nil && !errors.Is(genErr, pgx.ErrNoRows) && !errors.Is(genErr, sql.ErrNoRows) {
			httpapi.InternalServerError(w, genErr)
			return
		}
		if genErr == nil && generation != uuid.Nil {
			rows, e := s.store.HubLandingRatingRows(ctx, database.HubLandingRatingRowsParams{TenantID: tenant, GenerationID: generation, RealmIds: in.realmIDs})
			if e != nil {
				httpapi.InternalServerError(w, e)
				return
			}
			out.GenerationID = &generation
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
		for i, cohort := range out.Instances {
			// These are the existing v1 complete-run DPS boards. Reusing them
			// preserves duplicate handling, tenant RLS and spec aggregation.
			performances, e := s.store.RankingsLeaderboardNoJIT(ctx, hubLandingPerformanceParams(cohort, realmNames))
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
		}
		httpapi.Write(ctx, w, http.StatusOK, out)
		return
	}
	known := false
	cohorts := 0
	matchedCohort := false
	var soleCohort chroniclesdk.HubSelectedCohort
	for _, v := range out.Instances {
		if v.InstanceName != in.instance {
			continue
		}
		known = true
		if v.Category == "raid" {
			cohorts++
			soleCohort = chroniclesdk.HubSelectedCohort{DifficultyName: v.DifficultyName, MaxPlayers: v.MaxPlayers}
			matchedCohort = matchedCohort || (in.difficulty == v.DifficultyName && in.size == v.MaxPlayers)
		}
	}
	if !known {
		httpapi.Write(ctx, w, http.StatusOK, out)
		return
	}
	// A stale URL cohort must not silently broaden to another population.
	// A sole published cohort is unambiguous, even when its stored size is zero.
	in.exact = in.exact && matchedCohort
	if !in.exact && cohorts == 1 {
		in.difficulty, in.size, in.exact = soleCohort.DifficultyName, soleCohort.MaxPlayers, true
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
	generation, genErr := s.store.GetActiveTenantRatingGeneration(ctx, tenant)
	if genErr != nil && !errors.Is(genErr, pgx.ErrNoRows) && !errors.Is(genErr, sql.ErrNoRows) {
		httpapi.InternalServerError(w, genErr)
		return
	}
	if genErr == nil && generation != uuid.Nil {
		rows, e := s.store.HubSummaryRatingRows(ctx, database.HubSummaryRatingRowsParams{TenantID: tenant, GenerationID: generation, InstanceName: in.instance, FeaturedEncounter: in.featured, DifficultyName: in.difficulty, MaxPlayers: in.size, ExactCohort: in.exact, PerformanceMetric: in.metric, PlayerClass: string(db2sdk.HeroClassToDB(types.HeroClasses(in.class))), PlayerSpec: in.spec, PlayerSubSpec: in.subSpec, RealmIds: in.realmIDs})
		if e != nil {
			httpapi.InternalServerError(w, e)
			return
		}
		out.GenerationID = &generation
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
			entry := chroniclesdk.HubPlayerRatingEntry{RealmID: v.RealmID, RealmName: v.RealmName, PlayerGUID: v.SubjectID, PlayerName: v.SubjectName, PlayerClass: normalizeClassName(v.PlayerClass), PlayerSpec: v.PlayerSpec, PlayerSubSpec: v.PlayerSubSpec, Score: v.Score}
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
	if in.exact && in.featured == "" {
		speed, e := s.store.SpeedrunLeaderboard(ctx, database.SpeedrunLeaderboardParams{InstanceName: in.instance, FilterDifficulty: true, DifficultyName: in.difficulty, FilterInstanceMaxPlayers: true, InstanceMaxPlayers: in.size, RealmNames: realmNames, ResultLimit: 3})
		if e != nil {
			httpapi.InternalServerError(w, e)
			return
		}
		for _, v := range speed {
			out.Speedruns = append(out.Speedruns, db2sdk.SpeedrunLeaderboardEntry(v))
		}
	}
	if in.exact && in.featured != "" {
		rows, e := s.store.RankingsLeaderboardNoJIT(ctx, database.RankingsLeaderboardParams{InstanceNames: []string{in.instance}, EncounterNames: []string{in.featured}, DifficultyNames: []string{in.difficulty}, FilterMaxPlayers: in.size, ExactCohort: true, Class: string(db2sdk.HeroClassToDB(types.HeroClasses(in.class))), Spec: in.spec, SubSpec: in.subSpec, Metric: in.metric, RealmNames: realmNames, QueryLimit: 5})
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
