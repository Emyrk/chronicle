package ratingmath

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/Emyrk/chronicle/database"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
)

// projectionPageSize bounds both the checkpoint transaction and the returned key page.
const projectionPageSize int32 = 16

type projectionManifest struct {
	Memberships []database.RatingRealmGroupMembership `json:"memberships"`
	Policies    []database.RatingGroupPolicy          `json:"policies"`
	Bosses      []database.RatingGroupBossPolicy      `json:"boss_policies"`
	Raids       []database.RatingGroupRaidPolicy      `json:"raid_policies"`
}

type projectionCursor struct {
	Realm      uuid.UUID `json:"realm,omitempty"`
	Player     string    `json:"player,omitempty"`
	Guild      uuid.UUID `json:"guild,omitempty"`
	Instance   string    `json:"instance,omitempty"`
	Boss       string    `json:"boss,omitempty"`
	Difficulty string    `json:"difficulty,omitempty"`
	Size       int16     `json:"size,omitempty"`
	Class      string    `json:"class,omitempty"`
	Spec       string    `json:"spec,omitempty"`
	SubSpec    string    `json:"sub_spec,omitempty"`
	Metric     string    `json:"metric,omitempty"`
	Group      uuid.UUID `json:"group,omitempty"`
	Rating     string    `json:"rating,omitempty"`
	Window     string    `json:"window,omitempty"`
}

func (m projectionManifest) forRealm(realm uuid.UUID, instance, boss string) (database.RatingGroupPolicy, database.RatingGroupBossPolicy, bool) {
	var group uuid.UUID
	for _, membership := range m.Memberships {
		if membership.RealmID == realm {
			group = membership.GroupID
			break
		}
	}
	if group == uuid.Nil {
		return database.RatingGroupPolicy{}, database.RatingGroupBossPolicy{}, false
	}
	for _, policy := range m.Policies {
		if policy.GroupID != group {
			continue
		}
		for _, eligible := range m.Bosses {
			if eligible.GroupID == group && eligible.InstanceName == instance && eligible.EncounterName == boss {
				return policy, eligible, true
			}
		}
	}
	return database.RatingGroupPolicy{}, database.RatingGroupBossPolicy{}, false
}

func advanceProjection(ctx context.Context, tx database.Store, cp database.RatingRebuildCheckpoint, phase string, cursor projectionCursor) error {
	encoded, err := json.Marshal(cursor)
	if err != nil {
		return err
	}
	n, err := tx.AdvanceRatingRebuildCheckpoint(ctx, database.AdvanceRatingRebuildCheckpointParams{
		TenantID: cp.TenantID, GenerationID: cp.GenerationID, ExpectedPhase: cp.Phase,
		ExpectedCursor: cp.Cursor, NextPhase: phase, NextCursor: encoded,
	})
	if err != nil {
		return err
	}
	if n != 1 {
		return fmt.Errorf("rating projection checkpoint changed at %s", cp.Phase)
	}
	return nil
}

