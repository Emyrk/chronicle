-- name: GetTenantRatingReadState :one
-- Missing rows are evolving only when there is no active published generation.
SELECT COALESCE((SELECT state FROM tenant_rating_read_states WHERE tenant_id = @tenant_id),
  CASE WHEN EXISTS (SELECT 1 FROM rating_score_generations
                    WHERE tenant_id = @tenant_id AND status = 'active')
       THEN 'legacy' ELSE 'evolving' END)::text AS state;
