-- Create table for tracking chapter operation jobs
CREATE TABLE IF NOT EXISTS chapter_operation_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chapter_id UUID NOT NULL REFERENCES chapters(id) ON DELETE CASCADE,
  version_id UUID NOT NULL REFERENCES chapter_versions(id) ON DELETE CASCADE,
  operation TEXT NOT NULL CHECK (operation IN ('improve', 'translate', 'adjust', 'adapt', 'update')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'error')),
  progress INTEGER NOT NULL DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
  error_message TEXT,
  new_version_id UUID REFERENCES chapter_versions(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);

-- Create indexes for better query performance
CREATE INDEX idx_chapter_operation_jobs_chapter ON chapter_operation_jobs(chapter_id);
CREATE INDEX idx_chapter_operation_jobs_version ON chapter_operation_jobs(version_id);
CREATE INDEX idx_chapter_operation_jobs_status ON chapter_operation_jobs(status);
CREATE INDEX idx_chapter_operation_jobs_created ON chapter_operation_jobs(created_at DESC);

-- Add RLS policies
ALTER TABLE chapter_operation_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all operations on chapter_operation_jobs"
  ON chapter_operation_jobs
  FOR ALL
  USING (true)
  WITH CHECK (true);