// ProjectRatingStagePage projects a bounded page of immutable evidence. Until
// Mastery and scopes are projected, it must never return complete or set ready.
func ProjectRatingStagePage(ctx context.Context, store database.Store, tenant, generation uuid.UUID) (bool, error) {
	err := store.InTx(ctx, func(tx database.Store) error {
		cp, err := tx.GetRatingRebuildCheckpoint(ctx, database.GetRatingRebuildCheckpointParams{TenantID: tenant, GenerationID: generation})
		if err != nil {
			return err
		}
		revision, err := tx.GetRatingConfigRevision(ctx, tenant)
		if err != nil {
			return err
		}
		if revision != cp.ConfigRevision {
			return fmt.Errorf("rating configuration changed during projection")
		}
		var m projectionManifest
		if err := json.Unmarshal(cp.Manifest, &m); err != nil {
			return fmt.Errorf("invalid frozen rating manifest: %w", err)
		}
		var c projectionCursor
		if err := json.Unmarshal(cp.Cursor, &c); err != nil {
			return fmt.Errorf("invalid projection cursor: %w", err)
		}
		switch cp.Phase {
		case "players":
			keys, err := tx.ListRatingStagePlayerKeys(ctx, database.ListRatingStagePlayerKeysParams{
				GenerationID: generation, AfterRealmID: c.Realm, AfterPlayerGuid: c.Player, AfterInstanceName: c.Instance,
				AfterEncounterName: c.Boss, AfterDifficultyName: c.Difficulty, AfterMaxPlayers: c.Size,
				AfterPlayerClass: c.Class, AfterPlayerSpec: c.Spec, AfterPlayerSubSpec: c.SubSpec,
				AfterPerformanceMetric: c.Metric, BatchSize: projectionPageSize,
			})
			if err != nil {
				return err
			}
			if len(keys) == 0 {
				return advanceProjection(ctx, tx, cp, "guilds", projectionCursor{})
			}
			for _, key := range keys {
				policy, _, ok := m.forRealm(key.RealmID, key.InstanceName, key.EncounterName)
				if ok {
					if err := projectPlayerPeak(ctx, tx, cp, key, policy); err != nil {
						return err
					}
				}
			}
			k := keys[len(keys)-1]
			return advanceProjection(ctx, tx, cp, cp.Phase, projectionCursor{Realm: k.RealmID, Player: k.PlayerGuid, Instance: k.InstanceName, Boss: k.EncounterName, Difficulty: k.DifficultyName, Size: k.MaxPlayers, Class: k.PlayerClass, Spec: k.PlayerSpec, SubSpec: k.PlayerSubSpec, Metric: k.PerformanceMetric})
		case "guilds":
			keys, err := tx.ListRatingStageGuildKeys(ctx, database.ListRatingStageGuildKeysParams{
				GenerationID: generation, AfterRealmID: c.Realm, AfterGuildID: c.Guild, AfterInstanceName: c.Instance,
				AfterEncounterName: c.Boss, AfterDifficultyName: c.Difficulty, AfterMaxPlayers: c.Size, BatchSize: projectionPageSize,
			})
			if err != nil {
				return err
			}
			if len(keys) == 0 {
				return advanceProjection(ctx, tx, cp, "player_renown_scores", projectionCursor{})
			}
			for _, key := range keys {
				policy, _, ok := m.forRealm(key.RealmID, key.InstanceName, key.EncounterName)
				if ok {
					if err := projectGuildPeak(ctx, tx, cp, key, policy); err != nil {
						return err
					}
				}
			}
			k := keys[len(keys)-1]
			return advanceProjection(ctx, tx, cp, cp.Phase, projectionCursor{Realm: k.RealmID, Guild: k.GuildID.UUID, Instance: k.InstanceName, Boss: k.EncounterName, Difficulty: k.DifficultyName, Size: k.MaxPlayers})
		case "player_renown_scores":
			keys, err := tx.ListRatingStagePlayerRenownKeys(ctx, database.ListRatingStagePlayerRenownKeysParams{GenerationID: generation, AfterRealmID: c.Realm, AfterPlayerGuid: c.Player, AfterInstanceName: c.Instance, AfterEncounterName: c.Boss, BatchSize: projectionPageSize})
			if err != nil {
				return err
			}
			if len(keys) == 0 {
				return advanceProjection(ctx, tx, cp, "guild_renown_scores", projectionCursor{})
			}
			for _, key := range keys {
				policy, boss, ok := m.forRealm(key.RealmID, key.InstanceName, key.EncounterName)
				if ok {
					if err := projectPlayerRenown(ctx, tx, cp, key, policy, boss); err != nil {
						return err
					}
				}
			}
			k := keys[len(keys)-1]
			return advanceProjection(ctx, tx, cp, cp.Phase, projectionCursor{Realm: k.RealmID, Player: k.PlayerGuid, Instance: k.InstanceName, Boss: k.EncounterName})
		case "guild_renown_scores":
			keys, err := tx.ListRatingStageGuildRenownKeys(ctx, database.ListRatingStageGuildRenownKeysParams{GenerationID: generation, AfterRealmID: c.Realm, AfterGuildID: c.Guild, AfterInstanceName: c.Instance, AfterEncounterName: c.Boss, BatchSize: projectionPageSize})
			if err != nil {
				return err
			}
			if len(keys) == 0 {
				return advanceProjection(ctx, tx, cp, "mastery_pending", projectionCursor{})
			}
			for _, key := range keys {
				policy, boss, ok := m.forRealm(key.RealmID, key.InstanceName, key.EncounterName)
				if ok {
					if err := projectGuildRenown(ctx, tx, cp, key, policy, boss); err != nil {
						return err
					}
				}
			}
			k := keys[len(keys)-1]
			return advanceProjection(ctx, tx, cp, cp.Phase, projectionCursor{Realm: k.RealmID, Guild: k.GuildID, Instance: k.InstanceName, Boss: k.EncounterName})
		case "player_scopes":
			keys, err := tx.ListRatingProjectionPlayerScopes(ctx, database.ListRatingProjectionPlayerScopesParams{
				GenerationID: generation, AfterGroupID: c.Group, AfterRealmID: c.Realm, AfterPlayerGuid: c.Player,
				AfterDifficultyName: c.Difficulty, AfterMaxPlayers: c.Size, AfterPlayerClass: c.Class,
				AfterPlayerSpec: c.Spec, AfterPlayerSubSpec: c.SubSpec, AfterPerformanceMetric: c.Metric,
				AfterRatingMetric: c.Rating, AfterWindowKind: c.Window, BatchSize: projectionPageSize,
			})
			if err != nil {
				return err
			}
			if len(keys) == 0 {
				return advanceProjection(ctx, tx, cp, "guild_scopes", projectionCursor{})
			}
			for _, key := range keys {
				if err := projectPlayerScope(ctx, tx, cp, m, key); err != nil {
					return err
				}
			}
			k := keys[len(keys)-1]
			return advanceProjection(ctx, tx, cp, cp.Phase, projectionCursor{Group: k.GroupID.UUID, Realm: k.RealmID, Player: k.PlayerGuid,
				Difficulty: k.DifficultyName, Size: k.MaxPlayers, Class: k.PlayerClass, Spec: k.PlayerSpec, SubSpec: k.PlayerSubSpec,
				Metric: k.PerformanceMetric, Rating: k.RatingMetric, Window: k.WindowKind})
		case "guild_scopes":
			keys, err := tx.ListRatingProjectionGuildScopes(ctx, database.ListRatingProjectionGuildScopesParams{
				GenerationID: generation, AfterGroupID: c.Group, AfterRealmID: c.Realm, AfterGuildID: c.Guild,
				AfterDifficultyName: c.Difficulty, AfterMaxPlayers: c.Size, AfterRatingMetric: c.Rating,
				AfterWindowKind: c.Window, BatchSize: projectionPageSize,
			})
			if err != nil {
				return err
			}
			if len(keys) == 0 {
				return advanceProjection(ctx, tx, cp, "scopes_complete", projectionCursor{})
			}
			for _, key := range keys {
				if err := projectGuildScope(ctx, tx, cp, m, key); err != nil {
					return err
				}
			}
			k := keys[len(keys)-1]
			return advanceProjection(ctx, tx, cp, cp.Phase, projectionCursor{Group: k.GroupID, Realm: k.RealmID, Guild: k.GuildID,
				Difficulty: k.DifficultyName, Size: k.MaxPlayers, Rating: k.RatingMetric, Window: k.WindowKind})
		default:
			return fmt.Errorf("rating projection phase %q is not complete (mastery and scopes required)", cp.Phase)
		}
	}, nil)
	return false, err
}

