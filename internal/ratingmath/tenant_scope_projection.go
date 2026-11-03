package ratingmath

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/Emyrk/chronicle/database"
	"github.com/google/uuid"
)

// TenantScopeProjectionPage writes at most 16 raid-only subject scores and
// advances the cursor in the same transaction. It never marks a generation
// ready or publishes it; the worker must verify all phases before activation.
func TenantScopeProjectionPage(ctx context.Context, store database.Store, tenant, generation uuid.UUID) error {
	return store.InTx(ctx, func(tx database.Store) error {
		cp, err := tx.GetBuildingTenantProjectionCheckpoint(ctx, database.GetBuildingTenantProjectionCheckpointParams{TenantID: tenant, GenerationID: generation})
		if err != nil {
			return err
		}
		revision, err := tx.GetRatingConfigRevision(ctx, tenant)
		if err != nil {
			return err
		}
		if revision != cp.ConfigRevision {
			return ErrRatingConfigStale
		}
		var c projectionCursor
		if err := json.Unmarshal(cp.Cursor, &c); err != nil {
			return fmt.Errorf("invalid tenant scope cursor: %w", err)
		}
		// The frozen per-realm boss roster: a raid Peak counts every required boss.
		var manifest struct {
			RenownBosses []struct {
				Realm     uuid.UUID `json:"realm_id"`
				Instance  string    `json:"instance_name"`
				Encounter string    `json:"encounter_name"`
			} `json:"renown_bosses"`
		}
		if err := json.Unmarshal(cp.Manifest, &manifest); err != nil {
			return fmt.Errorf("invalid tenant scope manifest: %w", err)
		}
		type realmRaid struct {
			realm    uuid.UUID
			instance string
		}
		rosters := make(map[realmRaid][]string)
		for _, boss := range manifest.RenownBosses {
			key := realmRaid{boss.Realm, boss.Instance}
			rosters[key] = append(rosters[key], boss.Encounter)
		}
		raidPeak := func(rating string, realm uuid.UUID, instance string, bosses []tenantScopeBoss, observed float64) float64 {
			if rating != "peak" {
				return observed
			}
			if score, ok := tenantRaidPeak(bosses, rosters[realmRaid{realm, instance}]); ok {
				return score
			}
			return observed
		}
		next := projectionCursor{}
		phase := cp.Phase
		switch phase {
		case "player_scopes":
			keys, err := tx.ListTenantPlayerRaidScopeKeys(ctx, database.ListTenantPlayerRaidScopeKeysParams{
				GenerationID: generation, TenantID: tenant, AfterRealmID: c.Realm,
				AfterPlayerGuid: c.Player, AfterInstanceName: c.Instance, AfterDifficultyName: c.Difficulty,
				AfterMaxPlayers: c.Size, AfterPlayerClass: c.Class, AfterPlayerSpec: c.Spec,
				AfterPlayerSubSpec: c.SubSpec, AfterPerformanceMetric: c.Metric, AfterRatingMetric: c.Rating,
				AfterWindowKind: c.Window, BatchSize: projectionPageSize,
			})
			if err != nil {
				return err
			}
			if len(keys) == 0 {
				phase = "guild_scopes"
			}
			for _, k := range keys {
				rows, err := tx.ListTenantPlayerRaidBosses(ctx, database.ListTenantPlayerRaidBossesParams{
					GenerationID: generation, TenantID: tenant, RealmID: k.RealmID, PlayerGuid: k.PlayerGuid,
					InstanceName: k.InstanceName, DifficultyName: k.DifficultyName, MaxPlayers: k.MaxPlayers,
					PlayerClass: k.PlayerClass, PlayerSpec: k.PlayerSpec, PlayerSubSpec: k.PlayerSubSpec,
					PerformanceMetric: k.PerformanceMetric, RatingMetric: k.RatingMetric, WindowKind: k.WindowKind,
				})
				if err != nil {
					return err
				}
				if len(rows) == 0 || len(rows) > 200 {
					return fmt.Errorf("tenant player raid boss safety bound exceeded")
				}
				bosses := make([]tenantScopeBoss, 0, len(rows))
				for _, row := range rows {
					bosses = append(bosses, tenantScopeBoss{instance: k.InstanceName, encounter: row.EncounterName, score: row.Score,
						raw: row.BestRaw.Float64, duration: row.BestDurationSecs})
				}
				raids, err := tenantScopeScores(k.RatingMetric, bosses)
				if err != nil {
					return err
				}
				// 0 when not a Peak or any counted kill lacks its throughput or length.
				var bestRaw, bestDuration float64
				if k.RatingMetric == "peak" {
					if raw, duration, ok := tenantScopeThroughput(bosses); ok {
						bestRaw, bestDuration = raw, duration
					}
				}
				start, end := tenantWindow(k.WindowKind, database.Timestamptz(cp.AsOf.Time.AddDate(0, 0, -180)), cp.AsOf)
				n, err := tx.InsertPlayerTenantScopeScore(ctx, database.InsertPlayerTenantScopeScoreParams{
					GenerationID: generation, TenantID: tenant, RealmID: k.RealmID, PlayerGuid: k.PlayerGuid,
					InstanceName: k.InstanceName, DifficultyName: k.DifficultyName, MaxPlayers: k.MaxPlayers,
					PlayerClass: k.PlayerClass, PlayerSpec: k.PlayerSpec, PlayerSubSpec: k.PlayerSubSpec,
					PerformanceMetric: k.PerformanceMetric, RatingMetric: k.RatingMetric, WindowKind: k.WindowKind,
					WindowStart: start, WindowEnd: end, Score: raidPeak(k.RatingMetric, k.RealmID, k.InstanceName, bosses, raids[k.InstanceName]),
					BestRaw: bestRaw, BestDurationSecs: bestDuration,
				})
				if err != nil {
					return err
				}
				if n != 1 {
					return fmt.Errorf("tenant player raid score write rejected")
				}
				next = projectionCursor{Realm: k.RealmID, Player: k.PlayerGuid, Instance: k.InstanceName,
					Difficulty: k.DifficultyName, Size: k.MaxPlayers, Class: k.PlayerClass, Spec: k.PlayerSpec,
					SubSpec: k.PlayerSubSpec, Metric: k.PerformanceMetric, Rating: k.RatingMetric, Window: k.WindowKind}
			}
		case "guild_scopes":
			keys, err := tx.ListTenantGuildRaidScopeKeys(ctx, database.ListTenantGuildRaidScopeKeysParams{
				GenerationID: generation, TenantID: tenant, AfterRealmID: c.Realm, AfterGuildID: c.Guild,
				AfterInstanceName: c.Instance, AfterDifficultyName: c.Difficulty, AfterMaxPlayers: c.Size,
				AfterRatingMetric: c.Rating, AfterWindowKind: c.Window, BatchSize: projectionPageSize,
			})
			if err != nil {
				return err
			}
			if len(keys) == 0 {
				phase = "scopes_complete"
			}
			for _, k := range keys {
				rows, err := tx.ListTenantGuildRaidBosses(ctx, database.ListTenantGuildRaidBossesParams{
					GenerationID: generation, TenantID: tenant, RealmID: k.RealmID, GuildID: k.GuildID,
					InstanceName: k.InstanceName, DifficultyName: k.DifficultyName, MaxPlayers: k.MaxPlayers,
					RatingMetric: k.RatingMetric, WindowKind: k.WindowKind,
				})
				if err != nil {
					return err
				}
				if len(rows) == 0 || len(rows) > 200 {
					return fmt.Errorf("tenant guild raid boss safety bound exceeded")
				}
				bosses := make([]tenantScopeBoss, 0, len(rows))
				for _, row := range rows {
					bosses = append(bosses, tenantScopeBoss{instance: k.InstanceName, encounter: row.EncounterName, score: row.Score})
				}
				raids, err := tenantScopeScores(k.RatingMetric, bosses)
				if err != nil {
					return err
				}
				start, end := tenantWindow(k.WindowKind, database.Timestamptz(cp.AsOf.Time.AddDate(0, 0, -180)), cp.AsOf)
				n, err := tx.InsertGuildTenantScopeScore(ctx, database.InsertGuildTenantScopeScoreParams{
					GenerationID: generation, TenantID: tenant, RealmID: k.RealmID, GuildID: k.GuildID,
					InstanceName: k.InstanceName, DifficultyName: k.DifficultyName, MaxPlayers: k.MaxPlayers,
					RatingMetric: k.RatingMetric, WindowKind: k.WindowKind, WindowStart: start, WindowEnd: end,
					Score: raidPeak(k.RatingMetric, k.RealmID, k.InstanceName, bosses, raids[k.InstanceName]),
				})
				if err != nil {
					return err
				}
				if n != 1 {
					return fmt.Errorf("tenant guild raid score write rejected")
				}
				next = projectionCursor{Realm: k.RealmID, Guild: k.GuildID, Instance: k.InstanceName,
					Difficulty: k.DifficultyName, Size: k.MaxPlayers, Rating: k.RatingMetric, Window: k.WindowKind}
			}
		default:
			return fmt.Errorf("tenant scope projection cannot process phase %q", phase)
		}
		encoded, err := json.Marshal(next)
		if err != nil {
			return err
		}
		n, err := tx.AdvanceRatingRebuildCheckpoint(ctx, database.AdvanceRatingRebuildCheckpointParams{
			TenantID: tenant, GenerationID: generation, ExpectedPhase: cp.Phase, ExpectedCursor: cp.Cursor,
			NextPhase: phase, NextCursor: encoded,
		})
		if err != nil {
			return err
		}
		if n != 1 {
			return fmt.Errorf("tenant scope checkpoint changed")
		}
		return nil
	}, nil)
}
