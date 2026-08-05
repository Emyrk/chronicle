CREATE TABLE game_player_gear_history (
    player_id wow_guid NOT NULL,
    realm_id uuid NOT NULL,
    instance_id uuid NOT NULL,
    gear jsonb NOT NULL,
    -- Average item level across equipped slots (shirt and tabard excluded).
    -- NULL when no equipped item had a known item level.
    avg_ilvl real,
    equipped_at timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    PRIMARY KEY (player_id, realm_id, instance_id),
    FOREIGN KEY (player_id, realm_id) REFERENCES game_players(id, realm_id) ON DELETE CASCADE,
    FOREIGN KEY (instance_id) REFERENCES log_instances(id) ON DELETE CASCADE
);

COMMENT ON TABLE game_player_gear_history IS 'One gear snapshot per (player, log instance): the outfit worn as of the last COMBATANT_INFO in that instance. Powers armory item-level trends and gear-over-time views.';

CREATE INDEX game_player_gear_history_player_time
    ON game_player_gear_history (realm_id, player_id, equipped_at DESC);