func projectPlayerPeak(ctx context.Context, tx database.Store, cp database.RatingRebuildCheckpoint, k database.ListRatingStagePlayerKeysRow, p database.RatingGroupPolicy) error {
	start := cp.AsOf.Time.AddDate(0, 0, -int(p.PeriodDays))
	args := database.RatingStagePlayerPeakParams{GenerationID: cp.GenerationID, RealmID: k.RealmID, PlayerGuid: k.PlayerGuid, InstanceName: k.InstanceName, EncounterName: k.EncounterName, DifficultyName: k.DifficultyName, MaxPlayers: k.MaxPlayers, PlayerClass: k.PlayerClass, PlayerSpec: k.PlayerSpec, PlayerSubSpec: k.PlayerSubSpec, PerformanceMetric: k.PerformanceMetric, PeriodStart: database.Timestamptz(start), WindowEnd: cp.AsOf}
	best, err := tx.RatingStagePlayerPeak(ctx, args)
	if err != nil {
		return err
	}
	rank, err := tx.RatingProjectionPlayerRankOne(ctx, database.RatingProjectionPlayerRankOneParams{GenerationID: cp.GenerationID, InstanceName: k.InstanceName, EncounterName: k.EncounterName, DifficultyName: k.DifficultyName, MaxPlayers: k.MaxPlayers, PlayerClass: k.PlayerClass, PlayerSpec: k.PlayerSpec, PlayerSubSpec: k.PlayerSubSpec, PerformanceMetric: k.PerformanceMetric, PeriodStart: database.Timestamptz(start), WindowEnd: cp.AsOf})
	if err != nil {
		return err
	}
	subject := scoredKey{realm: k.RealmID, player: k.PlayerGuid, instance: k.InstanceName, boss: k.EncounterName, difficulty: k.DifficultyName, size: k.MaxPlayers, class: k.PlayerClass, spec: k.PlayerSpec, subSpec: k.PlayerSubSpec, metric: k.PerformanceMetric}
	for _, w := range []struct {
		name      string
		raw, rank float64
	}{{"all_time", best.CareerRaw, rank.CareerRaw}, {"period", best.PeriodRaw, rank.PeriodRaw}} {
		if w.raw <= 0 || w.rank <= 0 {
			continue
		}
		value, err := Peak(w.raw, w.rank)
		if err != nil {
			return err
		}
		row := ratingScoreParams(cp.GenerationID, cp.TenantID, p.GroupID, subject, "peak", w.name, value, cp.AsOf.Time, start)
		row.BestRaw = pgtype.Float8{Float64: w.raw, Valid: true}
		row.RankOneRaw = pgtype.Float8{Float64: w.rank, Valid: true}
		if err := tx.InsertRatingBossScore(ctx, row); err != nil {
			return err
		}
	}
	return nil
}

