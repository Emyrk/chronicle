package ratingmath

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/Emyrk/chronicle/database"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
)

const livePeakSubjectPageSize int32 = 16

type livePeakRosterKey struct {
	realm uuid.UUID
	raid  string
}

// RefreshDirtyTenantPeak advances one cohort and one bounded subject page in
// a transaction. Revision changes reset the saved cursor on the next pass.
// The one tenant-wide denominator includes guildless clean boss kills.
func RefreshDirtyTenantPeak(ctx context.Context, store database.Store, tenant uuid.UUID, now time.Time) (int, error) {
	var processed int
	err := store.InTx(ctx, func(tx database.Store) error {
		if _, err := tx.LockTenantRatingRevision(ctx, tenant); err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				return nil
			}
			return err
		}
		building, err := tx.TenantRatingGenerationBuilding(ctx, tenant)
		if err != nil {
			return err
		}
		if building {
			return nil
		}
		ready, err := tx.TenantLiveEvidenceReady(ctx, tenant)
		if err != nil {
			return err
		}
		if !ready {
			return nil
		}
		generation, err := tx.LockActiveTenantRatingGeneration(ctx, tenant)
		if errors.Is(err, pgx.ErrNoRows) {
			return nil
		}
		if err != nil {
			return err
		}
		cp, err := tx.GetRatingRebuildCheckpoint(ctx, database.GetRatingRebuildCheckpointParams{
			TenantID: tenant, GenerationID: generation,
		})
		if err != nil {
			return err
		}
		if _, err := tenantMasteryPolicy(cp, tenant); err != nil {
			return err
		}
		rosters, err := livePeakRosters(cp)
		if err != nil {
			return err
		}
		cohorts, err := tx.LockDirtyPeakCohorts(ctx, database.LockDirtyPeakCohortsParams{
			TenantID: tenant, BatchSize: 1,
		})
		if err != nil {
			return err
		}
		for _, cohort := range cohorts {
			if err := refreshLivePeakCohortPage(ctx, tx, generation, cohort, rosters, now); err != nil {
				return err
			}
			processed++
		}
		return nil
	}, nil)
	if err != nil {
		return 0, err
	}
	return processed, nil
}

func livePeakRosters(cp database.RatingRebuildCheckpoint) (map[livePeakRosterKey][]string, error) {
	var manifest struct {
		RenownBosses []struct {
			Realm     uuid.UUID `json:"realm_id"`
			Instance  string    `json:"instance_name"`
			Encounter string    `json:"encounter_name"`
		} `json:"renown_bosses"`
	}
	if err := json.Unmarshal(cp.Manifest, &manifest); err != nil {
		return nil, err
	}
	rosters := make(map[livePeakRosterKey][]string)
	for _, boss := range manifest.RenownBosses {
		key := livePeakRosterKey{boss.Realm, boss.Instance}
		rosters[key] = append(rosters[key], boss.Encounter)
	}
	return rosters, nil
}

