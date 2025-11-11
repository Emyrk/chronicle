-- Create battle_log_uploads table to track uploaded files
CREATE TABLE battle_log_uploads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_size BIGINT NOT NULL,
  content_type TEXT DEFAULT 'text/plain',
  status TEXT NOT NULL DEFAULT 'uploaded' CHECK (status IN ('uploaded', 'processing', 'parsed', 'error')),
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create index for faster user queries
CREATE INDEX idx_battle_log_uploads_user_id ON battle_log_uploads(user_id);
CREATE INDEX idx_battle_log_uploads_status ON battle_log_uploads(status);
CREATE INDEX idx_battle_log_uploads_created_at ON battle_log_uploads(created_at DESC);

-- Enable RLS
ALTER TABLE battle_log_uploads ENABLE ROW LEVEL SECURITY;

-- Users can view their own uploads
CREATE POLICY "Users can view their own uploads"
ON battle_log_uploads FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- Users can insert their own uploads
CREATE POLICY "Users can insert their own uploads"
ON battle_log_uploads FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

-- Users can update their own uploads
CREATE POLICY "Users can update their own uploads"
ON battle_log_uploads FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Users can delete their own uploads
CREATE POLICY "Users can delete their own uploads"
ON battle_log_uploads FOR DELETE
TO authenticated
USING (auth.uid() = user_id);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically update updated_at
CREATE TRIGGER update_battle_log_uploads_updated_at
  BEFORE UPDATE ON battle_log_uploads
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