func projectGuildPeak(ctx context.Context, tx database.Store, cp database.RatingRebuildCheckpoint, k database.ListRatingStageGuildKeysRow, p database.RatingGroupPolicy) error {
	start := cp.AsOf.Time.AddDate(0, 0, -int(p.PeriodDays))
	best, err := tx.RatingStageGuildPeak(ctx, database.RatingStageGuildPeakParams{GenerationID: cp.GenerationID, RealmID: k.RealmID, GuildID: k.GuildID, InstanceName: k.InstanceName, EncounterName: k.EncounterName, DifficultyName: k.DifficultyName, MaxPlayers: k.MaxPlayers, PeriodStart: database.Timestamptz(start), WindowEnd: cp.AsOf})
	if err != nil {
		return err
	}
	rank, err := tx.RatingProjectionGuildRankOne(ctx, database.RatingProjectionGuildRankOneParams{GenerationID: cp.GenerationID, InstanceName: k.InstanceName, EncounterName: k.EncounterName, DifficultyName: k.DifficultyName, MaxPlayers: k.MaxPlayers, PeriodStart: database.Timestamptz(start), WindowEnd: cp.AsOf})
	if err != nil {
		return err
	}
	subject := guildKey{realm: k.RealmID, guild: k.GuildID.UUID, instance: k.InstanceName, boss: k.EncounterName, difficulty: k.DifficultyName, size: k.MaxPlayers}
	for _, w := range []struct {
		name      string
		raw, rank float64
	}{{"all_time", best.CareerRaw, rank.CareerRaw}, {"period", best.PeriodRaw, rank.PeriodRaw}} {
		if w.raw <= 0 || w.rank <= 0 {
			continue
		}
		value, err := PeakTime(w.raw, w.rank)
		if err != nil {
			return err
		}
		row := guildScoreParams(cp.GenerationID, cp.TenantID, p.GroupID, subject, "peak", w.name, value, cp.AsOf.Time, start)
		row.BestRaw = pgtype.Float8{Float64: w.raw, Valid: true}
		row.RankOneRaw = pgtype.Float8{Float64: w.rank, Valid: true}
		if err := tx.InsertGuildRatingBossScore(ctx, row); err != nil {
			return err
		}
	}
	return nil
}

