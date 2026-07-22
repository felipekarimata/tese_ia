-- RLS policies for multi_ai_sessions (021 created table without policies)
ALTER TABLE multi_ai_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Enable read access for all users" ON multi_ai_sessions
  FOR SELECT USING (true);

CREATE POLICY "Enable insert for all users" ON multi_ai_sessions
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Enable update for all users" ON multi_ai_sessions
  FOR UPDATE USING (true);

CREATE POLICY "Enable delete for all users" ON multi_ai_sessions
  FOR DELETE USING (true);
