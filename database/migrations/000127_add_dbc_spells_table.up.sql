BEGIN;

CREATE TABLE dbc_spells (
    dataset_id          UUID    NOT NULL REFERENCES datasets(id) ON DELETE CASCADE,
    spell_id            INT     NOT NULL,

    -- Core Identification
    name                TEXT    NOT NULL DEFAULT '',
    name_subtext        TEXT    NOT NULL DEFAULT '',
    description         TEXT    NOT NULL DEFAULT '',
    aura_description    TEXT    NOT NULL DEFAULT '',

    -- Display
    spell_icon_id       INT     NOT NULL DEFAULT 0,
    active_icon_id      INT     NOT NULL DEFAULT 0,

    -- Level Requirements
    max_level           INT     NOT NULL DEFAULT 0,
    base_level          INT     NOT NULL DEFAULT 0,
    spell_level         INT     NOT NULL DEFAULT 0,
    category            INT     NOT NULL DEFAULT 0,
    max_target_level    INT     NOT NULL DEFAULT 0,

    -- Behavior
    school              INT     NOT NULL DEFAULT 0,
    spell_priority      INT     NOT NULL DEFAULT 0,
    stance_bar_order    INT     NOT NULL DEFAULT 0,
    proc_type_mask      INT     NOT NULL DEFAULT 0,
    proc_flags          INT     NOT NULL DEFAULT 0,
    proc_chance         INT     NOT NULL DEFAULT 0,
    proc_charges        INT     NOT NULL DEFAULT 0,
    speed               REAL    NOT NULL DEFAULT 0,
    dispel_type         INT     NOT NULL DEFAULT 0,
    aura_interrupt_flags INT    NOT NULL DEFAULT 0,
    modal_next_spell    INT     NOT NULL DEFAULT 0,
    interrupt_flags     INT     NOT NULL DEFAULT 0,
    cumulative_aura     INT     NOT NULL DEFAULT 0,
    mechanic            INT     NOT NULL DEFAULT 0,
    defense_type        INT     NOT NULL DEFAULT 0,
    caster_aura_state   INT     NOT NULL DEFAULT 0,
    target_aura_state   INT     NOT NULL DEFAULT 0,
    max_targets         INT     NOT NULL DEFAULT 0,
    target_creature_type INT    NOT NULL DEFAULT 0,
    requires_spell_focus INT    NOT NULL DEFAULT 0,

    -- Resource Cost
    power_type          INT     NOT NULL DEFAULT 0,
    mana_cost           INT     NOT NULL DEFAULT 0,
    mana_cost_pct       INT     NOT NULL DEFAULT 0,
    mana_cost_per_level INT     NOT NULL DEFAULT 0,
    mana_per_second     INT     NOT NULL DEFAULT 0,
    reagent             INT[]   NOT NULL DEFAULT '{}',
    reagent_count       INT[]   NOT NULL DEFAULT '{}',

    -- Timing (durations stored as milliseconds)
    casting_time_index  INT     NOT NULL DEFAULT 0,
    recovery_time_ms    BIGINT  NOT NULL DEFAULT 0,
    start_recovery_category INT NOT NULL DEFAULT 0,
    start_recovery_time_ms  BIGINT NOT NULL DEFAULT 0,
    category_recovery_time_ms BIGINT NOT NULL DEFAULT 0,
    range_index         INT     NOT NULL DEFAULT 0,
    duration_index      INT     NOT NULL DEFAULT 0,

    -- Filtering/Logic
    attributes          INT[]   NOT NULL DEFAULT '{}',  -- [9]uint32 spell attribute flags
    targets             INT     NOT NULL DEFAULT 0,
    spell_class_set     INT     NOT NULL DEFAULT 0,
    spell_class_mask    BIGINT  NOT NULL DEFAULT 0,
    equipped_item_inv_types INT NOT NULL DEFAULT 0,
    equipped_item_class INT     NOT NULL DEFAULT 0,
    equipped_item_subclass INT  NOT NULL DEFAULT 0,
    prevention_type     INT     NOT NULL DEFAULT 0,

    -- Effect 0
    effect_0                    INT  NOT NULL DEFAULT 0,
    effect_die_sides_0          INT  NOT NULL DEFAULT 0,
    effect_real_pts_per_level_0 REAL NOT NULL DEFAULT 0,
    effect_base_points_0        INT  NOT NULL DEFAULT 0,
    effect_mechanic_0           INT  NOT NULL DEFAULT 0,
    effect_radius_index_0       INT  NOT NULL DEFAULT 0,
    effect_aura_0               INT  NOT NULL DEFAULT 0,
    effect_aura_period_0        INT  NOT NULL DEFAULT 0,
    effect_amplitude_0          REAL NOT NULL DEFAULT 0,
    effect_chain_targets_0      INT  NOT NULL DEFAULT 0,
    effect_item_type_0          INT  NOT NULL DEFAULT 0,
    effect_misc_value_0         INT  NOT NULL DEFAULT 0,
    effect_trigger_spell_0      INT  NOT NULL DEFAULT 0,
    effect_pts_per_combo_0      REAL NOT NULL DEFAULT 0,
    effect_base_dice_0          INT  NOT NULL DEFAULT 0,
    effect_dice_per_level_0     INT  NOT NULL DEFAULT 0,
    effect_chain_amplitude_0    REAL NOT NULL DEFAULT 0,
    implicit_target_a_0         INT  NOT NULL DEFAULT 0,
    implicit_target_b_0         INT  NOT NULL DEFAULT 0,

    -- Effect 1
    effect_1                    INT  NOT NULL DEFAULT 0,
    effect_die_sides_1          INT  NOT NULL DEFAULT 0,
    effect_real_pts_per_level_1 REAL NOT NULL DEFAULT 0,
    effect_base_points_1        INT  NOT NULL DEFAULT 0,
    effect_mechanic_1           INT  NOT NULL DEFAULT 0,
    effect_radius_index_1       INT  NOT NULL DEFAULT 0,
    effect_aura_1               INT  NOT NULL DEFAULT 0,
    effect_aura_period_1        INT  NOT NULL DEFAULT 0,
    effect_amplitude_1          REAL NOT NULL DEFAULT 0,
    effect_chain_targets_1      INT  NOT NULL DEFAULT 0,
    effect_item_type_1          INT  NOT NULL DEFAULT 0,
    effect_misc_value_1         INT  NOT NULL DEFAULT 0,
    effect_trigger_spell_1      INT  NOT NULL DEFAULT 0,
    effect_pts_per_combo_1      REAL NOT NULL DEFAULT 0,
    effect_base_dice_1          INT  NOT NULL DEFAULT 0,
    effect_dice_per_level_1     INT  NOT NULL DEFAULT 0,
    effect_chain_amplitude_1    REAL NOT NULL DEFAULT 0,
    implicit_target_a_1         INT  NOT NULL DEFAULT 0,
    implicit_target_b_1         INT  NOT NULL DEFAULT 0,

    -- Effect 2
    effect_2                    INT  NOT NULL DEFAULT 0,
    effect_die_sides_2          INT  NOT NULL DEFAULT 0,
    effect_real_pts_per_level_2 REAL NOT NULL DEFAULT 0,
    effect_base_points_2        INT  NOT NULL DEFAULT 0,
    effect_mechanic_2           INT  NOT NULL DEFAULT 0,
    effect_radius_index_2       INT  NOT NULL DEFAULT 0,
    effect_aura_2               INT  NOT NULL DEFAULT 0,
    effect_aura_period_2        INT  NOT NULL DEFAULT 0,
    effect_amplitude_2          REAL NOT NULL DEFAULT 0,
    effect_chain_targets_2      INT  NOT NULL DEFAULT 0,
    effect_item_type_2          INT  NOT NULL DEFAULT 0,
    effect_misc_value_2         INT  NOT NULL DEFAULT 0,
    effect_trigger_spell_2      INT  NOT NULL DEFAULT 0,
    effect_pts_per_combo_2      REAL NOT NULL DEFAULT 0,
    effect_base_dice_2          INT  NOT NULL DEFAULT 0,
    effect_dice_per_level_2     INT  NOT NULL DEFAULT 0,
    effect_chain_amplitude_2    REAL NOT NULL DEFAULT 0,
    implicit_target_a_2         INT  NOT NULL DEFAULT 0,
    implicit_target_b_2         INT  NOT NULL DEFAULT 0,

    -- Totem Requirements
    totems_id           INT     NOT NULL DEFAULT 0,
    totem               INT[]   NOT NULL DEFAULT '{}',

    -- Other
    cast_ui             INT     NOT NULL DEFAULT 0,
    required_aura_vision INT    NOT NULL DEFAULT 0,
    min_faction_id      INT     NOT NULL DEFAULT 0,
    min_reputation      INT     NOT NULL DEFAULT 0,
    spell_visual_id     INT[]   NOT NULL DEFAULT '{}',

    -- 3.3.5a+ Fields (zero for vanilla)
    rune_cost_id              INT NOT NULL DEFAULT 0,
    spell_missile_id          INT NOT NULL DEFAULT 0,
    description_variables_id  INT NOT NULL DEFAULT 0,
    caster_aura_spell         INT NOT NULL DEFAULT 0,
    target_aura_spell         INT NOT NULL DEFAULT 0,
    exclude_caster_aura_spell INT NOT NULL DEFAULT 0,
    exclude_target_aura_spell INT NOT NULL DEFAULT 0,
    exclude_caster_aura_state INT NOT NULL DEFAULT 0,
    exclude_target_aura_state INT NOT NULL DEFAULT 0,
    mana_per_second_per_level INT NOT NULL DEFAULT 0,

    PRIMARY KEY (dataset_id, spell_id)
);

CREATE INDEX idx_dbc_spells_name ON dbc_spells (dataset_id, name);

END;