func projectPlayerRenown(ctx context.Context, tx database.Store, cp database.RatingRebuildCheckpoint, k database.ListRatingStagePlayerRenownKeysRow, p database.RatingGroupPolicy, b database.RatingGroupBossPolicy) error {
	start := cp.AsOf.Time.AddDate(0, 0, -int(p.PeriodDays))
	counts, err := tx.RatingStagePlayerRenownTotals(ctx, database.RatingStagePlayerRenownTotalsParams{GenerationID: cp.GenerationID, RealmID: k.RealmID, PlayerGuid: k.PlayerGuid, InstanceName: k.InstanceName, EncounterName: k.EncounterName, PeriodStart: database.Timestamptz(start), WindowEnd: cp.AsOf})
	if err != nil {
		return err
	}
	award, err := RenownAward(b.RenownPoints, b.FinalBossBonus, b.FinalBossBonus > 0)
	if err != nil {
		return err
	}
	subject := scoredKey{realm: k.RealmID, player: k.PlayerGuid, instance: k.InstanceName, boss: k.EncounterName, metric: "none"}
	for _, w := range []struct {
		name  string
		kills int32
	}{{"career", counts.CareerKills}, {"period", counts.PeriodKills}} {
		if w.kills == 0 {
			continue
		}
		row := ratingScoreParams(cp.GenerationID, cp.TenantID, p.GroupID, subject, "renown", w.name, float64(w.kills)*award, cp.AsOf.Time, start)
		row.EligibleKills = w.kills
		if err := tx.InsertRatingBossScore(ctx, row); err != nil {
			return err
		}
	}
	return nil
}

func projectGuildRenown(ctx context.Context, tx database.Store, cp database.RatingRebuildCheckpoint, k database.ListRatingStageGuildRenownKeysRow, p database.RatingGroupPolicy, b database.RatingGroupBossPolicy) error {
	start := cp.AsOf.Time.AddDate(0, 0, -int(p.PeriodDays))
	counts, err := tx.RatingStageGuildRenownTotals(ctx, database.RatingStageGuildRenownTotalsParams{GenerationID: cp.GenerationID, RealmID: k.RealmID, GuildID: k.GuildID, InstanceName: k.InstanceName, EncounterName: k.EncounterName, PeriodStart: database.Timestamptz(start), WindowEnd: cp.AsOf})
	if err != nil {
		return err
	}
	award, err := RenownAward(b.RenownPoints, b.FinalBossBonus, b.FinalBossBonus > 0)
	if err != nil {
		return err
	}
	subject := guildKey{realm: k.RealmID, guild: k.GuildID, instance: k.InstanceName, boss: k.EncounterName}
	for _, w := range []struct {
		name  string
		kills int32
	}{{"career", counts.CareerKills}, {"period", counts.PeriodKills}} {
		if w.kills == 0 {
			continue
		}
		row := guildScoreParams(cp.GenerationID, cp.TenantID, p.GroupID, subject, "renown", w.name, float64(w.kills)*award, cp.AsOf.Time, start)
		row.EligibleKills = w.kills
		if err := tx.InsertGuildRatingBossScore(ctx, row); err != nil {
			return err
		}
	}
	return nil
}

