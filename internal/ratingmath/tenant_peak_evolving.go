package ratingmath

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/Emyrk/chronicle/database"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
)

// RefreshEvolvingTenantPeak applies one bounded dirty page to generation-free tenant scores.
func RefreshEvolvingTenantPeak(ctx context.Context, store database.Store, tenant uuid.UUID, now time.Time) (int, error) {
	var processed int
	err := store.InTx(ctx, func(tx database.Store) error {
		manifest, err := currentEvolvingTenantRatingPolicy(ctx, tx, tenant)
		if err != nil {
			return err
		}
		rosters := evolvingLivePeakRosters(manifest)
		cohorts, err := tx.LockDirtyPeakCohorts(ctx, database.LockDirtyPeakCohortsParams{
			TenantID: tenant, BatchSize: 1,
		})
		if err != nil {
			return err
		}
		for _, cohort := range cohorts {
			if err := evolvingRefreshLivePeakCohortPage(ctx, tx, cohort, rosters, now); err != nil {
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

func evolvingLivePeakRosters(manifest evolvingTenantRatingManifest) map[livePeakRosterKey][]string {
	rosters := make(map[livePeakRosterKey][]string)
	for _, boss := range manifest.Bosses {
		key := livePeakRosterKey{boss.Realm, boss.Instance}
		rosters[key] = append(rosters[key], boss.Encounter)
	}
	return rosters
}

func evolvingRefreshLivePeakCohortPage(ctx context.Context, tx database.Store,
	key database.LockDirtyPeakCohortsRow, rosters map[livePeakRosterKey][]string, now time.Time) error {
	if key.SubjectKind != "player" && key.SubjectKind != "guild" {
		return fmt.Errorf("invalid peak subject kind %q", key.SubjectKind)
	}
	var afterRealm uuid.UUID
	var afterSubject string
	progress, err := tx.EvolvingGetLivePeakCohortPage(ctx, database.EvolvingGetLivePeakCohortPageParams{
		TenantID: key.TenantID, SubjectKind: key.SubjectKind,
		InstanceName: key.InstanceName, EncounterName: key.EncounterName,
		DifficultyName: key.DifficultyName, MaxPlayers: key.MaxPlayers,
		PlayerClass: key.PlayerClass, PlayerSpec: key.PlayerSpec,
		PlayerSubSpec: key.PlayerSubSpec, PerformanceMetric: key.PerformanceMetric,
	})
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		return err
	}
	samePage := err == nil && progress.Revision == key.Revision
	if samePage {
		afterRealm, afterSubject = progress.AfterRealmID, progress.AfterSubjectID
	}
	periodStart := now.AddDate(0, 0, -180)
	var allTime, period float64
	cached := false
	if samePage {
		denominators, err := tx.EvolvingGetLivePeakCohortDenominators(ctx, database.EvolvingGetLivePeakCohortDenominatorsParams{
			TenantID: key.TenantID, SubjectKind: key.SubjectKind,
			InstanceName: key.InstanceName, EncounterName: key.EncounterName,
			DifficultyName: key.DifficultyName, MaxPlayers: key.MaxPlayers,
			PlayerClass: key.PlayerClass, PlayerSpec: key.PlayerSpec,
			PlayerSubSpec: key.PlayerSubSpec, PerformanceMetric: key.PerformanceMetric,
		})
		if err != nil {
			return err
		}
		if denominators.AllTimeRaw > 0 && denominators.PeriodRaw > 0 &&
			denominators.PeriodStart.Valid && denominators.AsOf.Valid {
			allTime, period = denominators.AllTimeRaw, denominators.PeriodRaw
			periodStart, now = denominators.PeriodStart.Time, denominators.AsOf.Time
			cached = true
		}
	}
	if !cached {
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
		if key.SubjectKind == "player" {
			allTime, period = ranks.PlayerAllTime, ranks.PlayerPeriod
		} else {
			allTime, period = ranks.GuildAllTime, ranks.GuildPeriod
		}
	}
	if !cached {
		for _, window := range []struct {
			name       string
			raw        float64
			start, end pgtype.Timestamptz
		}{
			{"all_time", allTime, pgtype.Timestamptz{}, pgtype.Timestamptz{}},
			{"period", period, database.Timestamptz(periodStart), database.Timestamptz(now)},
		} {
			if window.raw == 0 {
				if err := tx.EvolvingDeleteLivePeakCohortDenominator(ctx, database.EvolvingDeleteLivePeakCohortDenominatorParams{
					TenantID: key.TenantID, SubjectKind: key.SubjectKind,
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
			n, err := tx.EvolvingUpsertLivePeakCohortDenominator(ctx, database.EvolvingUpsertLivePeakCohortDenominatorParams{
				TenantID: key.TenantID, SubjectKind: key.SubjectKind,
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
	}
	var count int
	if key.SubjectKind == "player" {
		rows, err := tx.EvolvingListLivePeakPlayerSubjectPage(ctx, database.EvolvingListLivePeakPlayerSubjectPageParams{
			TenantID:     key.TenantID,
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
			if err := evolvingRefreshLivePeakPlayer(ctx, tx, key, row.RealmID, row.SubjectID,
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
		rows, err := tx.EvolvingListLivePeakGuildSubjectPage(ctx, database.EvolvingListLivePeakGuildSubjectPageParams{
			TenantID:     key.TenantID,
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
			if err := evolvingRefreshLivePeakGuild(ctx, tx, key, row.RealmID, row.SubjectID.UUID,
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
	return tx.EvolvingUpsertLivePeakCohortPage(ctx, database.EvolvingUpsertLivePeakCohortPageParams{
		TenantID: key.TenantID, SubjectKind: key.SubjectKind,
		InstanceName: key.InstanceName, EncounterName: key.EncounterName,
		DifficultyName: key.DifficultyName, MaxPlayers: key.MaxPlayers,
		PlayerClass: key.PlayerClass, PlayerSpec: key.PlayerSpec,
		PlayerSubSpec: key.PlayerSubSpec, PerformanceMetric: key.PerformanceMetric,
		Revision:     key.Revision,
		AfterRealmID: afterRealm, AfterSubjectID: afterSubject,
	})
}

func evolvingRefreshLivePeakPlayer(ctx context.Context, tx database.Store,
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
	if err := tx.EvolvingDeleteLivePeakPlayerScores(ctx, database.EvolvingDeleteLivePeakPlayerScoresParams{
		TenantID: key.TenantID, RealmID: realm, SubjectID: subject,
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
			n, err := tx.EvolvingInsertLivePeakPlayerScore(ctx, database.EvolvingInsertLivePeakPlayerScoreParams{
				TenantID: key.TenantID, RealmID: realm,
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
		if err := evolvingRefreshLivePeakPlayerScope(ctx, tx, key, realm, subject,
			window.kind, window.start, window.end, roster); err != nil {
			return err
		}
	}
	return nil
}

func evolvingRefreshLivePeakGuild(ctx context.Context, tx database.Store,
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
	if err := tx.EvolvingDeleteLivePeakGuildScores(ctx, database.EvolvingDeleteLivePeakGuildScoresParams{
		TenantID: key.TenantID, RealmID: realm, GuildID: guild,
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
			n, err := tx.EvolvingInsertLivePeakGuildScore(ctx, database.EvolvingInsertLivePeakGuildScoreParams{
				TenantID: key.TenantID, RealmID: realm,
				GuildID: guild, InstanceName: key.InstanceName, EncounterName: key.EncounterName,
				DifficultyName: key.DifficultyName, MaxPlayers: key.MaxPlayers,
				WindowKind: window.kind, WindowStart: window.start, WindowEnd: window.end,
				Score: score, BestRaw: window.raw, RankOneRaw: window.rank,
			})
			if err != nil {
				return err
			}
			if n != 1 {
				return fmt.Errorf("active guild peak score rejected for %s/%s: guild %s realm %s ", key.InstanceName, window.kind, guild, realm)
			}
		}
		if err := evolvingRefreshLivePeakGuildScope(ctx, tx, key, realm, guild,
			window.kind, window.start, window.end, roster); err != nil {
			return err
		}
	}
	return nil
}

func evolvingRefreshLivePeakPlayerScope(ctx context.Context, tx database.Store,
	key database.LockDirtyPeakCohortsRow, realm uuid.UUID, subject, window string,
	start, end pgtype.Timestamptz, roster []string) error {
	if err := tx.EvolvingDeleteLivePeakPlayerScope(ctx, database.EvolvingDeleteLivePeakPlayerScopeParams{
		TenantID: key.TenantID, RealmID: realm,
		SubjectID: subject, InstanceName: key.InstanceName,
		DifficultyName: key.DifficultyName, MaxPlayers: key.MaxPlayers,
		PlayerClass: key.PlayerClass, PlayerSpec: key.PlayerSpec,
		PlayerSubSpec: key.PlayerSubSpec, PerformanceMetric: key.PerformanceMetric,
		WindowKind: window,
	}); err != nil {
		return err
	}
	rows, err := tx.EvolvingListTenantPlayerRaidBosses(ctx, database.EvolvingListTenantPlayerRaidBossesParams{
		TenantID: key.TenantID, RealmID: realm,
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
			score: row.Score, raw: row.BestRaw.Float64, duration: row.BestDurationSecs.Float64,
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
	n, err := tx.EvolvingInsertLivePeakPlayerScope(ctx, database.EvolvingInsertLivePeakPlayerScopeParams{
		TenantID: key.TenantID, RealmID: realm,
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

func evolvingRefreshLivePeakGuildScope(ctx context.Context, tx database.Store,
	key database.LockDirtyPeakCohortsRow, realm, guild uuid.UUID, window string,
	start, end pgtype.Timestamptz, roster []string) error {
	if err := tx.EvolvingDeleteLivePeakGuildScope(ctx, database.EvolvingDeleteLivePeakGuildScopeParams{
		TenantID: key.TenantID, RealmID: realm,
		GuildID: guild, InstanceName: key.InstanceName,
		DifficultyName: key.DifficultyName, MaxPlayers: key.MaxPlayers,
		WindowKind: window,
	}); err != nil {
		return err
	}
	rows, err := tx.EvolvingListTenantGuildRaidBosses(ctx, database.EvolvingListTenantGuildRaidBossesParams{
		TenantID: key.TenantID, RealmID: realm,
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
	n, err := tx.EvolvingInsertLivePeakGuildScope(ctx, database.EvolvingInsertLivePeakGuildScopeParams{
		TenantID: key.TenantID, RealmID: realm,
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
