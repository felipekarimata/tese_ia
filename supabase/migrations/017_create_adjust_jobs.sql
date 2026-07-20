-- Create adjust_jobs table for document adjustment jobs
CREATE TABLE IF NOT EXISTS adjust_jobs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'adjusting', 'completed', 'error')),

  -- Adjustment parameters
  instructions TEXT NOT NULL, -- User instructions for adjustments
  creativity INTEGER NOT NULL DEFAULT 5 CHECK (creativity >= 0 AND creativity <= 10), -- 0-10 scale
  use_grounding BOOLEAN DEFAULT false, -- Whether to use Google Search Grounding

  -- Provider and model info
  provider TEXT NOT NULL DEFAULT 'openai',
  model TEXT NOT NULL DEFAULT 'gpt-5.4-mini',

  -- Context and structure
  document_structure JSONB, -- { sections: [...], totalParagraphs }

  -- Suggestions
  suggestions JSONB DEFAULT '[]'::jsonb, -- Array of adjustment suggestions

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
CREATE INDEX IF NOT EXISTS idx_adjust_jobs_document_id ON adjust_jobs(document_id);
CREATE INDEX IF NOT EXISTS idx_adjust_jobs_status ON adjust_jobs(status);

-- Enable RLS
ALTER TABLE adjust_jobs ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can view all adjust jobs (for now)
CREATE POLICY "Enable read access for all users" ON adjust_jobs
  FOR SELECT USING (true);

-- RLS Policy: Users can insert their own adjust jobs
CREATE POLICY "Enable insert for all users" ON adjust_jobs
  FOR INSERT WITH CHECK (true);

-- RLS Policy: Users can update their own adjust jobs
CREATE POLICY "Enable update for all users" ON adjust_jobs
  FOR UPDATE USING (true);

COMMENT ON TABLE adjust_jobs IS 'Stores document adjustment jobs based on user instructions';
COMMENT ON COLUMN adjust_jobs.instructions IS 'User-provided instructions for document adjustments';
COMMENT ON COLUMN adjust_jobs.creativity IS 'Creativity level (0-10) controlling how instructions are applied';
COMMENT ON COLUMN adjust_jobs.use_grounding IS 'Whether to use Google Search Grounding for enhanced context';
COMMENT ON COLUMN adjust_jobs.suggestions IS 'Array of adjustment suggestions with original/adjusted text and reasoning';
