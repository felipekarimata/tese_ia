-- Create adapt_jobs table for document style/audience adaptation jobs
CREATE TABLE IF NOT EXISTS adapt_jobs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'adapting', 'completed', 'error')),

  -- Adaptation parameters
  style TEXT NOT NULL CHECK (style IN ('academic', 'professional', 'simplified', 'custom')),
  target_audience TEXT, -- Required when style is 'custom'

  -- Provider and model info
  provider TEXT NOT NULL DEFAULT 'openai',
  model TEXT NOT NULL DEFAULT 'gpt-5.4-mini',

  -- Context and structure
  document_structure JSONB, -- { sections: [...], totalParagraphs }

  -- Suggestions
  suggestions JSONB DEFAULT '[]'::jsonb, -- Array of adaptation suggestions

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

-- Create indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_adapt_jobs_document_id ON adapt_jobs(document_id);
CREATE INDEX IF NOT EXISTS idx_adapt_jobs_status ON adapt_jobs(status);
CREATE INDEX IF NOT EXISTS idx_adapt_jobs_style ON adapt_jobs(style);

-- Enable RLS
ALTER TABLE adapt_jobs ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can view all adapt jobs (for now)
CREATE POLICY "Enable read access for all users" ON adapt_jobs
  FOR SELECT USING (true);

-- RLS Policy: Users can insert their own adapt jobs
CREATE POLICY "Enable insert for all users" ON adapt_jobs
  FOR INSERT WITH CHECK (true);

-- RLS Policy: Users can update their own adapt jobs
CREATE POLICY "Enable update for all users" ON adapt_jobs
  FOR UPDATE USING (true);

COMMENT ON TABLE adapt_jobs IS 'Stores document style/audience adaptation jobs and suggestions';
COMMENT ON COLUMN adapt_jobs.style IS 'Target style: academic, professional, simplified, or custom';
COMMENT ON COLUMN adapt_jobs.target_audience IS 'Target audience description (required when style is custom)';
COMMENT ON COLUMN adapt_jobs.suggestions IS 'Array of adaptation suggestions with original/adapted text, reason, and adaptation type';
