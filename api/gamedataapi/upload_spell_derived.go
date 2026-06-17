package gamedataapi

import (
	"context"
	"fmt"

	"github.com/Emyrk/chronicle/database/gamedb/chrondbc"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

// deriveSpellMetadata analyses imported spells and populates the 3 derived
// tables: dbc_extra_attack_spells, dbc_duration_modifiers, dbc_periodic_spells.
func (h *Handler) deriveSpellMetadata(ctx context.Context, datasetID uuid.UUID, spellDBC *chrondbc.SpellsDBC) error {
	type extraAttackRow struct {
		SpellID         int32
		Name            string
		NumExtraAttacks int32
	}
	type durationModRow struct {
		SpellID       int32
		Name          string
		Percent       int32
		Flat          int32
		Deprecated    bool
		SpellClassSet int32
		ClassMask     int64 // stored as BIGINT
	}
	type periodicRow struct {
		SpellID   int32
		Name      string
		HasDirect bool
	}

	var extraAttacks []extraAttackRow
	var durationMods []durationModRow
	var periodics []periodicRow

	err := spellDBC.Range(func(spell *chrondbc.Spell) bool {
		if spell == nil {
			return true
		}

		// --- Extra attacks ---
		// Mirrors scripts/dbcdata/cli/extraattacks.go: collectExtraAttackSpells
		for i, effect := range spell.Effect {
			if effect == chrondbc.EffectAddExtraAttacks {
				extraAttacks = append(extraAttacks, extraAttackRow{
					SpellID:         int32(spell.ID),
					Name:            spell.String(),
					NumExtraAttacks: spell.EffectBasePoints[i] + 1,
				})
				break
			}
		}

		// --- Periodic spells ---
		// Mirrors scripts/dbcdata/cli/periodic.go: collectPeriodicSpells
		dmgType := spell.SpellDamageType()
		if dmgType.Has(chrondbc.SpellDamagePeriodic) {
			periodics = append(periodics, periodicRow{
				SpellID:   int32(spell.ID),
				Name:      spell.Name(),
				HasDirect: dmgType.Has(chrondbc.SpellDamageDirect),
			})
		}

		// --- Duration modifiers ---
		// Mirrors scripts/dbcdata/cli/durationmodifiers.go: collectDurationModifiers
		if !spell.Attrs.Has(chrondbc.Attr_Passive) {
			return true
		}
		for i, effect := range spell.Effect {
			if effect != chrondbc.EffectApplyAura {
				continue
			}
			// EffectMiscValue == 1 means the modifier targets duration.
			if spell.EffectMiscValue[i] != 1 {
				continue
			}

			value := spell.EffectBasePoints[i] + 1
			var pct, flat int32
			switch spell.EffectAura[i] {
			case chrondbc.AuraEffectAddPctModifier:
				pct = value
			case chrondbc.AuraEffectAddFlatModifier:
				flat = value
			default:
				continue
			}

			// For modifier auras, EffectItemType holds the spell family
			// flags bitmask. Mask to 32 bits to avoid sign-extension,
			// then widen to int64 for BIGINT storage.
			classMask := int64(uint32(spell.EffectItemType[i]))
			if classMask == 0 {
				continue
			}

			durationMods = append(durationMods, durationModRow{
				SpellID:       int32(spell.ID),
				Name:          spell.Name(),
				Percent:       pct,
				Flat:          flat,
				Deprecated:    spell.IsDeprecated(),
				SpellClassSet: int32(spell.SpellClassSet),
				ClassMask:     classMask,
			})
			break
		}
		return true
	})
	if err != nil {
		return fmt.Errorf("iterate spells for derivation: %w", err)
	}

	// Wipe existing derived data for this dataset.
	for _, table := range []string{
		"dbc_extra_attack_spells",
		"dbc_duration_modifiers",
		"dbc_periodic_spells",
	} {
		if _, err := h.pool.Exec(ctx, fmt.Sprintf(`DELETE FROM %s WHERE dataset_id = $1`, table), datasetID); err != nil {
			return fmt.Errorf("clear %s: %w", table, err)
		}
	}

	const batchSize = 500

	// Insert extra attack spells.
	batch := &pgx.Batch{}
	for _, r := range extraAttacks {
		batch.Queue(`INSERT INTO dbc_extra_attack_spells (dataset_id, spell_id, name, num_extra_attacks) VALUES ($1,$2,$3,$4)`,
			datasetID, r.SpellID, r.Name, r.NumExtraAttacks,
		)
		if batch.Len() >= batchSize {
			if err := flushBatch(ctx, h.pool, batch); err != nil {
				return fmt.Errorf("insert extra attack spells: %w", err)
			}
			batch = &pgx.Batch{}
		}
	}
	if batch.Len() > 0 {
		if err := flushBatch(ctx, h.pool, batch); err != nil {
			return fmt.Errorf("insert extra attack spells (final): %w", err)
		}
	}

	// Insert duration modifiers.
	batch = &pgx.Batch{}
	for _, r := range durationMods {
		batch.Queue(`INSERT INTO dbc_duration_modifiers (dataset_id, spell_id, name, percent, flat, deprecated, spell_class_set, spell_class_mask) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
			datasetID, r.SpellID, r.Name, r.Percent, r.Flat, r.Deprecated, r.SpellClassSet, r.ClassMask,
		)
		if batch.Len() >= batchSize {
			if err := flushBatch(ctx, h.pool, batch); err != nil {
				return fmt.Errorf("insert duration modifiers: %w", err)
			}
			batch = &pgx.Batch{}
		}
	}
	if batch.Len() > 0 {
		if err := flushBatch(ctx, h.pool, batch); err != nil {
			return fmt.Errorf("insert duration modifiers (final): %w", err)
		}
	}

	// Insert periodic spells.
	batch = &pgx.Batch{}
	for _, r := range periodics {
		batch.Queue(`INSERT INTO dbc_periodic_spells (dataset_id, spell_id, name, has_direct) VALUES ($1,$2,$3,$4)`,
			datasetID, r.SpellID, r.Name, r.HasDirect,
		)
		if batch.Len() >= batchSize {
			if err := flushBatch(ctx, h.pool, batch); err != nil {
				return fmt.Errorf("insert periodic spells: %w", err)
			}
			batch = &pgx.Batch{}
		}
	}
	if batch.Len() > 0 {
		if err := flushBatch(ctx, h.pool, batch); err != nil {
			return fmt.Errorf("insert periodic spells (final): %w", err)
		}
	}

	return nil
}
