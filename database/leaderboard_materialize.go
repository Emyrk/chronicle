package database

import (
	"context"
	"github.com/google/uuid"
)

// Materialize compatibility methods intentionally remain unfenced manual tools.
// Each compute has one coherent evidence/provenance snapshot; publication does
// not reread evidence. Callers requiring atomic multiple operations own a transaction.
// Runtime D2 must use guarded Publish methods, never these manual entry points.
type manualMaterializer interface {
	MaterializeLeaderboardPlayerBossBenchmark(context.Context, MaterializeLeaderboardPlayerBossBenchmarkParams) error
	MaterializeLeaderboardPlayerBossSubject(context.Context, MaterializeLeaderboardPlayerBossSubjectParams) error
	MaterializeLeaderboardGuildBossBenchmark(context.Context, MaterializeLeaderboardGuildBossBenchmarkParams) error
	MaterializeLeaderboardGuildBossSubject(context.Context, MaterializeLeaderboardGuildBossSubjectParams) error
	MaterializeLeaderboardGuildClearBenchmark(context.Context, MaterializeLeaderboardGuildClearBenchmarkParams) error
	MaterializeLeaderboardGuildClearSubject(context.Context, MaterializeLeaderboardGuildClearSubjectParams) error
	MaterializeLeaderboardPlayerRenownCount(context.Context, MaterializeLeaderboardPlayerRenownCountParams) error
	MaterializeLeaderboardGuildRenownCount(context.Context, MaterializeLeaderboardGuildRenownCountParams) error
}

type MaterializeLeaderboardPlayerBossBenchmarkParams struct {
	TenantID          uuid.UUID `db:"tenant_id" json:"tenant_id"`
	InstanceName      string    `db:"instance_name" json:"instance_name"`
	DifficultyName    string    `db:"difficulty_name" json:"difficulty_name"`
	MaxPlayers        int16     `db:"max_players" json:"max_players"`
	EncounterName     string    `db:"encounter_name" json:"encounter_name"`
	PlayerClass       string    `db:"player_class" json:"player_class"`
	PlayerSpec        string    `db:"player_spec" json:"player_spec"`
	PlayerSubSpec     string    `db:"player_sub_spec" json:"player_sub_spec"`
	Metric            string    `db:"metric" json:"metric"`
	ProjectionVersion int32     `db:"projection_version" json:"projection_version"`
	AlgorithmVersion  int32     `db:"algorithm_version" json:"algorithm_version"`
}

type MaterializeLeaderboardPlayerBossSubjectParams struct {
	TenantID          uuid.UUID `db:"tenant_id" json:"tenant_id"`
	InstanceName      string    `db:"instance_name" json:"instance_name"`
	DifficultyName    string    `db:"difficulty_name" json:"difficulty_name"`
	MaxPlayers        int16     `db:"max_players" json:"max_players"`
	EncounterName     string    `db:"encounter_name" json:"encounter_name"`
	PlayerClass       string    `db:"player_class" json:"player_class"`
	PlayerSpec        string    `db:"player_spec" json:"player_spec"`
	PlayerSubSpec     string    `db:"player_sub_spec" json:"player_sub_spec"`
	Metric            string    `db:"metric" json:"metric"`
	RealmID           uuid.UUID `db:"realm_id" json:"realm_id"`
	PlayerGuid        string    `db:"player_guid" json:"player_guid"`
	ProjectionVersion int32     `db:"projection_version" json:"projection_version"`
	AlgorithmVersion  int32     `db:"algorithm_version" json:"algorithm_version"`
}

type MaterializeLeaderboardGuildBossBenchmarkParams struct {
	TenantID          uuid.UUID `db:"tenant_id" json:"tenant_id"`
	InstanceName      string    `db:"instance_name" json:"instance_name"`
	DifficultyName    string    `db:"difficulty_name" json:"difficulty_name"`
	MaxPlayers        int16     `db:"max_players" json:"max_players"`
	EncounterName     string    `db:"encounter_name" json:"encounter_name"`
	ProjectionVersion int32     `db:"projection_version" json:"projection_version"`
	AlgorithmVersion  int32     `db:"algorithm_version" json:"algorithm_version"`
}

