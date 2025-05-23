-- Create chat_history table
CREATE TABLE IF NOT EXISTS chat_history (
  id TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  url_id TEXT,
  description TEXT,
  messages JSONB NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE chat_history ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can read their own chats"
  ON chat_history
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own chats"
  ON chat_history
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own chats"
  ON chat_history
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own chats"
  ON chat_history
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Create indexes
CREATE INDEX IF NOT EXISTS chat_history_user_id_idx ON chat_history(user_id);
CREATE INDEX IF NOT EXISTS chat_history_url_id_idx ON chat_history(url_id);

-- Create updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_chat_history_updated_at
    BEFORE UPDATE ON chat_history
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column(); 