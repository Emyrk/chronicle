BEGIN;

CREATE TABLE user_character_cosmetics (
  user_character_link_id uuid PRIMARY KEY
    REFERENCES user_character_links(id) ON DELETE CASCADE,

  requested_name_id text NOT NULL DEFAULT '',
  requested_background_id text NOT NULL DEFAULT '',
  requested_border_id text NOT NULL DEFAULT '',

  active_name_id text NOT NULL DEFAULT '',
  active_background_id text NOT NULL DEFAULT '',
  active_border_id text NOT NULL DEFAULT ''
);

COMMIT;