func refreshLivePeakCohortPage(ctx context.Context, tx database.Store, generation uuid.UUID,
	key database.LockDirtyPeakCohortsRow, rosters map[livePeakRosterKey][]string, now time.Time) error {
	if key.SubjectKind != "player" && key.SubjectKind != "guild" {
		return fmt.Errorf("invalid peak subject kind %q", key.SubjectKind)
	}
	var afterRealm uuid.UUID
	var afterSubject string
	progress, err := tx.GetLivePeakCohortPage(ctx, database.GetLivePeakCohortPageParams{
		TenantID: key.TenantID, SubjectKind: key.SubjectKind,
		InstanceName: key.InstanceName, EncounterName: key.EncounterName,
		DifficultyName: key.DifficultyName, MaxPlayers: key.MaxPlayers,
		PlayerClass: key.PlayerClass, PlayerSpec: key.PlayerSpec,
		PlayerSubSpec: key.PlayerSubSpec, PerformanceMetric: key.PerformanceMetric,
	})
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		return err
	}
	if err == nil && progress.Revision == key.Revision {
		afterRealm, afterSubject = progress.AfterRealmID, progress.AfterSubjectID
	}
	periodStart := now.AddDate(0, 0, -180)
	ranks, err := tx.CalculateLivePeakCohortDenominators(ctx, database.CalculateLivePeakCohortDenominatorsParams{
		TenantID: key.TenantID, SubjectKind: key.SubjectKind,
		InstanceName: key.InstanceName, EncounterName: key.EncounterName,
		DifficultyName: key.DifficultyName, MaxPlayers: key.MaxPlayers,
		PlayerClass: key.PlayerClass, PlayerSpec: key.PlayerSpec,
		PlayerSubSpec: key.PlayerSubSpec, PerformanceMetric: key.PerformanceMetric,
		PeriodStart: database.Timestamptz(periodStart), AsOf: database.Timestamptz(now),
	})
	if err != nil {
		return err
	}
	var allTime, period float64
	if key.SubjectKind == "player" {
		allTime, period = ranks.PlayerAllTime, ranks.PlayerPeriod
	} else {
		allTime, period = ranks.GuildAllTime, ranks.GuildPeriod
	}
	for _, window := range []struct {
		name       string
		raw        float64
		start, end pgtype.Timestamptz
	}{
		{"all_time", allTime, pgtype.Timestamptz{}, pgtype.Timestamptz{}},
		{"period", period, database.Timestamptz(periodStart), database.Timestamptz(now)},
	} {
		if window.raw == 0 {
			if err := tx.DeleteLivePeakCohortDenominator(ctx, database.DeleteLivePeakCohortDenominatorParams{
				GenerationID: generation, TenantID: key.TenantID, SubjectKind: key.SubjectKind,
				InstanceName: key.InstanceName, EncounterName: key.EncounterName,
				DifficultyName: key.DifficultyName, MaxPlayers: key.MaxPlayers,
				PlayerClass: key.PlayerClass, PlayerSpec: key.PlayerSpec,
				PlayerSubSpec: key.PlayerSubSpec, PerformanceMetric: key.PerformanceMetric,
				WindowKind: window.name,
			}); err != nil {
				return err
			}
			continue
		}
		n, err := tx.UpsertLivePeakCohortDenominator(ctx, database.UpsertLivePeakCohortDenominatorParams{
			GenerationID: generation, TenantID: key.TenantID, SubjectKind: key.SubjectKind,
			InstanceName: key.InstanceName, EncounterName: key.EncounterName,
			DifficultyName: key.DifficultyName, MaxPlayers: key.MaxPlayers,
			PlayerClass: key.PlayerClass, PlayerSpec: key.PlayerSpec,
			PlayerSubSpec: key.PlayerSubSpec, PerformanceMetric: key.PerformanceMetric,
			WindowKind: window.name, WindowStart: window.start, WindowEnd: window.end,
			RankOneRaw: window.raw,
		})
		if err != nil {
			return err
		}
		if n != 1 {
			return errors.New("active peak cohort denominator rejected")
		}
	}
	var count int
	if key.SubjectKind == "player" {
		rows, err := tx.ListLivePeakPlayerSubjectPage(ctx, database.ListLivePeakPlayerSubjectPageParams{
			GenerationID: generation, TenantID: key.TenantID,
			InstanceName: key.InstanceName, EncounterName: key.EncounterName,
			DifficultyName: key.DifficultyName, MaxPlayers: key.MaxPlayers,
			PlayerClass: key.PlayerClass, PlayerSpec: key.PlayerSpec,
			PlayerSubSpec: key.PlayerSubSpec, PerformanceMetric: key.PerformanceMetric,
			AfterRealmID: afterRealm, AfterSubjectID: afterSubject,
			BatchSize: livePeakSubjectPageSize,
		})
		if err != nil {
			return err
		}
		count = len(rows)
		for _, row := range rows {
			if err := refreshLivePeakPlayer(ctx, tx, generation, key, row.RealmID, row.SubjectID,
				allTime, period, rosters[livePeakRosterKey{row.RealmID, key.InstanceName}], now); err != nil {
				return err
			}
		}
		if count > 0 {
			afterRealm, afterSubject = rows[count-1].RealmID, rows[count-1].SubjectID
		}
	} else {
		guildCursor := uuid.Nil
		if afterSubject != "" {
			var err error
			guildCursor, err = uuid.Parse(afterSubject)
			if err != nil {
				return err
			}
		}
		rows, err := tx.ListLivePeakGuildSubjectPage(ctx, database.ListLivePeakGuildSubjectPageParams{
			GenerationID: generation, TenantID: key.TenantID,
			InstanceName: key.InstanceName, EncounterName: key.EncounterName,
			DifficultyName: key.DifficultyName, MaxPlayers: key.MaxPlayers,
			AfterRealmID: afterRealm, AfterSubjectID: guildCursor,
			BatchSize: livePeakSubjectPageSize,
		})
		if err != nil {
			return err
		}
		count = len(rows)
		for _, row := range rows {
			if !row.SubjectID.Valid {
				return errors.New("peak subject page returned a null guild")
			}
			if err := refreshLivePeakGuild(ctx, tx, generation, key, row.RealmID, row.SubjectID.UUID,
				allTime, period, rosters[livePeakRosterKey{row.RealmID, key.InstanceName}], now); err != nil {
				return err
			}
		}
		if count > 0 {
			afterRealm, afterSubject = rows[count-1].RealmID, rows[count-1].SubjectID.UUID.String()
		}
	}
	if count < int(livePeakSubjectPageSize) {
		n, err := tx.DeleteDirtyPeakCohortIfRevision(ctx, database.DeleteDirtyPeakCohortIfRevisionParams(key))
		if err != nil {
			return err
		}
		if n != 1 {
			return errors.New("peak cohort changed during refresh")
		}
		return nil
	}
	return tx.UpsertLivePeakCohortPage(ctx, database.UpsertLivePeakCohortPageParams{
		TenantID: key.TenantID, SubjectKind: key.SubjectKind,
		InstanceName: key.InstanceName, EncounterName: key.EncounterName,
		DifficultyName: key.DifficultyName, MaxPlayers: key.MaxPlayers,
		PlayerClass: key.PlayerClass, PlayerSpec: key.PlayerSpec,
		PlayerSubSpec: key.PlayerSubSpec, PerformanceMetric: key.PerformanceMetric,
		Revision: key.Revision, AfterRealmID: afterRealm, AfterSubjectID: afterSubject,
	})
}

