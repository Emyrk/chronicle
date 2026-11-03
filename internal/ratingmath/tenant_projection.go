package ratingmath

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/Emyrk/chronicle/database"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
)

// TenantProjectionPage projects one bounded set of subjects from immutable
// staging. It deliberately stops before Mastery/scopes and never publishes.
// The group projector must never consume a tenant checkpoint.
func TenantProjectionPage(ctx context.Context, store database.Store, tenant, generation uuid.UUID) (bool, error) {
	finished := false
	err := store.InTx(ctx, func(tx database.Store) error {
		cp, err := tx.GetBuildingTenantProjectionCheckpoint(ctx, database.GetBuildingTenantProjectionCheckpointParams{TenantID: tenant, GenerationID: generation})
		if err != nil {
			return err
		}
		var manifest struct {
			Writer       string `json:"writer"`
			RulesVersion int32  `json:"rules_version"`
			RenownBosses []struct {
				Realm     uuid.UUID `json:"realm_id"`
				Instance  string    `json:"instance_name"`
				Encounter string    `json:"encounter_name"`
				Points    float64   `json:"renown_points"`
			} `json:"renown_bosses"`
		}
		if err := json.Unmarshal(cp.Manifest, &manifest); err != nil {
			return err
		}
		if manifest.Writer != "tenant" || manifest.RulesVersion != 2 {
			return fmt.Errorf("not a fixed-rules tenant rating checkpoint")
		}
		revision, err := tx.GetRatingConfigRevision(ctx, tenant)
		if err != nil {
			return err
		}
		if revision != cp.ConfigRevision {
			return ErrRatingConfigStale
		}
		if !cp.AsOf.Valid {
			return fmt.Errorf("tenant rating checkpoint has no as_of")
		}
		var cursor projectionCursor
		if err := json.Unmarshal(cp.Cursor, &cursor); err != nil {
			return err
		}
		start := database.Timestamptz(cp.AsOf.Time.AddDate(0, 0, -180))
		advance := func(phase string, next projectionCursor) error {
			encoded, err := json.Marshal(next)
			if err != nil {
				return err
			}
			n, err := tx.AdvanceRatingRebuildCheckpoint(ctx, database.AdvanceRatingRebuildCheckpointParams{
				TenantID: tenant, GenerationID: generation, ExpectedPhase: cp.Phase,
				ExpectedCursor: cp.Cursor, NextPhase: phase, NextCursor: encoded,
			})
			if err != nil {
				return err
			}
			if n != 1 {
				return fmt.Errorf("tenant rating checkpoint changed at %s", cp.Phase)
			}
			return nil
		}
		type realmBoss struct {
			realm uuid.UUID
			boss  BossKey
		}
		points := make(map[realmBoss]float64, len(manifest.RenownBosses))
		for _, boss := range manifest.RenownBosses {
			if boss.Realm == uuid.Nil || boss.Instance == "" || boss.Encounter == "" {
				return fmt.Errorf("invalid frozen Renown boss")
			}
			key := realmBoss{realm: boss.Realm, boss: BossKey{Instance: boss.Instance, Encounter: boss.Encounter}}
			if _, exists := points[key]; exists {
				return fmt.Errorf("duplicate frozen Renown boss")
			}
			if _, err := RenownAward(boss.Points); err != nil {
				return err
			}
			points[key] = boss.Points
		}
		switch cp.Phase {
		case "players":
			keys, err := tx.ListRatingStagePlayerKeys(ctx, database.ListRatingStagePlayerKeysParams{
				GenerationID: generation, AfterRealmID: cursor.Realm, AfterPlayerGuid: cursor.Player,
				AfterInstanceName: cursor.Instance, AfterEncounterName: cursor.Boss,
				AfterDifficultyName: cursor.Difficulty, AfterMaxPlayers: cursor.Size,
				AfterPlayerClass: cursor.Class, AfterPlayerSpec: cursor.Spec,
				AfterPlayerSubSpec: cursor.SubSpec, AfterPerformanceMetric: cursor.Metric,
				BatchSize: projectionPageSize,
			})
			if err != nil {
				return err
			}
			if len(keys) == 0 {
				return advance("guilds", projectionCursor{})
			}
			for _, k := range keys {
				if err := projectTenantPlayerPeak(ctx, tx, cp, k, start); err != nil {
					return err
				}
			}
			k := keys[len(keys)-1]
			return advance(cp.Phase, projectionCursor{Realm: k.RealmID, Player: k.PlayerGuid, Instance: k.InstanceName, Boss: k.EncounterName, Difficulty: k.DifficultyName, Size: k.MaxPlayers, Class: k.PlayerClass, Spec: k.PlayerSpec, SubSpec: k.PlayerSubSpec, Metric: k.PerformanceMetric})
		case "guilds":
			keys, err := tx.ListRatingStageGuildKeys(ctx, database.ListRatingStageGuildKeysParams{
				GenerationID: generation, AfterRealmID: cursor.Realm, AfterGuildID: cursor.Guild,
				AfterInstanceName: cursor.Instance, AfterEncounterName: cursor.Boss,
				AfterDifficultyName: cursor.Difficulty, AfterMaxPlayers: cursor.Size,
				BatchSize: projectionPageSize,
			})
			if err != nil {
				return err
			}
			if len(keys) == 0 {
				return advance("player_renown_scores", projectionCursor{})
			}
			for _, k := range keys {
				if err := projectTenantGuildPeak(ctx, tx, cp, k, start); err != nil {
					return err
				}
			}
			k := keys[len(keys)-1]
			return advance(cp.Phase, projectionCursor{Realm: k.RealmID, Guild: k.GuildID.UUID, Instance: k.InstanceName, Boss: k.EncounterName, Difficulty: k.DifficultyName, Size: k.MaxPlayers})
		case "player_renown_scores":
			keys, err := tx.ListRatingStagePlayerRenownKeys(ctx, database.ListRatingStagePlayerRenownKeysParams{
				GenerationID: generation, AfterRealmID: cursor.Realm, AfterPlayerGuid: cursor.Player,
				AfterInstanceName: cursor.Instance, AfterEncounterName: cursor.Boss, BatchSize: projectionPageSize,
			})
			if err != nil {
				return err
			}
			if len(keys) == 0 {
				return advance("guild_renown_scores", projectionCursor{})
			}
			for _, k := range keys {
				if award, ok := points[realmBoss{realm: k.RealmID, boss: BossKey{Instance: k.InstanceName, Encounter: k.EncounterName}}]; ok {
					if err := projectTenantPlayerRenown(ctx, tx, cp, k, start, award); err != nil {
						return err
					}
				}
			}
			k := keys[len(keys)-1]
			return advance(cp.Phase, projectionCursor{Realm: k.RealmID, Player: k.PlayerGuid, Instance: k.InstanceName, Boss: k.EncounterName})
		case "guild_renown_scores":
			keys, err := tx.ListRatingStageGuildRenownKeys(ctx, database.ListRatingStageGuildRenownKeysParams{
				GenerationID: generation, AfterRealmID: cursor.Realm, AfterGuildID: cursor.Guild,
				AfterInstanceName: cursor.Instance, AfterEncounterName: cursor.Boss, BatchSize: projectionPageSize,
			})
			if err != nil {
				return err
			}
			if len(keys) == 0 {
				return advance("mastery_pending", projectionCursor{})
			}
			for _, k := range keys {
				if award, ok := points[realmBoss{realm: k.RealmID, boss: BossKey{Instance: k.InstanceName, Encounter: k.EncounterName}}]; ok {
					if err := projectTenantGuildRenown(ctx, tx, cp, k, start, award); err != nil {
						return err
					}
				}
			}
			k := keys[len(keys)-1]
			return advance(cp.Phase, projectionCursor{Realm: k.RealmID, Guild: k.GuildID, Instance: k.InstanceName, Boss: k.EncounterName})
		case "mastery_pending":
			finished = true
			return nil
		default:
			return fmt.Errorf("tenant projection cannot process phase %q", cp.Phase)
		}
	}, nil)
	return finished, err
}

