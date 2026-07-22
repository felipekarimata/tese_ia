-- Create improvement_jobs table for document improvement suggestions
CREATE TABLE IF NOT EXISTS improvement_jobs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'analyzing', 'completed', 'error')),

  -- Context and structure
  global_context JSONB, -- { title, abstract, chapters, theme }
  document_structure JSONB, -- { sections: [...], totalParagraphs, totalChapters }

  -- Suggestions
  suggestions JSONB DEFAULT '[]'::jsonb, -- Array of improvement suggestions

  -- Progress tracking
  current_section INTEGER DEFAULT 0,
  total_sections INTEGER DEFAULT 0,
  progress_percentage INTEGER DEFAULT 0,

  -- Metadata
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE
);

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_improvement_jobs_document_id ON improvement_jobs(document_id);
CREATE INDEX IF NOT EXISTS idx_improvement_jobs_status ON improvement_jobs(status);

-- Enable RLS
ALTER TABLE improvement_jobs ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can view all improvement jobs (for now)
CREATE POLICY "Enable read access for all users" ON improvement_jobs
  FOR SELECT USING (true);

-- RLS Policy: Users can insert their own improvement jobs
CREATE POLICY "Enable insert for all users" ON improvement_jobs
  FOR INSERT WITH CHECK (true);

-- RLS Policy: Users can update their own improvement jobs
CREATE POLICY "Enable update for all users" ON improvement_jobs
  FOR UPDATE USING (true);

COMMENT ON TABLE improvement_jobs IS 'Stores document improvement analysis jobs and suggestions';
COMMENT ON COLUMN improvement_jobs.global_context IS 'Global document context (theme, structure) used for consistent analysis';
COMMENT ON COLUMN improvement_jobs.suggestions IS 'Array of improvement suggestions with original/improved text and reasoning';
