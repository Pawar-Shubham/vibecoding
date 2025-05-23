import { useStore } from '@nanostores/react';
import { useEffect, useState } from 'react';
import { useParams } from '@remix-run/react';
import { supabase } from '~/lib/supabase';
import { authStore } from '~/lib/stores/auth';
import { FiFile, FiMessageSquare } from 'react-icons/fi';

interface Project {
  id: string;
  name: string;
  description: string;
  created_at: string;
}

interface ProjectFile {
  id: string;
  name: string;
  content: string;
  file_path: string;
  file_type: string;
  updated_at: string;
}

interface ProjectChat {
  id: string;
  title: string;
  description: string;
  messages: Array<{
    role: string;
    content: string;
    created_at: string;
  }>;
}

export function ProjectView() {
  const { projectId } = useParams();
  const auth = useStore(authStore);
  const [project, setProject] = useState<Project | null>(null);
  const [files, setFiles] = useState<ProjectFile[]>([]);
  const [chats, setChats] = useState<ProjectChat[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'files' | 'chats'>('files');

  useEffect(() => {
    if (projectId && auth.user) {
      loadProjectData();
    }
  }, [projectId, auth.user]);

  async function loadProjectData() {
    try {
      setLoading(true);

      // Load project details
      const { data: projectData, error: projectError } = await supabase
        .from('projects')
        .select('*')
        .eq('id', projectId)
        .single();

      if (projectError) throw projectError;
      setProject(projectData);

      // Load project files
      const { data: filesData, error: filesError } = await supabase
        .from('files')
        .select('*')
        .eq('project_id', projectId)
        .order('file_path', { ascending: true });

      if (filesError) throw filesError;
      setFiles(filesData || []);

      // Load project chats
      const { data: chatsData, error: chatsError } = await supabase
        .from('chats')
        .select(`
          id,
          title,
          description,
          messages (
            role,
            content,
            created_at
          )
        `)
        .eq('project_id', projectId)
        .order('created_at', { ascending: false });

      if (chatsError) throw chatsError;
      setChats(chatsData || []);
    } catch (error) {
      console.error('Error loading project data:', error);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-pulse">Loading project...</div>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-red-500">Project not found</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="border-b border-gray-200 dark:border-gray-700 p-4">
        <h1 className="text-2xl font-bold mb-2">{project.name}</h1>
        {project.description && (
          <p className="text-gray-600 dark:text-gray-400">{project.description}</p>
        )}
      </div>

      <div className="flex border-b border-gray-200 dark:border-gray-700">
        <button
          className={`px-4 py-2 ${
            activeTab === 'files'
              ? 'border-b-2 border-blue-500 text-blue-500'
              : 'text-gray-600 dark:text-gray-400'
          }`}
          onClick={() => setActiveTab('files')}
        >
          Files
        </button>
        <button
          className={`px-4 py-2 ${
            activeTab === 'chats'
              ? 'border-b-2 border-blue-500 text-blue-500'
              : 'text-gray-600 dark:text-gray-400'
          }`}
          onClick={() => setActiveTab('chats')}
        >
          Chats
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {activeTab === 'files' ? (
          <div className="space-y-2">
            {files.length === 0 ? (
              <div className="text-center text-gray-500">
                <p>No files in this project</p>
              </div>
            ) : (
              files.map((file) => (
                <div
                  key={file.id}
                  className="flex items-center gap-2 p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 cursor-pointer"
                >
                  <FiFile className="text-gray-500" />
                  <div>
                    <p className="font-medium">{file.name}</p>
                    <p className="text-sm text-gray-500">{file.file_path}</p>
                  </div>
                </div>
              ))
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {chats.length === 0 ? (
              <div className="text-center text-gray-500">
                <p>No chats in this project</p>
              </div>
            ) : (
              chats.map((chat) => (
                <div
                  key={chat.id}
                  className="border border-gray-200 dark:border-gray-700 rounded-lg p-4"
                >
                  <div className="flex items-center gap-2 mb-2">
                    <FiMessageSquare className="text-blue-500" />
                    <h3 className="font-medium">{chat.title}</h3>
                  </div>
                  {chat.description && (
                    <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                      {chat.description}
                    </p>
                  )}
                  <div className="text-sm text-gray-500">
                    {chat.messages.length} messages
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
} 