func tenantWindow(kind string, start, end pgtype.Timestamptz) (pgtype.Timestamptz, pgtype.Timestamptz) {
	if kind == "period" {
		return start, end
	}
	return pgtype.Timestamptz{}, pgtype.Timestamptz{}
}

func projectTenantPlayerPeak(ctx context.Context, tx database.Store, cp database.RatingRebuildCheckpoint, k database.ListRatingStagePlayerKeysRow, start pgtype.Timestamptz) error {
	best, err := tx.RatingStagePlayerPeak(ctx, database.RatingStagePlayerPeakParams{GenerationID: cp.GenerationID, RealmID: k.RealmID, PlayerGuid: k.PlayerGuid, InstanceName: k.InstanceName, EncounterName: k.EncounterName, DifficultyName: k.DifficultyName, MaxPlayers: k.MaxPlayers, PlayerClass: k.PlayerClass, PlayerSpec: k.PlayerSpec, PlayerSubSpec: k.PlayerSubSpec, PerformanceMetric: k.PerformanceMetric, PeriodStart: start, WindowEnd: cp.AsOf})
	if err != nil {
		return err
	}
	rank, err := tx.RatingProjectionPlayerRankOne(ctx, database.RatingProjectionPlayerRankOneParams{GenerationID: cp.GenerationID, InstanceName: k.InstanceName, EncounterName: k.EncounterName, DifficultyName: k.DifficultyName, MaxPlayers: k.MaxPlayers, PlayerClass: k.PlayerClass, PlayerSpec: k.PlayerSpec, PlayerSubSpec: k.PlayerSubSpec, PerformanceMetric: k.PerformanceMetric, PeriodStart: start, WindowEnd: cp.AsOf})
	if err != nil {
		return err
	}
	for _, w := range []struct {
		kind                string
		raw, rank, duration float64
	}{{"all_time", best.CareerRaw, rank.CareerRaw, best.CareerDurationSecs}, {"period", best.PeriodRaw, rank.PeriodRaw, best.PeriodDurationSecs}} {
		if w.raw <= 0 || w.rank <= 0 {
			continue
		}
		score, err := Peak(w.raw, w.rank)
		if err != nil {
			return err
		}
		ws, we := tenantWindow(w.kind, start, cp.AsOf)
		n, err := tx.InsertPlayerTenantBossScore(ctx, database.InsertPlayerTenantBossScoreParams{GenerationID: cp.GenerationID, TenantID: cp.TenantID, RealmID: k.RealmID, PlayerGuid: k.PlayerGuid, InstanceName: k.InstanceName, EncounterName: k.EncounterName, DifficultyName: k.DifficultyName, MaxPlayers: k.MaxPlayers, PlayerClass: k.PlayerClass, PlayerSpec: k.PlayerSpec, PlayerSubSpec: k.PlayerSubSpec, PerformanceMetric: k.PerformanceMetric, RatingMetric: "peak", WindowKind: w.kind, WindowStart: ws, WindowEnd: we, Score: score, BestRaw: pgtype.Float8{Float64: w.raw, Valid: true}, RankOneRaw: pgtype.Float8{Float64: w.rank, Valid: true}, BestDurationSecs: w.duration})
		if err != nil {
			return err
		}
		if n != 1 {
			return fmt.Errorf("tenant player Peak write rejected")
		}
	}
	return nil
}