func projectionPolicies(m projectionManifest, group uuid.UUID) ([]database.RatingGroupBossPolicy, []database.RatingGroupRaidPolicy, error) {
	var bosses []database.RatingGroupBossPolicy
	var raids []database.RatingGroupRaidPolicy
	for _, b := range m.Bosses {
		if b.GroupID == group {
			bosses = append(bosses, b)
		}
	}
	for _, r := range m.Raids {
		if r.GroupID == group {
			raids = append(raids, r)
		}
	}
	if len(bosses) == 0 || len(raids) == 0 {
		return nil, nil, fmt.Errorf("rating group %s lacks eligible bosses or raids", group)
	}
	return bosses, raids, nil
}

func projectPlayerScope(ctx context.Context, tx database.Store, cp database.RatingRebuildCheckpoint, m projectionManifest, k database.ListRatingProjectionPlayerScopesRow) error {
	if !k.GroupID.Valid {
		return fmt.Errorf("rating scope has no group")
	}
	bosses, raids, err := projectionPolicies(m, k.GroupID.UUID)
	if err != nil {
		return err
	}
	rows, err := tx.ListRatingProjectionPlayerBosses(ctx, database.ListRatingProjectionPlayerBossesParams{GenerationID: cp.GenerationID, GroupID: k.GroupID, RealmID: k.RealmID, PlayerGuid: k.PlayerGuid, DifficultyName: k.DifficultyName, MaxPlayers: k.MaxPlayers, PlayerClass: k.PlayerClass, PlayerSpec: k.PlayerSpec, PlayerSubSpec: k.PlayerSubSpec, PerformanceMetric: k.PerformanceMetric, RatingMetric: k.RatingMetric, WindowKind: k.WindowKind})
	if err != nil {
		return err
	}
	if len(rows) > 200 {
		return fmt.Errorf("player scope boss safety bound exceeded")
	}
	observed := make(map[BossKey]float64, len(rows))
	for _, r := range rows {
		observed[BossKey{Instance: r.InstanceName, Encounter: r.EncounterName}] = r.Score
	}
	key := scopeKey{character: scoredKey{realm: k.RealmID, player: k.PlayerGuid, difficulty: k.DifficultyName, size: k.MaxPlayers, class: k.PlayerClass, spec: k.PlayerSpec, subSpec: k.PlayerSubSpec, metric: k.PerformanceMetric}, rating: k.RatingMetric, window: k.WindowKind}
	_, err = writeRatingScopes(ctx, tx, cp.GenerationID, cp.TenantID, k.GroupID.UUID, map[scopeKey]map[BossKey]float64{key: observed}, bosses, raids)
	return err
}

func projectGuildScope(ctx context.Context, tx database.Store, cp database.RatingRebuildCheckpoint, m projectionManifest, k database.ListRatingProjectionGuildScopesRow) error {
	bosses, raids, err := projectionPolicies(m, k.GroupID)
	if err != nil {
		return err
	}
	rows, err := tx.ListRatingProjectionGuildBosses(ctx, database.ListRatingProjectionGuildBossesParams{GenerationID: cp.GenerationID, GroupID: k.GroupID, RealmID: k.RealmID, GuildID: k.GuildID, DifficultyName: k.DifficultyName, MaxPlayers: k.MaxPlayers, RatingMetric: k.RatingMetric, WindowKind: k.WindowKind})
	if err != nil {
		return err
	}
	if len(rows) > 200 {
		return fmt.Errorf("guild scope boss safety bound exceeded")
	}
	observed := make(map[BossKey]float64, len(rows))
	for _, r := range rows {
		observed[BossKey{Instance: r.InstanceName, Encounter: r.EncounterName}] = r.Score
	}
	key := guildScopeKey{guild: guildKey{realm: k.RealmID, guild: k.GuildID, difficulty: k.DifficultyName, size: k.MaxPlayers}, rating: k.RatingMetric, window: k.WindowKind}
	_, err = writeGuildScopes(ctx, tx, cp.GenerationID, cp.TenantID, k.GroupID, map[guildScopeKey]map[BossKey]float64{key: observed}, bosses, raids)
	return err
}
