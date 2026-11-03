-- A rating generation is per tenant; root servers use the zero UUID. Every
-- tenant with a realm can rebuild, regardless of legacy realm-group policy.
-- name: ListRatingTenants :many
SELECT DISTINCT COALESCE(server.tenant_id, '00000000-0000-0000-0000-000000000000'::uuid) AS tenant_id
FROM wow_servers server
JOIN wow_server_realms realm ON realm.server_id = server.id
ORDER BY tenant_id;

-- The fixed rules and per-realm flavor awards are frozen by the start function.
-- name: StartTenantRatingRebuild :one
SELECT start_tenant_rating_rebuild(@tenant_id::uuid, @as_of::timestamptz,
                                   @source_cutoff::timestamptz)::uuid;
