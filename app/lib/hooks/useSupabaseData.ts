import { useState } from 'react';
import { supabase } from '~/lib/supabase';
import { useAuth } from './useAuth';
import type { Message } from 'ai';

export interface ChatData {
  id: string;
  title: string;
  description?: string;
  updated_at: string;
  created_at: string;
}

export function useSupabaseData() {
  const { user, isAuthenticated } = useAuth();
  const [loading, setLoading] = useState(false);

  // Save chat to Supabase
  const saveChat = async (title: string, description: string, messages: Message[]) => {
    if (!isAuthenticated || !user) return null;
    
    setLoading(true);
    
    try {
      // Create chat entry
      const { data: chatData, error: chatError } = await supabase
        .from('chats')
        .insert({
          user_id: user.id,
          title,
          description
        })
        .select('id')
        .single();
      
      if (chatError) throw chatError;
      
      // Save messages
      if (messages.length > 0) {
        const messagesForInsert = messages.map(message => ({
          chat_id: chatData.id,
          role: message.role,
          content: typeof message.content === 'string' 
            ? message.content 
            : JSON.stringify(message.content)
        }));
        
        const { error: messagesError } = await supabase
          .from('messages')
          .insert(messagesForInsert);
        
        if (messagesError) throw messagesError;
      }
      
      return chatData.id;
    } catch (error) {
      console.error('Error saving chat:', error);
      return null;
    } finally {
      setLoading(false);
    }
  };

  // Get user's chats
  const getUserChats = async (): Promise<ChatData[]> => {
    if (!isAuthenticated || !user) return [];
    
    setLoading(true);
    
    try {
      const { data, error } = await supabase
        .from('chats')
        .select('*')
        .eq('user_id', user.id)
        .order('updated_at', { ascending: false });
      
      if (error) throw error;
      
      return data || [];
    } catch (error) {
      console.error('Error fetching chats:', error);
      return [];
    } finally {
      setLoading(false);
    }
  };

  // Get chat messages
  const getChatMessages = async (chatId: string): Promise<Message[]> => {
    if (!isAuthenticated || !user) return [];
    
    setLoading(true);
    
    try {
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .eq('chat_id', chatId)
        .order('created_at', { ascending: true });
      
      if (error) throw error;
      
      return data?.map(message => ({
        id: message.id,
        role: message.role as Message['role'],
        content: message.content,
        createdAt: new Date(message.created_at).getTime(),
      })) || [];
    } catch (error) {
      console.error('Error fetching messages:', error);
      return [];
    } finally {
      setLoading(false);
    }
  };

  // Save file content
  const saveFile = async (name: string, content: string, filePath: string, fileType: string) => {
    if (!isAuthenticated || !user) return null;
    
    setLoading(true);
    
    try {
      const { data, error } = await supabase
        .from('files')
        .upsert({
          user_id: user.id,
          name,
          content,
          file_path: filePath,
          file_type: fileType
        })
        .select('id')
        .single();
      
      if (error) throw error;
      
      return data.id;
    } catch (error) {
      console.error('Error saving file:', error);
      return null;
    } finally {
      setLoading(false);
    }
  };

  // Get user's files
  const getUserFiles = async () => {
    if (!isAuthenticated || !user) return [];
    
    setLoading(true);
    
    try {
      const { data, error } = await supabase
        .from('files')
        .select('*')
        .eq('user_id', user.id)
        .order('updated_at', { ascending: false });
      
      if (error) throw error;
      
      return data || [];
    } catch (error) {
      console.error('Error fetching files:', error);
      return [];
    } finally {
      setLoading(false);
    }
  };

  return {
    loading,
    saveChat,
    getUserChats,
    getChatMessages,
    saveFile,
    getUserFiles
  };
} 