type MaterializeLeaderboardGuildBossSubjectParams struct {
	TenantID          uuid.UUID `db:"tenant_id" json:"tenant_id"`
	InstanceName      string    `db:"instance_name" json:"instance_name"`
	DifficultyName    string    `db:"difficulty_name" json:"difficulty_name"`
	MaxPlayers        int16     `db:"max_players" json:"max_players"`
	EncounterName     string    `db:"encounter_name" json:"encounter_name"`
	RealmID           uuid.UUID `db:"realm_id" json:"realm_id"`
	GuildID           uuid.UUID `db:"guild_id" json:"guild_id"`
	ProjectionVersion int32     `db:"projection_version" json:"projection_version"`
	AlgorithmVersion  int32     `db:"algorithm_version" json:"algorithm_version"`
}

type MaterializeLeaderboardGuildClearBenchmarkParams struct {
	TenantID          uuid.UUID `db:"tenant_id" json:"tenant_id"`
	InstanceName      string    `db:"instance_name" json:"instance_name"`
	DifficultyName    string    `db:"difficulty_name" json:"difficulty_name"`
	MaxPlayers        int16     `db:"max_players" json:"max_players"`
	ProjectionVersion int32     `db:"projection_version" json:"projection_version"`
	AlgorithmVersion  int32     `db:"algorithm_version" json:"algorithm_version"`
}

type MaterializeLeaderboardGuildClearSubjectParams struct {
	TenantID          uuid.UUID `db:"tenant_id" json:"tenant_id"`
	InstanceName      string    `db:"instance_name" json:"instance_name"`
	DifficultyName    string    `db:"difficulty_name" json:"difficulty_name"`
	MaxPlayers        int16     `db:"max_players" json:"max_players"`
	RealmID           uuid.UUID `db:"realm_id" json:"realm_id"`
	GuildID           uuid.UUID `db:"guild_id" json:"guild_id"`
	ProjectionVersion int32     `db:"projection_version" json:"projection_version"`
	AlgorithmVersion  int32     `db:"algorithm_version" json:"algorithm_version"`
}

type MaterializeLeaderboardPlayerRenownCountParams struct {
	TenantID          uuid.UUID `db:"tenant_id" json:"tenant_id"`
	InstanceName      string    `db:"instance_name" json:"instance_name"`
	DifficultyName    string    `db:"difficulty_name" json:"difficulty_name"`
	MaxPlayers        int16     `db:"max_players" json:"max_players"`
	EncounterName     string    `db:"encounter_name" json:"encounter_name"`
	RealmID           uuid.UUID `db:"realm_id" json:"realm_id"`
	PlayerGuid        string    `db:"player_guid" json:"player_guid"`
	ProjectionVersion int32     `db:"projection_version" json:"projection_version"`
	AlgorithmVersion  int32     `db:"algorithm_version" json:"algorithm_version"`
}

type MaterializeLeaderboardGuildRenownCountParams struct {
	TenantID          uuid.UUID `db:"tenant_id" json:"tenant_id"`
	InstanceName      string    `db:"instance_name" json:"instance_name"`
	DifficultyName    string    `db:"difficulty_name" json:"difficulty_name"`
	MaxPlayers        int16     `db:"max_players" json:"max_players"`
	EncounterName     string    `db:"encounter_name" json:"encounter_name"`
	RealmID           uuid.UUID `db:"realm_id" json:"realm_id"`
	GuildID           uuid.UUID `db:"guild_id" json:"guild_id"`
	ProjectionVersion int32     `db:"projection_version" json:"projection_version"`
	AlgorithmVersion  int32     `db:"algorithm_version" json:"algorithm_version"`
}

