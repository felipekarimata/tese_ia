-- Multi-IA sessions for /3 command comparison workflow
CREATE TABLE IF NOT EXISTS multi_ai_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  target_type TEXT NOT NULL CHECK (target_type IN ('chapter', 'document')),
  target_id UUID NOT NULL,
  command TEXT NOT NULL,
  command_args TEXT DEFAULT '',
  providers TEXT[] NOT NULL,
  judge_provider TEXT DEFAULT 'gemini',
  status TEXT NOT NULL DEFAULT 'running',
  candidates JSONB DEFAULT '[]'::jsonb,
  winner_provider TEXT,
  winner_version_id UUID,
  judge_reasoning TEXT,
  judge_scores JSONB DEFAULT '{}'::jsonb,
  parent_version_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_multi_ai_sessions_target
  ON multi_ai_sessions (target_type, target_id, created_at DESC);

GRANT ALL ON multi_ai_sessions TO authenticated;
GRANT ALL ON multi_ai_sessions TO anon;

ALTER TABLE multi_ai_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Enable read access for all users" ON multi_ai_sessions
  FOR SELECT USING (true);

CREATE POLICY "Enable insert for all users" ON multi_ai_sessions
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Enable update for all users" ON multi_ai_sessions
  FOR UPDATE USING (true);

CREATE POLICY "Enable delete for all users" ON multi_ai_sessions
  FOR DELETE USING (true);
