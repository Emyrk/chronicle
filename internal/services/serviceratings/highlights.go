package serviceratings

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"slices"
	"strings"
	"time"

	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/internal/leaderboardconfig"
	"github.com/Emyrk/chronicle/internal/leaderboardread"
	"github.com/Emyrk/chronicle/internal/services/servicedataset"
	"github.com/Emyrk/chronicle/internal/services/servicetenant"
	"github.com/google/uuid"
)

const HighlightVersion = 1
const HighlightLimit = 3
const HighlightMaxCohorts = 256

type HighlightCohort struct {
	Instance   string
	Difficulty string
	Size       int16
}

func HighlightConfiguration(ctx context.Context, store database.Store, tenant uuid.UUID) ([]database.ResolveLeaderboardConfigurationRow, []HighlightCohort, error) {
	t, err := store.GetTenantByID(ctx, tenant)
	if err != nil {
		return nil, nil, err
	}
	datasetID := servicedataset.DefaultDatasetID
	if t.DefaultDatasetID.Valid {
		datasetID = t.DefaultDatasetID.UUID
	}
	dataset, err := store.GetDataset(ctx, datasetID)
	if err != nil {
		return nil, nil, err
	}
	rows, err := leaderboardconfig.Resolve(ctx, store, database.FlavorFromStrings(dataset.DefaultFlavor), database.FlavorFromStrings(t.AdditionalFlavor))
	if err != nil {
		return nil, nil, err
	}
	cohorts := []HighlightCohort{}
	for _, row := range rows {
		if row.Kind != "instance" {
			continue
		}
		variants := 0
		for _, v := range rows {
			if v.Kind == "variant" && v.InstanceName == row.InstanceName {
				cohorts = append(cohorts, HighlightCohort{row.InstanceName, v.DifficultyName, v.MaxPlayers})
				variants++
			}
		}
		if variants == 0 {
			cohorts = append(cohorts, HighlightCohort{Instance: row.InstanceName})
		}
	}
	if len(cohorts) > HighlightMaxCohorts {
		return nil, nil, fmt.Errorf("highlight configuration exceeds %d cohorts", HighlightMaxCohorts)
	}
	slices.SortFunc(cohorts, func(a, b HighlightCohort) int {
		if n := strings.Compare(a.Instance, b.Instance); n != 0 {
			return n
		}
		if n := strings.Compare(a.Difficulty, b.Difficulty); n != 0 {
			return n
		}
		return int(a.Size) - int(b.Size)
	})
	return rows, cohorts, nil
}
func HighlightFingerprint(rows []database.ResolveLeaderboardConfigurationRow, cohort HighlightCohort) string {
	selected := []database.ResolveLeaderboardConfigurationRow{}
	for _, r := range rows {
		if r.InstanceName == cohort.Instance {
			selected = append(selected, r)
		}
	}
	encoded, _ := json.Marshal(struct {
		Version int
		Cohort  HighlightCohort
		Rows    []database.ResolveLeaderboardConfigurationRow
	}{HighlightVersion, cohort, selected})
	hash := sha256.Sum256(encoded)
	return hex.EncodeToString(hash[:])
}
func emptyHighlight(c HighlightCohort) chroniclesdk.HubLandingPreview {
	return chroniclesdk.HubLandingPreview{InstanceName: c.Instance, DifficultyName: c.Difficulty, MaxPlayers: c.Size, Player: chroniclesdk.HubPlayerRatings{Peak: []chroniclesdk.HubPlayerRatingEntry{}, RankedMastery: []chroniclesdk.HubPlayerRatingEntry{}, Renown: []chroniclesdk.HubPlayerRatingEntry{}}, Guild: chroniclesdk.HubGuildRatings{Peak: []chroniclesdk.HubGuildRatingEntry{}, RankedMastery: []chroniclesdk.HubGuildRatingEntry{}, Renown: []chroniclesdk.HubGuildRatingEntry{}}, Performances: []chroniclesdk.RankingsEntry{}, Statistics: []chroniclesdk.RankingsBoxPlotStats{}, Speedruns: []chroniclesdk.SpeedrunLeaderboardEntry{}}
}
func HighlightEmpty(p chroniclesdk.HubLandingPreview) bool {
	return len(p.Player.Peak)+len(p.Player.RankedMastery)+len(p.Player.Renown)+len(p.Guild.Peak)+len(p.Guild.RankedMastery)+len(p.Guild.Renown)+len(p.Performances)+len(p.Statistics)+len(p.Speedruns) == 0
}

