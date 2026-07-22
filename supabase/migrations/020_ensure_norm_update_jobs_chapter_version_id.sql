-- Garante coluna para jobs de normas por capítulo (idempotente se 010 já rodou).
ALTER TABLE norm_update_jobs
  ADD COLUMN IF NOT EXISTS chapter_version_id UUID REFERENCES chapter_versions(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_norm_update_jobs_chapter_version ON norm_update_jobs(chapter_version_id);
