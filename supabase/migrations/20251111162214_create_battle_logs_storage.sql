-- Create the battle-logs storage bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('battle-logs', 'battle-logs', true);

-- Allow authenticated users to upload files
CREATE POLICY "Authenticated users can upload battle logs"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'battle-logs');

-- Allow anyone to read files (public bucket)
CREATE POLICY "Anyone can read battle logs"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'battle-logs');

-- Allow users to delete only their own files
CREATE POLICY "Users can delete their own battle logs"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'battle-logs' AND auth.uid() = owner);

-- Allow users to update only their own files
CREATE POLICY "Users can update their own battle logs"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'battle-logs' AND auth.uid() = owner)
WITH CHECK (bucket_id = 'battle-logs' AND auth.uid() = owner);