// BuildHighlights reuses SQL read formulas. Realm restricts subjects, never benchmarks.
func BuildHighlights(ctx context.Context, store database.Store, tenant, realm uuid.UUID, c HighlightCohort, config []database.ResolveLeaderboardConfigurationRow) (chroniclesdk.HubLandingPreview, error) {
	out := emptyHighlight(c)
	request := leaderboardread.Request{Instance: c.Instance, Difficulty: c.Difficulty, MaxPlayers: c.Size, Subject: "player", Kind: "boss", Score: "peak", Metric: "dps", Set: "default"}
	selection, err := leaderboardread.Select(config, request)
	if err != nil {
		return out, err
	}
	for _, subject := range []string{"player", "guild"} {
		for _, score := range []string{"peak", "mastery", "renown"} {
			req := request
			req.Subject = subject
			req.Score = score
			if subject == "guild" || score == "renown" {
				req.Metric = ""
			}
			if score == "renown" {
				req.Kind = "renown"
			}
			selected, err := leaderboardread.Select(config, req)
			if err != nil {
				return out, err
			}
			rows, err := store.ListLeaderboardV2(ctx, database.ListLeaderboardV2Params{TenantID: tenant, InstanceName: c.Instance, DifficultyName: c.Difficulty, MaxPlayers: c.Size, SubjectKind: subject, BoardKind: req.Kind, ScoreMetric: score, Metric: req.Metric, Bosses: selected.Bosses, Awards: selected.Awards, Denominator: selected.Denominator, RealmFilter: realm, PageSize: HighlightLimit})
			if err != nil {
				return out, err
			}
			for _, row := range rows {
				if subject == "player" {
					entry := chroniclesdk.HubPlayerRatingEntry{RealmID: row.RealmID, RealmName: row.RealmName, PlayerGUID: row.SubjectID, PlayerName: row.SubjectName, PlayerClass: row.PlayerClass, PlayerSpec: row.PlayerSpec, PlayerSubSpec: row.PlayerSubSpec, Score: row.Score}
					switch score {
					case "peak":
						details, err := store.ListLeaderboardV2PageBosses(ctx, database.ListLeaderboardV2PageBossesParams{TenantID: tenant, InstanceName: c.Instance, DifficultyName: c.Difficulty, MaxPlayers: c.Size, Metric: "dps", SubjectKind: "player", Bosses: selected.Bosses, Realms: []uuid.UUID{row.RealmID}, Subjects: []string{row.SubjectID}, Classes: []string{row.PlayerClass}, Specs: []string{row.PlayerSpec}, SubSpecs: []string{row.PlayerSubSpec}})
						if err != nil {
							return out, err
						}
						raw := float64(0)
						for _, d := range details {
							raw += d.RawPeak / float64(selected.Denominator)
						}
						entry.PeakRaw = &raw
						out.Player.Peak = append(out.Player.Peak, entry)
					case "mastery":
						out.Player.RankedMastery = append(out.Player.RankedMastery, entry)
					default:
						out.Player.Renown = append(out.Player.Renown, entry)
					}
				} else {
					id, err := uuid.Parse(row.SubjectID)
					if err != nil {
						return out, err
					}
					entry := chroniclesdk.HubGuildRatingEntry{RealmID: row.RealmID, RealmName: row.RealmName, GuildID: id, GuildName: row.SubjectName, Score: row.Score}
					switch score {
					case "peak":
						out.Guild.Peak = append(out.Guild.Peak, entry)
					case "mastery":
						out.Guild.RankedMastery = append(out.Guild.RankedMastery, entry)
					default:
						out.Guild.Renown = append(out.Guild.Renown, entry)
					}
				}
			}
		}
	}
	realmIDs := []uuid.UUID{}
	if realm != uuid.Nil {
		realmIDs = append(realmIDs, realm)
	}
	performances, err := store.RankingsLeaderboardNoJIT(ctx, database.RankingsLeaderboardParams{InstanceNames: []string{c.Instance}, EncounterNames: selection.Bosses, DifficultyNames: []string{c.Difficulty}, RealmIds: realmIDs, ExactCohort: true, FilterMaxPlayers: c.Size, Metric: "dps", QueryLimit: HighlightLimit})
	if err != nil {
		return out, err
	}
	for _, r := range performances {
		entry := chroniclesdk.RankingsEntry{InstanceName: r.InstanceName, EncounterName: r.EncounterName, PlayerGUID: r.PlayerGuid, PlayerName: r.PlayerName, PlayerClass: strings.ReplaceAll(r.PlayerClass, "_", ""), PlayerSpec: r.PlayerSpec, PlayerRole: r.PlayerRole, PlayerLevel: r.PlayerLevel, DifficultyName: r.DifficultyName, MaxPlayers: r.MaxPlayers, RealmID: r.RealmID, RealmName: r.RealmName, GuildName: r.GuildName, GuildID: r.GuildID, DamageDone: r.DamageDone, HealingDone: r.HealingDone, AbsorbedDone: r.AbsorbedDone, DurationSecs: r.DurationSecs, DPS: r.Dps, HPS: r.Hps, LogHashedSlug: r.LogHashedSlug, KilledAt: r.KilledAt.Time}
		if r.PlayerSubSpec != "" {
			entry.SubSpec = &r.PlayerSubSpec
		}
		out.Performances = append(out.Performances, entry)
	}
	stats, err := store.RankingsBoxPlotStatsNoJIT(ctx, database.RankingsBoxPlotStatsParams{InstanceNames: []string{c.Instance}, EncounterNames: selection.Bosses, DifficultyNames: []string{c.Difficulty}, RealmIds: realmIDs, ExactCohort: true, FilterMaxPlayers: c.Size, Metric: "dps"})
	if err != nil {
		return out, err
	}
	for _, r := range stats[:min(len(stats), HighlightLimit)] {
		out.Statistics = append(out.Statistics, chroniclesdk.RankingsBoxPlotStats{PlayerClass: strings.ReplaceAll(r.PlayerClass, "_", ""), PlayerSpec: r.PlayerSpec, PlayerSubSpec: r.PlayerSubSpec, MinDPS: r.MinDps, Q1DPS: r.Q1Dps, MedianDPS: r.MedianDps, Q3DPS: r.Q3Dps, MaxDPS: r.MaxDps, Count: r.Count})
	}
	clears, err := store.SpeedrunLeaderboard(ctx, database.SpeedrunLeaderboardParams{InstanceName: c.Instance, RealmIds: realmIDs, FilterDifficulty: true, DifficultyName: c.Difficulty, FilterInstanceMaxPlayers: true, InstanceMaxPlayers: c.Size, ResultLimit: HighlightLimit})
	if err != nil {
		return out, err
	}
	for _, r := range clears {
		entry := chroniclesdk.SpeedrunLeaderboardEntry{InstanceID: r.InstanceID, Slug: r.HashedSlug.String, DifficultyName: r.DifficultyName, DurationMs: r.DurationMs, GuildID: r.GuildID.UUID, GuildName: r.GuildName, RealmName: r.RealmName, StartTime: r.StartTime.Time, CompletionTime: r.CompletionTime.Time, PlayerCount: r.PlayerCount, GuildLogoURL: r.GuildLogoUrl, ParserVersion: r.ParserVersion, AddonVersion: r.AddonVersion}
		if r.DuplicateGroupID.Valid {
			entry.DuplicateGroupID = &r.DuplicateGroupID.UUID
		}
		out.Speedruns = append(out.Speedruns, entry)
	}
	return out, nil
}

