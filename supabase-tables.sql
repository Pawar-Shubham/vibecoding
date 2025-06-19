-- Create user_data table to store user-specific data
CREATE TABLE IF NOT EXISTS user_data (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  
  -- Add additional fields as needed
  preferences JSONB DEFAULT '{}'::JSONB,
  settings JSONB DEFAULT '{}'::JSONB,
  
  UNIQUE(user_id)
);

-- Enable Row Level Security on user_data
ALTER TABLE user_data ENABLE ROW LEVEL SECURITY;

-- Create policy for user_data
CREATE POLICY "Users can manage their own data"
  ON user_data
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Create projects table to store user projects
CREATE TABLE IF NOT EXISTS projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  is_public BOOLEAN DEFAULT false,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  
  CONSTRAINT fk_user_id FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE
);

-- Enable Row Level Security on projects
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;

-- Create policy for projects
CREATE POLICY "Users can manage their own projects"
  ON projects
  USING (auth.uid() = user_id OR is_public = true)
  WITH CHECK (auth.uid() = user_id);

-- Create chats table to store chat history
CREATE TABLE IF NOT EXISTS chats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  
  CONSTRAINT fk_user_id FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE
);

-- Enable Row Level Security on chats
ALTER TABLE chats ENABLE ROW LEVEL SECURITY;

-- Create policy for chats
CREATE POLICY "Users can manage their own chats"
  ON chats
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Create messages table to store chat messages
CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id UUID NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  
  CONSTRAINT fk_chat_id FOREIGN KEY (chat_id) REFERENCES chats(id) ON DELETE CASCADE
);

-- Enable Row Level Security on messages
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

-- Create policy for messages
CREATE POLICY "Users can manage their own messages"
  ON messages
  USING (chat_id IN (SELECT id FROM chats WHERE user_id = auth.uid()))
  WITH CHECK (chat_id IN (SELECT id FROM chats WHERE user_id = auth.uid()));

-- Create files table to store user files and code
CREATE TABLE IF NOT EXISTS files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  content TEXT,
  file_path TEXT NOT NULL,
  file_type TEXT,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  
  CONSTRAINT fk_user_id FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE
);

-- Enable Row Level Security on files
ALTER TABLE files ENABLE ROW LEVEL SECURITY;

-- Create policy for files
CREATE POLICY "Users can manage their own files"
  ON files
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Create project_chats table to link chats with projects
CREATE TABLE IF NOT EXISTS project_chats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  chat_id UUID NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  
  UNIQUE(project_id, chat_id)
);

-- Enable Row Level Security on project_chats
ALTER TABLE project_chats ENABLE ROW LEVEL SECURITY;

-- Create policy for project_chats
CREATE POLICY "Users can manage their own project chats"
  ON project_chats
  USING (project_id IN (SELECT id FROM projects WHERE user_id = auth.uid()))
  WITH CHECK (project_id IN (SELECT id FROM projects WHERE user_id = auth.uid()));

-- Create user_connections table to store API tokens for external services
CREATE TABLE IF NOT EXISTS user_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('github', 'netlify', 'vercel', 'supabase')),
  token TEXT, -- Encrypted token
  token_type TEXT, -- 'classic' or 'fine-grained' for GitHub
  user_data JSONB DEFAULT '{}'::JSONB, -- Store user info from the provider
  stats JSONB DEFAULT '{}'::JSONB, -- Store stats/metadata
  is_active BOOLEAN DEFAULT true,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  
  CONSTRAINT fk_user_id FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE,
  UNIQUE(user_id, provider)
);

-- Enable Row Level Security on user_connections
ALTER TABLE user_connections ENABLE ROW LEVEL SECURITY;

-- Create policy for user_connections
CREATE POLICY "Users can manage their own connections"
  ON user_connections
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Create function to handle updated_at timestamp
CREATE OR REPLACE FUNCTION update_modified_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers for updated_at timestamps
CREATE TRIGGER update_user_data_updated_at
BEFORE UPDATE ON user_data
FOR EACH ROW
EXECUTE FUNCTION update_modified_column();

CREATE TRIGGER update_chats_updated_at
BEFORE UPDATE ON chats
FOR EACH ROW
EXECUTE FUNCTION update_modified_column();

CREATE TRIGGER update_files_updated_at
BEFORE UPDATE ON files
FOR EACH ROW
EXECUTE FUNCTION update_modified_column();

CREATE TRIGGER update_projects_updated_at
BEFORE UPDATE ON projects
FOR EACH ROW
EXECUTE FUNCTION update_modified_column();

CREATE TRIGGER update_user_connections_updated_at
BEFORE UPDATE ON user_connections
FOR EACH ROW
EXECUTE FUNCTION update_modified_column(); 