func projectTenantGuildPeak(ctx context.Context, tx database.Store, cp database.RatingRebuildCheckpoint, k database.ListRatingStageGuildKeysRow, start pgtype.Timestamptz) error {
	best, err := tx.RatingStageGuildPeak(ctx, database.RatingStageGuildPeakParams{GenerationID: cp.GenerationID, RealmID: k.RealmID, GuildID: k.GuildID, InstanceName: k.InstanceName, EncounterName: k.EncounterName, DifficultyName: k.DifficultyName, MaxPlayers: k.MaxPlayers, PeriodStart: start, WindowEnd: cp.AsOf})
	if err != nil {
		return err
	}
	rank, err := tx.RatingProjectionGuildRankOne(ctx, database.RatingProjectionGuildRankOneParams{GenerationID: cp.GenerationID, InstanceName: k.InstanceName, EncounterName: k.EncounterName, DifficultyName: k.DifficultyName, MaxPlayers: k.MaxPlayers, PeriodStart: start, WindowEnd: cp.AsOf})
	if err != nil {
		return err
	}
	for _, w := range []struct {
		kind      string
		raw, rank float64
	}{{"all_time", best.CareerRaw, rank.CareerRaw}, {"period", best.PeriodRaw, rank.PeriodRaw}} {
		if w.raw <= 0 || w.rank <= 0 {
			continue
		}
		score, err := PeakTime(w.raw, w.rank)
		if err != nil {
			return err
		}
		ws, we := tenantWindow(w.kind, start, cp.AsOf)
		n, err := tx.InsertGuildTenantBossScore(ctx, database.InsertGuildTenantBossScoreParams{GenerationID: cp.GenerationID, TenantID: cp.TenantID, RealmID: k.RealmID, GuildID: k.GuildID.UUID, InstanceName: k.InstanceName, EncounterName: k.EncounterName, DifficultyName: k.DifficultyName, MaxPlayers: k.MaxPlayers, RatingMetric: "peak", WindowKind: w.kind, WindowStart: ws, WindowEnd: we, Score: score, BestRaw: pgtype.Float8{Float64: w.raw, Valid: true}, RankOneRaw: pgtype.Float8{Float64: w.rank, Valid: true}})
		if err != nil {
			return err
		}
		if n != 1 {
			return fmt.Errorf("tenant guild Peak write rejected")
		}
	}
	return nil
}