func RefreshHighlights(ctx context.Context, store database.Store, tenant, realm uuid.UUID, c HighlightCohort) error {
	if servicetenant.IsBypass(ctx) {
		return fmt.Errorf("highlight refresh requires tenant context")
	}
	ctx, cancel := context.WithTimeout(servicetenant.WithTenantID(ctx, tenant), 2*time.Minute)
	defer cancel()
	started := time.Now()
	rows, cohorts, err := HighlightConfiguration(ctx, store, tenant)
	if err != nil {
		return err
	}
	if !slices.Contains(cohorts, c) {
		return nil
	}
	realms, err := store.LeaderboardHighlightRealms(ctx, tenant)
	if err != nil {
		return err
	}
	if realm != uuid.Nil && !slices.Contains(realms, realm) {
		return fmt.Errorf("realm does not belong to tenant")
	}
	preview, err := BuildHighlights(ctx, store, tenant, realm, c, rows)
	if err != nil {
		return err
	}
	payload, err := json.Marshal(preview)
	if err != nil {
		return err
	}
	if len(payload) > 256*1024 {
		return fmt.Errorf("highlight payload exceeds bound")
	}
	return store.PublishLeaderboardHighlights(ctx, database.PublishLeaderboardHighlightsParams{TenantID: tenant, RealmScope: realm, InstanceName: c.Instance, DifficultyName: c.Difficulty, MaxPlayers: c.Size, ConfigurationFingerprint: HighlightFingerprint(rows, c), Payload: payload, RefreshStartedAt: database.Timestamptz(started)})
}