func (q *sqlQuerier) MaterializeLeaderboardPlayerBossBenchmark(ctx context.Context, arg MaterializeLeaderboardPlayerBossBenchmarkParams) error {
	var row ComputeLeaderboardPlayerBossBenchmarkRow
	var firstErr error
	results := q.ComputeLeaderboardPlayerBossBenchmark(ctx, []ComputeLeaderboardPlayerBossBenchmarkParams{{TenantID: arg.TenantID, InstanceName: arg.InstanceName, DifficultyName: arg.DifficultyName, MaxPlayers: arg.MaxPlayers, EncounterName: arg.EncounterName, PlayerClass: arg.PlayerClass, PlayerSpec: arg.PlayerSpec, PlayerSubSpec: arg.PlayerSubSpec, Metric: arg.Metric}})
	results.QueryRow(func(_ int, r ComputeLeaderboardPlayerBossBenchmarkRow, err error) {
		row = r
		if firstErr == nil {
			firstErr = err
		}
	})
	closeErr := results.Close()
	if firstErr != nil {
		return firstErr
	}
	if closeErr != nil {
		return closeErr
	}
	published := q.PublishLeaderboardPlayerBossBenchmark(ctx, []PublishLeaderboardPlayerBossBenchmarkParams{{
		TenantID: arg.TenantID, InstanceName: arg.InstanceName, DifficultyName: arg.DifficultyName, MaxPlayers: arg.MaxPlayers, EncounterName: arg.EncounterName, PlayerClass: arg.PlayerClass, PlayerSpec: arg.PlayerSpec, PlayerSubSpec: arg.PlayerSubSpec, Metric: arg.Metric,
		BestMetric:  row.BestMetric,
		HasEvidence: row.HasEvidence, ProjectionVersion: arg.ProjectionVersion, AlgorithmVersion: arg.AlgorithmVersion, UnfencedManual: true,
	}})
	published.Exec(func(_ int, err error) {
		if firstErr == nil {
			firstErr = err
		}
	})
	closeErr = published.Close()
	if firstErr != nil {
		return firstErr
	}
	return closeErr
}

func (q *sqlQuerier) MaterializeLeaderboardPlayerBossSubject(ctx context.Context, arg MaterializeLeaderboardPlayerBossSubjectParams) error {
	var row ComputeLeaderboardPlayerBossSubjectRow
	var firstErr error
	results := q.ComputeLeaderboardPlayerBossSubject(ctx, []ComputeLeaderboardPlayerBossSubjectParams{{TenantID: arg.TenantID, InstanceName: arg.InstanceName, DifficultyName: arg.DifficultyName, MaxPlayers: arg.MaxPlayers, EncounterName: arg.EncounterName, PlayerClass: arg.PlayerClass, PlayerSpec: arg.PlayerSpec, PlayerSubSpec: arg.PlayerSubSpec, Metric: arg.Metric, RealmID: arg.RealmID, PlayerGuid: arg.PlayerGuid}})
	results.QueryRow(func(_ int, r ComputeLeaderboardPlayerBossSubjectRow, err error) {
		row = r
		if firstErr == nil {
			firstErr = err
		}
	})
	closeErr := results.Close()
	if firstErr != nil {
		return firstErr
	}
	if closeErr != nil {
		return closeErr
	}
	published := q.PublishLeaderboardPlayerBossSubject(ctx, []PublishLeaderboardPlayerBossSubjectParams{{
		TenantID: arg.TenantID, InstanceName: arg.InstanceName, DifficultyName: arg.DifficultyName, MaxPlayers: arg.MaxPlayers, EncounterName: arg.EncounterName, PlayerClass: arg.PlayerClass, PlayerSpec: arg.PlayerSpec, PlayerSubSpec: arg.PlayerSubSpec, Metric: arg.Metric, RealmID: arg.RealmID, PlayerGuid: arg.PlayerGuid,
		ObservationCount: row.ObservationCount, RawPeak: row.RawPeak, RawForm: row.RawForm, RawFloor: row.RawFloor, PeakEncounterID: row.PeakEncounterID, PeakDurationMs: row.PeakDurationMs,
		HasEvidence: row.HasEvidence, ProjectionVersion: arg.ProjectionVersion, AlgorithmVersion: arg.AlgorithmVersion, UnfencedManual: true,
	}})
	published.Exec(func(_ int, err error) {
		if firstErr == nil {
			firstErr = err
		}
	})
	closeErr = published.Close()
	if firstErr != nil {
		return firstErr
	}
	return closeErr
}

