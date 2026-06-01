-- Remove the backfilled "server-side" capability.
UPDATE log_instances li
SET capabilities = array_remove(capabilities, 'server-side')
FROM wow_log_groups wlg
WHERE li.log_group_id = wlg.id
  AND wlg.log_type = 'azerothcore';
