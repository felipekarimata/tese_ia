-- Create thesis_versions table for compiled/merged thesis documents
CREATE TABLE thesis_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thesis_id UUID NOT NULL REFERENCES theses(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL,
  file_path TEXT NOT NULL,
  total_pages INTEGER,
  chapters_included JSONB NOT NULL DEFAULT '[]'::jsonb,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(thesis_id, version_number)
);

-- Create indexes for better query performance
CREATE INDEX idx_thesis_versions_thesis_id ON thesis_versions(thesis_id);
CREATE INDEX idx_thesis_versions_version_number ON thesis_versions(thesis_id, version_number DESC);

-- Function to get next version number for a thesis
CREATE OR REPLACE FUNCTION get_next_thesis_version_number(p_thesis_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_next_version INTEGER;
BEGIN
  SELECT COALESCE(MAX(version_number), 0) + 1
  INTO v_next_version
  FROM thesis_versions
  WHERE thesis_id = p_thesis_id;

  RETURN v_next_version;
END;
$$;

-- Function to create a new thesis version
CREATE OR REPLACE FUNCTION create_thesis_version(
  p_thesis_id UUID,
  p_file_path TEXT,
  p_total_pages INTEGER,
  p_chapters_included JSONB,
  p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS UUID
LANGUAGE plpgsql
AS $$
DECLARE
  v_version_id UUID;
  v_version_number INTEGER;
BEGIN
  -- Get next version number
  v_version_number := get_next_thesis_version_number(p_thesis_id);

  -- Insert new thesis version
  INSERT INTO thesis_versions (
    thesis_id,
    version_number,
    file_path,
    total_pages,
    chapters_included,
    metadata
  ) VALUES (
    p_thesis_id,
    v_version_number,
    p_file_path,
    p_total_pages,
    p_chapters_included,
    p_metadata
  )
  RETURNING id INTO v_version_id;

  RETURN v_version_id;
END;
$$;