func (q *sqlQuerier) MaterializeLeaderboardGuildBossBenchmark(ctx context.Context, arg MaterializeLeaderboardGuildBossBenchmarkParams) error {
	var row ComputeLeaderboardGuildBossBenchmarkRow
	var firstErr error
	results := q.ComputeLeaderboardGuildBossBenchmark(ctx, []ComputeLeaderboardGuildBossBenchmarkParams{{TenantID: arg.TenantID, InstanceName: arg.InstanceName, DifficultyName: arg.DifficultyName, MaxPlayers: arg.MaxPlayers, EncounterName: arg.EncounterName}})
	results.QueryRow(func(_ int, r ComputeLeaderboardGuildBossBenchmarkRow, err error) {
		row = r
		if firstErr == nil {
			firstErr = err
		}
	})
	closeErr := results.Close()
	if firstErr != nil {
		return firstErr
	}
	if closeErr != nil {
		return closeErr
	}
	published := q.PublishLeaderboardGuildBossBenchmark(ctx, []PublishLeaderboardGuildBossBenchmarkParams{{
		TenantID: arg.TenantID, InstanceName: arg.InstanceName, DifficultyName: arg.DifficultyName, MaxPlayers: arg.MaxPlayers, EncounterName: arg.EncounterName,
		BestDurationMs: row.BestDurationMs,
		HasEvidence:    row.HasEvidence, ProjectionVersion: arg.ProjectionVersion, AlgorithmVersion: arg.AlgorithmVersion, UnfencedManual: true,
	}})
	published.Exec(func(_ int, err error) {
		if firstErr == nil {
			firstErr = err
		}
	})
	closeErr = published.Close()
	if firstErr != nil {
		return firstErr
	}
	return closeErr
}

func (q *sqlQuerier) MaterializeLeaderboardGuildBossSubject(ctx context.Context, arg MaterializeLeaderboardGuildBossSubjectParams) error {
	var row ComputeLeaderboardGuildBossSubjectRow
	var firstErr error
	results := q.ComputeLeaderboardGuildBossSubject(ctx, []ComputeLeaderboardGuildBossSubjectParams{{TenantID: arg.TenantID, InstanceName: arg.InstanceName, DifficultyName: arg.DifficultyName, MaxPlayers: arg.MaxPlayers, EncounterName: arg.EncounterName, RealmID: arg.RealmID, GuildID: arg.GuildID}})
	results.QueryRow(func(_ int, r ComputeLeaderboardGuildBossSubjectRow, err error) {
		row = r
		if firstErr == nil {
			firstErr = err
		}
	})
	closeErr := results.Close()
	if firstErr != nil {
		return firstErr
	}
	if closeErr != nil {
		return closeErr
	}
	published := q.PublishLeaderboardGuildBossSubject(ctx, []PublishLeaderboardGuildBossSubjectParams{{
		TenantID: arg.TenantID, InstanceName: arg.InstanceName, DifficultyName: arg.DifficultyName, MaxPlayers: arg.MaxPlayers, EncounterName: arg.EncounterName, RealmID: arg.RealmID, GuildID: arg.GuildID,
		ObservationCount: row.ObservationCount, FastestDurationMs: row.FastestDurationMs, FormMeanInverseMs: row.FormMeanInverseMs, FloorMeanInverseMs: row.FloorMeanInverseMs,
		HasEvidence: row.HasEvidence, ProjectionVersion: arg.ProjectionVersion, AlgorithmVersion: arg.AlgorithmVersion, UnfencedManual: true,
	}})
	published.Exec(func(_ int, err error) {
		if firstErr == nil {
			firstErr = err
		}
	})
	closeErr = published.Close()
	if firstErr != nil {
		return firstErr
	}
	return closeErr
}