func refreshLivePeakPlayer(ctx context.Context, tx database.Store, generation uuid.UUID,
	key database.LockDirtyPeakCohortsRow, realm uuid.UUID, subject string,
	allRank, periodRank float64, roster []string, now time.Time) error {
	best, err := tx.CalculateLivePeakPlayerBest(ctx, database.CalculateLivePeakPlayerBestParams{
		TenantID: key.TenantID, RealmID: realm, SubjectID: subject,
		InstanceName: key.InstanceName, EncounterName: key.EncounterName,
		DifficultyName: key.DifficultyName, MaxPlayers: key.MaxPlayers,
		PlayerClass: key.PlayerClass, PlayerSpec: key.PlayerSpec,
		PlayerSubSpec: key.PlayerSubSpec, PerformanceMetric: key.PerformanceMetric,
		PeriodStart: database.Timestamptz(now.AddDate(0, 0, -180)), AsOf: database.Timestamptz(now),
	})
	if err != nil {
		return err
	}
	if err := tx.DeleteLivePeakPlayerScores(ctx, database.DeleteLivePeakPlayerScoresParams{
		GenerationID: generation, TenantID: key.TenantID, RealmID: realm, SubjectID: subject,
		InstanceName: key.InstanceName, EncounterName: key.EncounterName,
		DifficultyName: key.DifficultyName, MaxPlayers: key.MaxPlayers,
		PlayerClass: key.PlayerClass, PlayerSpec: key.PlayerSpec,
		PlayerSubSpec: key.PlayerSubSpec, PerformanceMetric: key.PerformanceMetric,
	}); err != nil {
		return err
	}
	for _, window := range []struct {
		kind                string
		raw, rank, duration float64
		start, end          pgtype.Timestamptz
	}{
		{"all_time", best.AllTimeRaw, allRank, best.AllTimeDurationSecs, pgtype.Timestamptz{}, pgtype.Timestamptz{}},
		{"period", best.PeriodRaw, periodRank, best.PeriodDurationSecs, database.Timestamptz(now.AddDate(0, 0, -180)), database.Timestamptz(now)},
	} {
		if window.raw > 0 {
			score, err := Peak(window.raw, window.rank)
			if err != nil {
				return err
			}
			n, err := tx.InsertLivePeakPlayerScore(ctx, database.InsertLivePeakPlayerScoreParams{
				GenerationID: generation, TenantID: key.TenantID, RealmID: realm,
				SubjectID: subject, InstanceName: key.InstanceName, EncounterName: key.EncounterName,
				DifficultyName: key.DifficultyName, MaxPlayers: key.MaxPlayers,
				PlayerClass: key.PlayerClass, PlayerSpec: key.PlayerSpec,
				PlayerSubSpec: key.PlayerSubSpec, PerformanceMetric: key.PerformanceMetric,
				WindowKind: window.kind, WindowStart: window.start, WindowEnd: window.end,
				Score: score, BestRaw: window.raw, RankOneRaw: window.rank,
				BestDurationSecs: window.duration,
			})
			if err != nil {
				return err
			}
			if n != 1 {
				return errors.New("active player peak score rejected")
			}
		}
		if err := refreshLivePeakPlayerScope(ctx, tx, generation, key, realm, subject,
			window.kind, window.start, window.end, roster); err != nil {
			return err
		}
	}
	return nil
}

