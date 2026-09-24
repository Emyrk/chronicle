package cli

import (
	"context"
	"fmt"
	"io"

	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/gamedb/spells"
	"github.com/Emyrk/chronicle/internal/spellcheck"
	"github.com/coder/serpent"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

// CheckSpellDatasetsCmd returns a read-only integrity checker for database-backed spells.
func CheckSpellDatasetsCmd() *serpent.Command {
	var (
		pgURL      string
		datasetIDs []string
	)

	return &serpent.Command{
		Use:   "check-spell-datasets",
		Short: "Validate database spells through production fetch and JSON paths",
		Long: `Read every database-backed spell without modifying data and verify that
normalized effects, powers, and variants survive the production fetch and JSON
response paths. By default every dataset is checked; pass --dataset to select
one or more dataset UUIDs.`,
		Options: serpent.OptionSet{
			{
				Name:        "Postgres URL",
				Description: "PostgreSQL connection string.",
				Flag:        "postgres-url",
				Env:         "CHRONICLE_POSTGRES_URL",
				Default:     "postgresql://postgres:postgres@localhost:5433/chronicle?sslmode=disable",
				Value:       serpent.StringOf(&pgURL),
			},
			{
				Name:        "Dataset",
				Description: "Dataset UUID to check. May be specified multiple times; defaults to all datasets.",
				Flag:        "dataset",
				Value:       serpent.StringArrayOf(&datasetIDs),
			},
		},
		Handler: func(i *serpent.Invocation) error {
			return checkSpellDatasets(i.Context(), i.Stdout, pgURL, datasetIDs)
		},
	}
}

func checkSpellDatasets(ctx context.Context, stdout io.Writer, pgURL string, selected []string) error {
	pool, err := pgxpool.New(ctx, pgURL)
	if err != nil {
		return fmt.Errorf("connect to postgres: %w", err)
	}
	defer pool.Close()

	store := database.New(pool)
	datasets, err := store.ListDatasets(ctx)
	if err != nil {
		return fmt.Errorf("list datasets: %w", err)
	}
	wanted, err := parseDatasetSelection(selected)
	if err != nil {
		return err
	}

	spellFetcher := spells.NewFetcherDBOnly(ctx, pool, nil, nil, 1000)

	checked := 0
	selectionActive := len(wanted) > 0
	for _, dataset := range datasets {
		if selectionActive {
			if _, ok := wanted[dataset.ID]; !ok {
				continue
			}
			delete(wanted, dataset.ID)
		}
		report, err := spellcheck.CheckDataset(ctx, store, dataset.ID, spellFetcher)
		if err != nil {
			return fmt.Errorf("check dataset %s (%s): %w", dataset.Name, dataset.ID, err)
		}
		checked++
		if _, err := fmt.Fprintf(stdout,
			"dataset=%s name=%q spells=%d effects=%d powers=%d variants=%d sparse_effect_sets=%d repeated_effect_indexes=%d effects_beyond_index_two=%d nondefault_effects=%d nondefault_variants=%d exact_float_effects=%d fractional_effects=%d component_only_spell_ids=%d component_only_effects=%d component_only_powers=%d component_only_variants=%d\n",
			report.DatasetID, dataset.Name, report.Spells, report.NormalizedEffects,
			report.NormalizedPowers, report.NormalizedVariants, report.SparseEffectSets,
			report.RepeatedEffectIndexes, report.EffectsBeyondIndexTwo,
			report.NondefaultEffects, report.NondefaultVariants, report.ExactFloatEffects,
			report.FractionalEffects, report.ComponentOnlySpellIDs,
			report.ComponentOnlyEffects, report.ComponentOnlyPowers,
			report.ComponentOnlyVariants,
		); err != nil {
			return fmt.Errorf("write dataset report: %w", err)
		}
	}
	if len(wanted) > 0 {
		for id := range wanted {
			return fmt.Errorf("dataset %s not found", id)
		}
	}
	if checked == 0 {
		return fmt.Errorf("no datasets found")
	}
	_, err = fmt.Fprintf(stdout, "checked %d dataset(s) successfully\n", checked)
	return err
}

func parseDatasetSelection(values []string) (map[uuid.UUID]struct{}, error) {
	selected := make(map[uuid.UUID]struct{}, len(values))
	for _, value := range values {
		id, err := uuid.Parse(value)
		if err != nil {
			return nil, fmt.Errorf("invalid dataset UUID %q: %w", value, err)
		}
		selected[id] = struct{}{}
	}
	return selected, nil
}