func (q *sqlQuerier) MaterializeLeaderboardGuildClearBenchmark(ctx context.Context, arg MaterializeLeaderboardGuildClearBenchmarkParams) error {
	var row ComputeLeaderboardGuildClearBenchmarkRow
	var firstErr error
	results := q.ComputeLeaderboardGuildClearBenchmark(ctx, []ComputeLeaderboardGuildClearBenchmarkParams{{TenantID: arg.TenantID, InstanceName: arg.InstanceName, DifficultyName: arg.DifficultyName, MaxPlayers: arg.MaxPlayers}})
	results.QueryRow(func(_ int, r ComputeLeaderboardGuildClearBenchmarkRow, err error) {
		row = r
		if firstErr == nil {
			firstErr = err
		}
	})
	closeErr := results.Close()
	if firstErr != nil {
		return firstErr
	}
	if closeErr != nil {
		return closeErr
	}
	published := q.PublishLeaderboardGuildClearBenchmark(ctx, []PublishLeaderboardGuildClearBenchmarkParams{{
		TenantID: arg.TenantID, InstanceName: arg.InstanceName, DifficultyName: arg.DifficultyName, MaxPlayers: arg.MaxPlayers,
		BestDurationMs: row.BestDurationMs,
		HasEvidence:    row.HasEvidence, ProjectionVersion: arg.ProjectionVersion, AlgorithmVersion: arg.AlgorithmVersion, UnfencedManual: true,
	}})
	published.Exec(func(_ int, err error) {
		if firstErr == nil {
			firstErr = err
		}
	})
	closeErr = published.Close()
	if firstErr != nil {
		return firstErr
	}
	return closeErr
}

func (q *sqlQuerier) MaterializeLeaderboardGuildClearSubject(ctx context.Context, arg MaterializeLeaderboardGuildClearSubjectParams) error {
	var row ComputeLeaderboardGuildClearSubjectRow
	var firstErr error
	results := q.ComputeLeaderboardGuildClearSubject(ctx, []ComputeLeaderboardGuildClearSubjectParams{{TenantID: arg.TenantID, InstanceName: arg.InstanceName, DifficultyName: arg.DifficultyName, MaxPlayers: arg.MaxPlayers, RealmID: arg.RealmID, GuildID: arg.GuildID}})
	results.QueryRow(func(_ int, r ComputeLeaderboardGuildClearSubjectRow, err error) {
		row = r
		if firstErr == nil {
			firstErr = err
		}
	})
	closeErr := results.Close()
	if firstErr != nil {
		return firstErr
	}
	if closeErr != nil {
		return closeErr
	}
	published := q.PublishLeaderboardGuildClearSubject(ctx, []PublishLeaderboardGuildClearSubjectParams{{
		TenantID: arg.TenantID, InstanceName: arg.InstanceName, DifficultyName: arg.DifficultyName, MaxPlayers: arg.MaxPlayers, RealmID: arg.RealmID, GuildID: arg.GuildID,
		ObservationCount: row.ObservationCount, FastestDurationMs: row.FastestDurationMs, FormMeanInverseMs: row.FormMeanInverseMs, FloorMeanInverseMs: row.FloorMeanInverseMs,
		HasEvidence: row.HasEvidence, ProjectionVersion: arg.ProjectionVersion, AlgorithmVersion: arg.AlgorithmVersion, UnfencedManual: true,
	}})
	published.Exec(func(_ int, err error) {
		if firstErr == nil {
			firstErr = err
		}
	})
	closeErr = published.Close()
	if firstErr != nil {
		return firstErr
	}
	return closeErr
}

