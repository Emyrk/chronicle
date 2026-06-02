-- Backfill the "server-side" capability for AzerothCore server-side logs
-- that were parsed before commit ec4d76a0 added it to the parser.
UPDATE log_instances li
SET capabilities = array_append(capabilities, 'server-side')
FROM wow_log_groups wlg
WHERE li.log_group_id = wlg.id
  AND wlg.log_type = 'azerothcore'
  AND NOT ('server-side' = ANY(li.capabilities));