func refreshLivePeakGuild(ctx context.Context, tx database.Store, generation uuid.UUID,
	key database.LockDirtyPeakCohortsRow, realm, guild uuid.UUID,
	allRank, periodRank float64, roster []string, now time.Time) error {
	best, err := tx.CalculateLivePeakGuildBest(ctx, database.CalculateLivePeakGuildBestParams{
		TenantID: key.TenantID, RealmID: realm, GuildID: uuid.NullUUID{UUID: guild, Valid: true},
		InstanceName: key.InstanceName, EncounterName: key.EncounterName,
		DifficultyName: key.DifficultyName, MaxPlayers: key.MaxPlayers,
		PeriodStart: database.Timestamptz(now.AddDate(0, 0, -180)), AsOf: database.Timestamptz(now),
	})
	if err != nil {
		return err
	}
	if err := tx.DeleteLivePeakGuildScores(ctx, database.DeleteLivePeakGuildScoresParams{
		GenerationID: generation, TenantID: key.TenantID, RealmID: realm, GuildID: guild,
		InstanceName: key.InstanceName, EncounterName: key.EncounterName,
		DifficultyName: key.DifficultyName, MaxPlayers: key.MaxPlayers,
	}); err != nil {
		return err
	}
	for _, window := range []struct {
		kind       string
		raw, rank  float64
		start, end pgtype.Timestamptz
	}{
		{"all_time", best.AllTimeRaw, allRank, pgtype.Timestamptz{}, pgtype.Timestamptz{}},
		{"period", best.PeriodRaw, periodRank, database.Timestamptz(now.AddDate(0, 0, -180)), database.Timestamptz(now)},
	} {
		if window.raw > 0 {
			score, err := PeakTime(window.raw, window.rank)
			if err != nil {
				return err
			}
			n, err := tx.InsertLivePeakGuildScore(ctx, database.InsertLivePeakGuildScoreParams{
				GenerationID: generation, TenantID: key.TenantID, RealmID: realm,
				GuildID: guild, InstanceName: key.InstanceName, EncounterName: key.EncounterName,
				DifficultyName: key.DifficultyName, MaxPlayers: key.MaxPlayers,
				WindowKind: window.kind, WindowStart: window.start, WindowEnd: window.end,
				Score: score, BestRaw: window.raw, RankOneRaw: window.rank,
			})
			if err != nil {
				return err
			}
			if n != 1 {
				return fmt.Errorf("active guild peak score rejected for %s/%s: guild %s realm %s gen %s", key.InstanceName, window.kind, guild, realm, generation)
			}
		}
		if err := refreshLivePeakGuildScope(ctx, tx, generation, key, realm, guild,
			window.kind, window.start, window.end, roster); err != nil {
			return err
		}
	}
	return nil
}

