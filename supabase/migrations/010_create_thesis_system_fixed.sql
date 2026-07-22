-- ============================================================================
-- MIGRATION: Thesis System with Versioned Chapters
-- Description: Transform project-document system into thesis-chapters with versioning
-- Date: 2024-11-29
-- ============================================================================

-- ============================================================================
-- TABLE: theses
-- ============================================================================
CREATE TABLE IF NOT EXISTS theses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_theses_created_at ON theses(created_at DESC);

-- ============================================================================
-- TABLE: chapters
-- ============================================================================
CREATE TABLE IF NOT EXISTS chapters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thesis_id UUID NOT NULL REFERENCES theses(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  chapter_order INTEGER NOT NULL,
  current_version_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(thesis_id, chapter_order),
  UNIQUE(thesis_id, title)
);

CREATE INDEX idx_chapters_thesis_id ON chapters(thesis_id);
CREATE INDEX idx_chapters_order ON chapters(thesis_id, chapter_order);

-- ============================================================================
-- TABLE: chapter_versions
-- ============================================================================
CREATE TABLE IF NOT EXISTS chapter_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chapter_id UUID NOT NULL REFERENCES chapters(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL,
  parent_version_id UUID REFERENCES chapter_versions(id) ON DELETE SET NULL,
  file_path TEXT NOT NULL,
  pages INTEGER,
  chunks_count INTEGER,
  created_by_operation TEXT NOT NULL DEFAULT 'upload',
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(chapter_id, version_number)
);

CREATE INDEX idx_chapter_versions_chapter_id ON chapter_versions(chapter_id);
CREATE INDEX idx_chapter_versions_version_number ON chapter_versions(chapter_id, version_number DESC);
CREATE INDEX idx_chapter_versions_parent ON chapter_versions(parent_version_id);

-- ============================================================================
-- TABLE: chapter_chunks
-- ============================================================================
CREATE TABLE IF NOT EXISTS chapter_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chapter_version_id UUID NOT NULL REFERENCES chapter_versions(id) ON DELETE CASCADE,
  chunk_index INTEGER NOT NULL,
  page_from INTEGER NOT NULL,
  page_to INTEGER NOT NULL,
  text TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(chapter_version_id, chunk_index)
);

CREATE INDEX idx_chapter_chunks_version_id ON chapter_chunks(chapter_version_id);
CREATE INDEX idx_chapter_chunks_chunk_index ON chapter_chunks(chapter_version_id, chunk_index);
CREATE INDEX idx_chapter_chunks_text_search ON chapter_chunks USING gin(to_tsvector('portuguese', text));

-- ============================================================================
-- Foreign Key: chapters.current_version_id
-- ============================================================================
ALTER TABLE chapters
  ADD CONSTRAINT fk_chapters_current_version
  FOREIGN KEY (current_version_id)
  REFERENCES chapter_versions(id)
  ON DELETE SET NULL;

