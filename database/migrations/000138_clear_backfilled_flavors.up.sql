-- Clear flavors that were indiscriminately stamped by the now-removed
-- serviceflavorbackfill boot service. That service stamped ALL NULL-flavor
-- rows with the primary server's build-tag flavor, which was wrong for
-- log groups belonging to non-primary tenants/datasets.
--
-- Setting flavor back to NULL is safe: the parse worker resolves flavor
-- from the dataset's default_flavor (via realm → server → dataset) and
-- now persists the result back to wow_log_groups.flavor, so the next
-- parse or reparse will re-stamp the correct value.
UPDATE wow_log_groups SET flavor = NULL WHERE flavor IS NOT NULL;