func refreshLivePeakPlayerScope(ctx context.Context, tx database.Store, generation uuid.UUID,
	key database.LockDirtyPeakCohortsRow, realm uuid.UUID, subject, window string,
	start, end pgtype.Timestamptz, roster []string) error {
	if err := tx.DeleteLivePeakPlayerScope(ctx, database.DeleteLivePeakPlayerScopeParams{
		GenerationID: generation, TenantID: key.TenantID, RealmID: realm,
		SubjectID: subject, InstanceName: key.InstanceName,
		DifficultyName: key.DifficultyName, MaxPlayers: key.MaxPlayers,
		PlayerClass: key.PlayerClass, PlayerSpec: key.PlayerSpec,
		PlayerSubSpec: key.PlayerSubSpec, PerformanceMetric: key.PerformanceMetric,
		WindowKind: window,
	}); err != nil {
		return err
	}
	rows, err := tx.ListTenantPlayerRaidBosses(ctx, database.ListTenantPlayerRaidBossesParams{
		GenerationID: generation, TenantID: key.TenantID, RealmID: realm,
		PlayerGuid: subject, InstanceName: key.InstanceName,
		DifficultyName: key.DifficultyName, MaxPlayers: key.MaxPlayers,
		PlayerClass: key.PlayerClass, PlayerSpec: key.PlayerSpec,
		PlayerSubSpec: key.PlayerSubSpec, PerformanceMetric: key.PerformanceMetric,
		RatingMetric: "peak", WindowKind: window,
	})
	if err != nil {
		return err
	}
	if len(rows) > 200 {
		return errors.New("too many player peak raid bosses")
	}
	if len(rows) == 0 {
		return nil
	}
	bosses := make([]tenantScopeBoss, 0, len(rows))
	for _, row := range rows {
		bosses = append(bosses, tenantScopeBoss{
			instance: key.InstanceName, encounter: row.EncounterName,
			score: row.Score, raw: row.BestRaw.Float64, duration: row.BestDurationSecs,
		})
	}
	scopes, err := tenantScopeScores("peak", bosses)
	if err != nil {
		return err
	}
	score := scopes[key.InstanceName]
	if rosterScore, ok := tenantRaidPeak(bosses, roster); ok {
		score = rosterScore
	}
	raw, duration, ok := tenantScopeThroughput(bosses)
	if !ok {
		raw, duration = 0, 0
	}
	n, err := tx.InsertLivePeakPlayerScope(ctx, database.InsertLivePeakPlayerScopeParams{
		GenerationID: generation, TenantID: key.TenantID, RealmID: realm,
		SubjectID: subject, InstanceName: key.InstanceName,
		DifficultyName: key.DifficultyName, MaxPlayers: key.MaxPlayers,
		PlayerClass: key.PlayerClass, PlayerSpec: key.PlayerSpec,
		PlayerSubSpec: key.PlayerSubSpec, PerformanceMetric: key.PerformanceMetric,
		WindowKind: window, WindowStart: start, WindowEnd: end,
		Score: score, BestRaw: raw, BestDurationSecs: duration,
	})
	if err != nil {
		return err
	}
	if n != 1 {
		return errors.New("active player peak raid score rejected")
	}
	return nil
}

func refreshLivePeakGuildScope(ctx context.Context, tx database.Store, generation uuid.UUID,
	key database.LockDirtyPeakCohortsRow, realm, guild uuid.UUID, window string,
	start, end pgtype.Timestamptz, roster []string) error {
	if err := tx.DeleteLivePeakGuildScope(ctx, database.DeleteLivePeakGuildScopeParams{
		GenerationID: generation, TenantID: key.TenantID, RealmID: realm,
		GuildID: guild, InstanceName: key.InstanceName,
		DifficultyName: key.DifficultyName, MaxPlayers: key.MaxPlayers,
		WindowKind: window,
	}); err != nil {
		return err
	}
	rows, err := tx.ListTenantGuildRaidBosses(ctx, database.ListTenantGuildRaidBossesParams{
		GenerationID: generation, TenantID: key.TenantID, RealmID: realm,
		GuildID: guild, InstanceName: key.InstanceName,
		DifficultyName: key.DifficultyName, MaxPlayers: key.MaxPlayers,
		RatingMetric: "peak", WindowKind: window,
	})
	if err != nil {
		return err
	}
	if len(rows) > 200 {
		return errors.New("too many guild peak raid bosses")
	}
	if len(rows) == 0 {
		return nil
	}
	bosses := make([]tenantScopeBoss, 0, len(rows))
	for _, row := range rows {
		bosses = append(bosses, tenantScopeBoss{instance: key.InstanceName, encounter: row.EncounterName, score: row.Score})
	}
	scopes, err := tenantScopeScores("peak", bosses)
	if err != nil {
		return err
	}
	score := scopes[key.InstanceName]
	if rosterScore, ok := tenantRaidPeak(bosses, roster); ok {
		score = rosterScore
	}
	n, err := tx.InsertLivePeakGuildScope(ctx, database.InsertLivePeakGuildScopeParams{
		GenerationID: generation, TenantID: key.TenantID, RealmID: realm,
		GuildID: guild, InstanceName: key.InstanceName,
		DifficultyName: key.DifficultyName, MaxPlayers: key.MaxPlayers,
		WindowKind: window, WindowStart: start, WindowEnd: end, Score: score,
	})
	if err != nil {
		return err
	}
	if n != 1 {
		return errors.New("active guild peak raid score rejected")
	}
	return nil
}
