-- Create storage bucket for reference materials
INSERT INTO storage.buckets (id, name, public)
VALUES ('reference-materials', 'reference-materials', false)
ON CONFLICT (id) DO NOTHING;

-- Set up storage policies for reference materials bucket
-- Allow authenticated users to upload
CREATE POLICY "Users can upload reference materials"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'reference-materials');

-- Allow authenticated users to read their own reference materials
CREATE POLICY "Users can read reference materials"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'reference-materials');

-- Allow authenticated users to delete their own reference materials
CREATE POLICY "Users can delete reference materials"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'reference-materials');
