-- Persistent, resumable editorial workflow for assembling selected chapters into a book.
CREATE TABLE IF NOT EXISTS book_assembly_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thesis_id UUID NOT NULL REFERENCES theses(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('compile', 'harmonize', 'structural')),
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN (
    'queued', 'analyzing', 'awaiting_plan_approval', 'harmonizing',
    'awaiting_changes_approval', 'finalizing', 'completed', 'failed', 'cancelled'
  )),
  provider TEXT,
  model TEXT,
  custom_instructions TEXT NOT NULL DEFAULT '',
  include_cover_page BOOLEAN NOT NULL DEFAULT TRUE,
  chapter_selections JSONB NOT NULL DEFAULT '[]'::jsonb,
  editorial_plan JSONB,
  chapter_results JSONB NOT NULL DEFAULT '[]'::jsonb,
  approved_suggestion_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  finalization_report JSONB,
  progress INTEGER NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
  progress_label TEXT NOT NULL DEFAULT '',
  current_chapter_index INTEGER NOT NULL DEFAULT 0,
  resume_stage TEXT CHECK (resume_stage IN ('analyzing', 'harmonizing', 'finalizing')),
  result_thesis_version_id UUID REFERENCES thesis_versions(id) ON DELETE SET NULL,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_book_assembly_jobs_thesis
  ON book_assembly_jobs (thesis_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_book_assembly_jobs_status
  ON book_assembly_jobs (status, updated_at);

GRANT ALL ON book_assembly_jobs TO authenticated;
GRANT ALL ON book_assembly_jobs TO anon;

ALTER TABLE book_assembly_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Enable read access for all users" ON book_assembly_jobs
  FOR SELECT USING (true);

CREATE POLICY "Enable insert for all users" ON book_assembly_jobs
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Enable update for all users" ON book_assembly_jobs
  FOR UPDATE USING (true);

CREATE POLICY "Enable delete for all users" ON book_assembly_jobs
  FOR DELETE USING (true);
