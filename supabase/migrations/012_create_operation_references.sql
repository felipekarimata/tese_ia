-- Create table for storing reference materials used in operations
CREATE TABLE IF NOT EXISTS operation_references (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES chapter_operation_jobs(id) ON DELETE CASCADE,
  reference_type TEXT NOT NULL CHECK (reference_type IN ('link', 'file')),

  -- For links: stores the URL
  -- For files: stores the file path in storage
  reference_content TEXT NOT NULL,

  -- User-provided metadata
  title TEXT,
  description TEXT,

  -- File-specific metadata
  file_name TEXT,
  file_size BIGINT,
  mime_type TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create index for faster job lookups
CREATE INDEX IF NOT EXISTS idx_operation_references_job_id ON operation_references(job_id);

-- Enable RLS
ALTER TABLE operation_references ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can view references for their own jobs
CREATE POLICY "Users can view their own operation references" ON operation_references
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM chapter_operation_jobs coj
      JOIN chapter_versions cv ON coj.chapter_id = cv.chapter_id
      JOIN chapters c ON cv.chapter_id = c.id
      JOIN theses t ON c.thesis_id = t.id
      WHERE coj.id = operation_references.job_id
      AND t.user_id = auth.uid()
    )
  );

-- RLS Policy: Users can insert references for their own jobs
CREATE POLICY "Users can insert references for their own jobs" ON operation_references
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM chapter_operation_jobs coj
      JOIN chapter_versions cv ON coj.chapter_id = cv.chapter_id
      JOIN chapters c ON cv.chapter_id = c.id
      JOIN theses t ON c.thesis_id = t.id
      WHERE coj.id = operation_references.job_id
      AND t.user_id = auth.uid()
    )
  );

-- RLS Policy: Users can delete references for their own jobs
CREATE POLICY "Users can delete their own operation references" ON operation_references
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM chapter_operation_jobs coj
      JOIN chapter_versions cv ON coj.chapter_id = cv.chapter_id
      JOIN chapters c ON cv.chapter_id = c.id
      JOIN theses t ON c.thesis_id = t.id
      WHERE coj.id = operation_references.job_id
      AND t.user_id = auth.uid()
    )
  );
