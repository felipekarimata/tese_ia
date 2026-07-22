-- Create operation_references table for storing references used in chapter operations
CREATE TABLE IF NOT EXISTS public.operation_references (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES public.chapter_operation_jobs(id) ON DELETE CASCADE,
  reference_type TEXT NOT NULL CHECK (reference_type IN ('link', 'file')),
  reference_content TEXT NOT NULL, -- URL for links, storage path for files
  title TEXT NOT NULL,
  description TEXT,
  file_name TEXT,
  file_size INTEGER,
  mime_type TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index for faster lookups by job_id
CREATE INDEX IF NOT EXISTS idx_operation_references_job_id ON public.operation_references(job_id);

-- Enable RLS
ALTER TABLE public.operation_references ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Allow all access (matching the pattern of theses, chapters, etc.)
CREATE POLICY "Allow all access to operation_references"
  ON public.operation_references
  FOR ALL
  USING (true);
