-- Add metadata column to chapter_operation_jobs table
-- This column will store suggestions and other operation-specific data

ALTER TABLE public.chapter_operation_jobs
ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;

-- Create index for faster metadata queries
CREATE INDEX IF NOT EXISTS idx_chapter_operation_jobs_metadata
ON public.chapter_operation_jobs USING gin(metadata);

-- Add comment
COMMENT ON COLUMN public.chapter_operation_jobs.metadata IS 'Stores operation-specific data like suggestions, instructions, settings, etc.';
