UPDATE inference_runs SET assistant_id = 'lua-workshop' WHERE assistant_id = 'addon-workshop-panel';
UPDATE inference_threads SET assistant_id = 'lua-workshop' WHERE assistant_id = 'addon-workshop-panel';
DROP TABLE inference_user_config;