func projectTenantPlayerRenown(ctx context.Context, tx database.Store, cp database.RatingRebuildCheckpoint, k database.ListRatingStagePlayerRenownKeysRow, start pgtype.Timestamptz, award float64) error {
	counts, err := tx.RatingStagePlayerRenownTotals(ctx, database.RatingStagePlayerRenownTotalsParams{GenerationID: cp.GenerationID, RealmID: k.RealmID, PlayerGuid: k.PlayerGuid, InstanceName: k.InstanceName, EncounterName: k.EncounterName, PeriodStart: start, WindowEnd: cp.AsOf})
	if err != nil {
		return err
	}
	for _, w := range []struct {
		kind  string
		kills int32
	}{{"career", counts.CareerKills}, {"period", counts.PeriodKills}} {
		if w.kills == 0 {
			continue
		}
		ws, we := tenantWindow(w.kind, start, cp.AsOf)
		n, err := tx.InsertPlayerTenantBossScore(ctx, database.InsertPlayerTenantBossScoreParams{GenerationID: cp.GenerationID, TenantID: cp.TenantID, RealmID: k.RealmID, PlayerGuid: k.PlayerGuid, InstanceName: k.InstanceName, EncounterName: k.EncounterName, PerformanceMetric: "none", RatingMetric: "renown", WindowKind: w.kind, WindowStart: ws, WindowEnd: we, Score: float64(w.kills) * award, EligibleKills: w.kills})
		if err != nil {
			return err
		}
		if n != 1 {
			return fmt.Errorf("tenant player Renown write rejected")
		}
	}
	return nil
}

func projectTenantGuildRenown(ctx context.Context, tx database.Store, cp database.RatingRebuildCheckpoint, k database.ListRatingStageGuildRenownKeysRow, start pgtype.Timestamptz, award float64) error {
	counts, err := tx.RatingStageGuildRenownTotals(ctx, database.RatingStageGuildRenownTotalsParams{GenerationID: cp.GenerationID, RealmID: k.RealmID, GuildID: k.GuildID, InstanceName: k.InstanceName, EncounterName: k.EncounterName, PeriodStart: start, WindowEnd: cp.AsOf})
	if err != nil {
		return err
	}
	for _, w := range []struct {
		kind  string
		kills int32
	}{{"career", counts.CareerKills}, {"period", counts.PeriodKills}} {
		if w.kills == 0 {
			continue
		}
		ws, we := tenantWindow(w.kind, start, cp.AsOf)
		n, err := tx.InsertGuildTenantBossScore(ctx, database.InsertGuildTenantBossScoreParams{GenerationID: cp.GenerationID, TenantID: cp.TenantID, RealmID: k.RealmID, GuildID: k.GuildID, InstanceName: k.InstanceName, EncounterName: k.EncounterName, RatingMetric: "renown", WindowKind: w.kind, WindowStart: ws, WindowEnd: we, Score: float64(w.kills) * award, EligibleKills: w.kills})
		if err != nil {
			return err
		}
		if n != 1 {
			return fmt.Errorf("tenant guild Renown write rejected")
		}
	}
	return nil
}
