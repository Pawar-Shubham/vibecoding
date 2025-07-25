-- Create canvas_data table to store canvas state for each chat
CREATE TABLE IF NOT EXISTS canvas_data (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  chat_id TEXT NOT NULL,
  objects JSONB NOT NULL DEFAULT '[]'::JSONB,
  viewport JSONB NOT NULL DEFAULT '{"x": 0, "y": 0, "scale": 1}'::JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  
  CONSTRAINT fk_user_id FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE,
  UNIQUE(user_id, chat_id)
);

-- Enable Row Level Security on canvas_data
ALTER TABLE canvas_data ENABLE ROW LEVEL SECURITY;

-- Create policy for canvas_data
CREATE POLICY "Users can manage their own canvas data"
  ON canvas_data
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS canvas_data_user_id_idx ON canvas_data(user_id);
CREATE INDEX IF NOT EXISTS canvas_data_chat_id_idx ON canvas_data(chat_id);
CREATE INDEX IF NOT EXISTS canvas_data_user_chat_idx ON canvas_data(user_id, chat_id);

-- Create trigger for updated_at timestamp
CREATE TRIGGER update_canvas_data_updated_at
    BEFORE UPDATE ON canvas_data
    FOR EACH ROW
    EXECUTE FUNCTION update_modified_column(); 