func (q *sqlQuerier) MaterializeLeaderboardPlayerRenownCount(ctx context.Context, arg MaterializeLeaderboardPlayerRenownCountParams) error {
	var row ComputeLeaderboardPlayerRenownCountRow
	var firstErr error
	results := q.ComputeLeaderboardPlayerRenownCount(ctx, []ComputeLeaderboardPlayerRenownCountParams{{TenantID: arg.TenantID, InstanceName: arg.InstanceName, DifficultyName: arg.DifficultyName, MaxPlayers: arg.MaxPlayers, EncounterName: arg.EncounterName, RealmID: arg.RealmID, PlayerGuid: arg.PlayerGuid}})
	results.QueryRow(func(_ int, r ComputeLeaderboardPlayerRenownCountRow, err error) {
		row = r
		if firstErr == nil {
			firstErr = err
		}
	})
	closeErr := results.Close()
	if firstErr != nil {
		return firstErr
	}
	if closeErr != nil {
		return closeErr
	}
	published := q.PublishLeaderboardPlayerRenownCount(ctx, []PublishLeaderboardPlayerRenownCountParams{{
		TenantID: arg.TenantID, InstanceName: arg.InstanceName, DifficultyName: arg.DifficultyName, MaxPlayers: arg.MaxPlayers, EncounterName: arg.EncounterName, RealmID: arg.RealmID, PlayerGuid: arg.PlayerGuid,
		KillCount:   row.KillCount,
		HasEvidence: row.HasEvidence, ProjectionVersion: arg.ProjectionVersion, AlgorithmVersion: arg.AlgorithmVersion, UnfencedManual: true,
	}})
	published.Exec(func(_ int, err error) {
		if firstErr == nil {
			firstErr = err
		}
	})
	closeErr = published.Close()
	if firstErr != nil {
		return firstErr
	}
	return closeErr
}

func (q *sqlQuerier) MaterializeLeaderboardGuildRenownCount(ctx context.Context, arg MaterializeLeaderboardGuildRenownCountParams) error {
	var row ComputeLeaderboardGuildRenownCountRow
	var firstErr error
	results := q.ComputeLeaderboardGuildRenownCount(ctx, []ComputeLeaderboardGuildRenownCountParams{{TenantID: arg.TenantID, InstanceName: arg.InstanceName, DifficultyName: arg.DifficultyName, MaxPlayers: arg.MaxPlayers, EncounterName: arg.EncounterName, RealmID: arg.RealmID, GuildID: arg.GuildID}})
	results.QueryRow(func(_ int, r ComputeLeaderboardGuildRenownCountRow, err error) {
		row = r
		if firstErr == nil {
			firstErr = err
		}
	})
	closeErr := results.Close()
	if firstErr != nil {
		return firstErr
	}
	if closeErr != nil {
		return closeErr
	}
	published := q.PublishLeaderboardGuildRenownCount(ctx, []PublishLeaderboardGuildRenownCountParams{{
		TenantID: arg.TenantID, InstanceName: arg.InstanceName, DifficultyName: arg.DifficultyName, MaxPlayers: arg.MaxPlayers, EncounterName: arg.EncounterName, RealmID: arg.RealmID, GuildID: arg.GuildID,
		KillCount:   row.KillCount,
		HasEvidence: row.HasEvidence, ProjectionVersion: arg.ProjectionVersion, AlgorithmVersion: arg.AlgorithmVersion, UnfencedManual: true,
	}})
	published.Exec(func(_ int, err error) {
		if firstErr == nil {
			firstErr = err
		}
	})
	closeErr = published.Close()
	if firstErr != nil {
		return firstErr
	}
	return closeErr
}
