BEGIN;

CREATE TABLE blog_votes (
  post_slug text NOT NULL CHECK (post_slug <> ''),
  user_id uuid NOT NULL REFERENCES users(id),
  value smallint NOT NULL CHECK (value IN (-1, 1)),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (post_slug, user_id)
);

CREATE TABLE blog_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_slug text NOT NULL CHECK (post_slug <> ''),
  user_id uuid NOT NULL REFERENCES users(id),
  original_tenant_id uuid REFERENCES tenants(id) ON DELETE SET NULL,
  body text,
  public_consent boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  UNIQUE (post_slug, user_id),
  -- Match Go strings.TrimSpace's Unicode whitespace set. Length is code points,
  -- not UTF-8 bytes. A tombstone reserves this account/post without retaining text.
  CHECK (body IS NULL OR (char_length(body) BETWEEN 1 AND 300 AND
    body = btrim(body, chr(9) || chr(10) || chr(11) || chr(12) || chr(13) || chr(32) || chr(133) || chr(160) || chr(5760) || chr(8192) || chr(8193) || chr(8194) || chr(8195) || chr(8196) || chr(8197) || chr(8198) || chr(8199) || chr(8200) || chr(8201) || chr(8202) || chr(8232) || chr(8233) || chr(8239) || chr(8287) || chr(12288)))),
  CHECK ((deleted_at IS NULL AND body IS NOT NULL) OR
         (deleted_at IS NOT NULL AND body IS NULL AND NOT public_consent))
);

CREATE INDEX blog_feedback_public_idx ON blog_feedback (post_slug, created_at, id)
  WHERE status = 'approved' AND public_consent AND deleted_at IS NULL;
CREATE INDEX blog_feedback_moderation_idx ON blog_feedback (status, created_at, id);

COMMIT;
