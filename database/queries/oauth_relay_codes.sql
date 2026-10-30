-- name: InsertOAuthRelayCode :exec
INSERT INTO oauth_relay_codes (
  code_hash,
  user_auth_session_id,
  provider,
  tenant_slug,
  tenant_name,
  redirect_path,
  expires_at,
  linked_id
) VALUES (
  @code_hash,
  @user_auth_session_id,
  @provider,
  @tenant_slug,
  @tenant_name,
  @redirect_path,
  @expires_at,
  @linked_id
);

-- name: RedeemOAuthRelayCode :one
WITH redeemed AS (
  DELETE FROM oauth_relay_codes
  WHERE code_hash = @code_hash
  RETURNING
    user_auth_session_id,
    provider,
    tenant_slug,
    tenant_name,
    redirect_path,
    expires_at,
    linked_id
)
SELECT
  sqlc.embed(user_auth_session),
  redeemed.provider,
  redeemed.tenant_slug,
  redeemed.tenant_name,
  redeemed.redirect_path,
  redeemed.expires_at AS relay_expires_at,
  redeemed.linked_id
FROM redeemed
JOIN user_auth_session ON user_auth_session.id = redeemed.user_auth_session_id;

-- name: DeleteExpiredOAuthRelayCodes :execrows
DELETE FROM oauth_relay_codes
WHERE expires_at <= NOW();
