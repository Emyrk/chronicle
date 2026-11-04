-- name: GetTenantRatingReadState :one
-- Missing rows are evolving only when there is no active published generation.
SELECT COALESCE((SELECT state FROM tenant_rating_read_states rs WHERE rs.tenant_id = sqlc.arg(tenant_id)::uuid),
  CASE WHEN EXISTS (SELECT 1 FROM rating_score_generations g
                    WHERE g.tenant_id = sqlc.arg(tenant_id)::uuid AND status = 'active')
       THEN 'legacy' ELSE 'evolving' END)::text AS state;
