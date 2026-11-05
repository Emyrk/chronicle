package database

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5"
)

func (q *sqlQuerier) withJITDisabled(ctx context.Context, query func(Store) error) error {
	return q.InTx(ctx, func(tx Store) error {
		if err := tx.DisableJITForTransaction(ctx); err != nil {
			return fmt.Errorf("disable JIT for transaction: %w", err)
		}
		return query(tx)
	}, &pgx.TxOptions{AccessMode: pgx.ReadOnly})
}

// EvolvingHubSummaryRatingRowsWithoutNestedLoops avoids repeated nested-loop
// reads over large boss-score cohorts. The planner setting is scoped to this
// single read-only transaction; other queries keep PostgreSQL's default.
func (q *sqlQuerier) EvolvingHubSummaryRatingRowsWithoutNestedLoops(ctx context.Context, arg EvolvingHubSummaryRatingRowsParams) ([]EvolvingHubSummaryRatingRowsRow, error) {
	var rows []EvolvingHubSummaryRatingRowsRow
	err := q.InTx(ctx, func(tx Store) error {
		if err := tx.DisableNestedLoopForTransaction(ctx); err != nil {
			return fmt.Errorf("disable nested loops for hub summary: %w", err)
		}
		var err error
		rows, err = tx.EvolvingHubSummaryRatingRows(ctx, arg)
		return err
	}, &pgx.TxOptions{AccessMode: pgx.ReadOnly})
	return rows, err
}

// RankingsLeaderboardNoJIT runs RankingsLeaderboard without PostgreSQL JIT.
// The ranking query is too short-lived to recover its substantial compilation cost.
func (q *sqlQuerier) RankingsLeaderboardNoJIT(ctx context.Context, arg RankingsLeaderboardParams) ([]RankingsLeaderboardRow, error) {
	var rows []RankingsLeaderboardRow
	err := q.withJITDisabled(ctx, func(tx Store) error {
		var err error
		rows, err = tx.RankingsLeaderboard(ctx, arg)
		return err
	})
	return rows, err
}

// RankingsBoxPlotStatsNoJIT runs RankingsBoxPlotStats without PostgreSQL JIT.
// The ranking query is too short-lived to recover its substantial compilation cost.
func (q *sqlQuerier) RankingsBoxPlotStatsNoJIT(ctx context.Context, arg RankingsBoxPlotStatsParams) ([]RankingsBoxPlotStatsRow, error) {
	var rows []RankingsBoxPlotStatsRow
	err := q.withJITDisabled(ctx, func(tx Store) error {
		var err error
		rows, err = tx.RankingsBoxPlotStats(ctx, arg)
		return err
	})
	return rows, err
}
