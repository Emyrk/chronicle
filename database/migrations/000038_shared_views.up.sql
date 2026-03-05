CREATE TABLE shared_views (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  instance_id UUID NOT NULL REFERENCES instances(id) ON DELETE CASCADE,
  payload JSONB NOT NULL,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_shared_views_code ON shared_views(code);