-- ============================================================================
-- UPDATE EXISTING TABLES
-- ============================================================================
ALTER TABLE pipeline_jobs
  ADD COLUMN IF NOT EXISTS chapter_version_id UUID REFERENCES chapter_versions(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_pipeline_jobs_chapter_version ON pipeline_jobs(chapter_version_id);

ALTER TABLE improvement_jobs
  ADD COLUMN IF NOT EXISTS chapter_version_id UUID REFERENCES chapter_versions(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_improvement_jobs_chapter_version ON improvement_jobs(chapter_version_id);

ALTER TABLE translation_jobs
  ADD COLUMN IF NOT EXISTS chapter_version_id UUID REFERENCES chapter_versions(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_translation_jobs_chapter_version ON translation_jobs(chapter_version_id);

ALTER TABLE norm_update_jobs
  ADD COLUMN IF NOT EXISTS chapter_version_id UUID REFERENCES chapter_versions(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_norm_update_jobs_chapter_version ON norm_update_jobs(chapter_version_id);

-- ============================================================================
-- TRIGGERS
-- ============================================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_theses_updated_at
  BEFORE UPDATE ON theses
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_chapters_updated_at
  BEFORE UPDATE ON chapters
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- RLS POLICIES
-- ============================================================================
ALTER TABLE theses ENABLE ROW LEVEL SECURITY;
ALTER TABLE chapters ENABLE ROW LEVEL SECURITY;
ALTER TABLE chapter_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE chapter_chunks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access to theses" ON theses FOR ALL USING (true);
CREATE POLICY "Allow all access to chapters" ON chapters FOR ALL USING (true);
CREATE POLICY "Allow all access to chapter_versions" ON chapter_versions FOR ALL USING (true);
CREATE POLICY "Allow all access to chapter_chunks" ON chapter_chunks FOR ALL USING (true);

-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================
CREATE OR REPLACE FUNCTION get_next_chapter_order(p_thesis_id UUID)
RETURNS INTEGER AS $$
BEGIN
  RETURN COALESCE(
    (SELECT MAX(chapter_order) + 1 FROM chapters WHERE thesis_id = p_thesis_id),
    1
  );
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION get_next_version_number(p_chapter_id UUID)
RETURNS INTEGER AS $$
BEGIN
  RETURN COALESCE(
    (SELECT MAX(version_number) + 1 FROM chapter_versions WHERE chapter_id = p_chapter_id),
    1
  );
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION create_chapter_version(
  p_chapter_id UUID,
  p_file_path TEXT,
  p_pages INTEGER,
  p_chunks_count INTEGER,
  p_created_by_operation TEXT,
  p_parent_version_id UUID DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'
)
RETURNS UUID AS $$
DECLARE
  v_version_number INTEGER;
  v_version_id UUID;
BEGIN
  v_version_number := get_next_version_number(p_chapter_id);

  INSERT INTO chapter_versions (
    chapter_id,
    version_number,
    parent_version_id,
    file_path,
    pages,
    chunks_count,
    created_by_operation,
    metadata
  ) VALUES (
    p_chapter_id,
    v_version_number,
    p_parent_version_id,
    p_file_path,
    p_pages,
    p_chunks_count,
    p_created_by_operation,
    p_metadata
  ) RETURNING id INTO v_version_id;

  UPDATE chapters
  SET current_version_id = v_version_id
  WHERE id = p_chapter_id;

  RETURN v_version_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- VIEWS
-- ============================================================================
CREATE OR REPLACE VIEW thesis_summary AS
SELECT
  t.id,
  t.title,
  t.description,
  t.created_at,
  t.updated_at,
  COUNT(c.id) as chapter_count,
  MIN(c.chapter_order) as first_chapter_order,
  MAX(c.chapter_order) as last_chapter_order
FROM theses t
LEFT JOIN chapters c ON c.thesis_id = t.id
GROUP BY t.id;

CREATE OR REPLACE VIEW chapter_details AS
SELECT
  c.id as chapter_id,
  c.thesis_id,
  c.title as chapter_title,
  c.chapter_order,
  c.created_at as chapter_created_at,
  c.updated_at as chapter_updated_at,
  cv.id as current_version_id,
  cv.version_number,
  cv.file_path,
  cv.pages,
  cv.chunks_count,
  cv.created_by_operation,
  cv.metadata,
  cv.created_at as version_created_at,
  (SELECT COUNT(*) FROM chapter_versions WHERE chapter_id = c.id) as total_versions
FROM chapters c
LEFT JOIN chapter_versions cv ON cv.id = c.current_version_id;

-- ============================================================================
-- COMMENTS
-- ============================================================================
COMMENT ON TABLE theses IS 'Main container for thesis/dissertation projects';
COMMENT ON TABLE chapters IS 'Chapters within a thesis, ordered sequentially';
COMMENT ON TABLE chapter_versions IS 'Version history for each chapter with provenance tracking';
COMMENT ON TABLE chapter_chunks IS 'Persisted text chunks for RAG with full metadata';

COMMENT ON COLUMN chapters.chapter_order IS 'Sequential ordering of chapters (1, 2, 3...)';
COMMENT ON COLUMN chapters.current_version_id IS 'Points to the active/latest version of this chapter';
COMMENT ON COLUMN chapter_versions.parent_version_id IS 'Tracks version lineage';
COMMENT ON COLUMN chapter_versions.created_by_operation IS 'How this version was created';
COMMENT ON COLUMN chapter_chunks.chunk_index IS 'Sequential position of chunk in document';
