package spelldb

import (
	"context"
	"fmt"

	chronicleDB "github.com/Emyrk/chronicle/database"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// columns is the ordered list of persisted dbc_spells base-row columns.
var columns = []string{
	"dataset_id",
	"spell_id",
	"name",
	"name_subtext",
	"description",
	"aura_description",
	"spell_icon_id",
	"active_icon_id",
	"max_level",
	"base_level",
	"spell_level",
	"category",
	"max_target_level",
	"school",
	"spell_priority",
	"stance_bar_order",
	"proc_type_mask",
	"proc_flags",
	"proc_chance",
	"proc_charges",
	"speed",
	"dispel_type",
	"aura_interrupt_flags",
	"modal_next_spell",
	"interrupt_flags",
	"cumulative_aura",
	"mechanic",
	"defense_type",
	"caster_aura_state",
	"target_aura_state",
	"max_targets",
	"target_creature_type",
	"requires_spell_focus",
	"reagent",
	"reagent_count",
	"casting_time_index",
	"recovery_time_ms",
	"start_recovery_category",
	"start_recovery_time_ms",
	"category_recovery_time_ms",
	"range_index",
	"duration_index",
	"attributes",
	"targets",
	"spell_class_set",
	"spell_class_mask",
	"equipped_item_inv_types",
	"equipped_item_class",
	"equipped_item_subclass",
	"prevention_type",
	"totems_id",
	"totem",
	"cast_ui",
	"required_aura_vision",
	"min_faction_id",
	"min_reputation",
	"spell_visual_id",
	"rune_cost_id",
	"spell_missile_id",
	"description_variables_id",
	"caster_aura_spell",
	"target_aura_spell",
	"exclude_caster_aura_spell",
	"exclude_target_aura_spell",
	"exclude_caster_aura_state",
	"exclude_target_aura_state",
	"mana_per_second_per_level",
}

var writeColumns = columns

func (r *SpellRow) values() []any {
	return []any{
		r.DatasetID,
		r.SpellID,
		r.Name,
		r.NameSubtext,
		r.Description,
		r.AuraDescription,
		r.SpellIconID,
		r.ActiveIconID,
		r.MaxLevel,
		r.BaseLevel,
		r.SpellLevel,
		r.Category,
		r.MaxTargetLevel,
		r.School,
		r.SpellPriority,
		r.StanceBarOrder,
		r.ProcTypeMask,
		r.ProcFlags,
		r.ProcChance,
		r.ProcCharges,
		r.Speed,
		r.DispelType,
		r.AuraInterruptFlags,
		r.ModalNextSpell,
		r.InterruptFlags,
		r.CumulativeAura,
		r.Mechanic,
		r.DefenseType,
		r.CasterAuraState,
		r.TargetAuraState,
		r.MaxTargets,
		r.TargetCreatureType,
		r.RequiresSpellFocus,
		nonNilInt32s(r.Reagent),
		nonNilInt32s(r.ReagentCount),
		r.CastingTimeIndex,
		r.RecoveryTimeMs,
		r.StartRecoveryCategory,
		r.StartRecoveryTimeMs,
		r.CategoryRecoveryTimeMs,
		r.RangeIndex,
		r.DurationIndex,
		nonNilInt32s(r.Attributes),
		r.Targets,
		r.SpellClassSet,
		r.SpellClassMask,
		r.EquippedItemInvTypes,
		r.EquippedItemClass,
		r.EquippedItemSubclass,
		r.PreventionType,
		r.TotemsID,
		nonNilInt32s(r.Totem),
		r.CastUI,
		r.RequiredAuraVision,
		r.MinFactionID,
		r.MinReputation,
		nonNilInt32s(r.SpellVisualID),
		r.RuneCostID,
		r.SpellMissileID,
		r.DescriptionVariablesID,
		r.CasterAuraSpell,
		r.TargetAuraSpell,
		r.ExcludeCasterAuraSpell,
		r.ExcludeTargetAuraSpell,
		r.ExcludeCasterAuraState,
		r.ExcludeTargetAuraState,
		r.ManaPerSecondPerLevel,
	}
}

func (r *SpellRow) writeValues() []any {
	return r.values()
}

func nonNilInt32s(values []int32) []int32 {
	if values == nil {
		return []int32{}
	}
	return values
}

// columnsSQL builds a comma-separated column list.
func columnsSQL(selectedColumns []string) string {
	s := ""
	for i, c := range selectedColumns {
		if i > 0 {
			s += ", "
		}
		s += c
	}
	return s
}

// placeholdersSQL builds $1, $2, ... $N for the column count.
func placeholdersSQL(selectedColumns []string) string {
	s := ""
	for i := range selectedColumns {
		if i > 0 {
			s += ", "
		}
		s += fmt.Sprintf("$%d", i+1)
	}
	return s
}

// InsertSpell inserts a single spell row. On conflict (dataset_id, spell_id)
// the row is updated (upsert).
func InsertSpell(ctx context.Context, pool *pgxpool.Pool, row *SpellRow) error {
	sql := fmt.Sprintf(
		`INSERT INTO dbc_spells (%s) VALUES (%s)
		 ON CONFLICT (dataset_id, spell_id) DO UPDATE SET %s`,
		columnsSQL(writeColumns), placeholdersSQL(writeColumns), updateSetSQL(),
	)
	_, err := pool.Exec(ctx, sql, row.writeValues()...)
	return err
}

// GetSpell retrieves a single spell by dataset + spell ID, LEFT JOINing
// resolved metadata from companion DBC tables.
func GetSpell(ctx context.Context, pool *pgxpool.Pool, datasetID uuid.UUID, spellID int32) (*SpellRow, error) {
	result, err := chronicleDB.New(pool).GetCanonicalSpellByID(ctx, chronicleDB.GetCanonicalSpellByIDParams{
		DatasetID: datasetID,
		SpellID:   spellID,
	})
	if err != nil {
		return nil, err
	}
	return decodeSpellLookup(result.SpellJson, result.MetadataJson, result.EffectsJson, result.PowersJson, result.VariantsJson)
}

// GetSpellsByName retrieves all spells matching a name within a dataset,
// LEFT JOINing resolved metadata from companion DBC tables.
func GetSpellsByName(ctx context.Context, pool *pgxpool.Pool, datasetID uuid.UUID, name string) ([]SpellRow, error) {
	results, err := chronicleDB.New(pool).GetCanonicalSpellsByName(ctx, chronicleDB.GetCanonicalSpellsByNameParams{
		DatasetID: datasetID,
		Name:      name,
	})
	if err != nil {
		return nil, err
	}
	rows := make([]SpellRow, 0, len(results))
	for _, result := range results {
		row, err := decodeSpellLookup(result.SpellJson, result.MetadataJson, result.EffectsJson, result.PowersJson, result.VariantsJson)
		if err != nil {
			return nil, err
		}
		rows = append(rows, *row)
	}
	return rows, nil
}

// UpsertBatch inserts multiple spells in a single round-trip using pgx Batch.
func UpsertBatch(ctx context.Context, pool interface {
	SendBatch(context.Context, *pgx.Batch) pgx.BatchResults
}, rows []SpellRow) error {
	if len(rows) == 0 {
		return nil
	}
	sql := fmt.Sprintf(
		`INSERT INTO dbc_spells (%s) VALUES (%s)
		 ON CONFLICT (dataset_id, spell_id) DO UPDATE SET %s`,
		columnsSQL(writeColumns), placeholdersSQL(writeColumns), updateSetSQL(),
	)
	batch := &pgx.Batch{}
	for i := range rows {
		batch.Queue(sql, rows[i].writeValues()...)
	}
	br := pool.SendBatch(ctx, batch)
	defer func() { _ = br.Close() }()
	for range rows {
		if _, err := br.Exec(); err != nil {
			return fmt.Errorf("upsert spell batch: %w", err)
		}
	}
	return nil
}

// updateSetSQL builds the SET clause for ON CONFLICT DO UPDATE, skipping
// the PK columns (dataset_id, spell_id).
func updateSetSQL() string {
	s := ""
	for _, c := range writeColumns[2:] { // skip dataset_id, spell_id
		if s != "" {
			s += ", "
		}
		s += c + " = EXCLUDED." + c
	}
	return s
}
