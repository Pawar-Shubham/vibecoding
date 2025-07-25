import { supabase } from '~/lib/supabase';
import { createScopedLogger } from '~/utils/logger';
import { toast } from 'react-toastify';

const logger = createScopedLogger('CanvasSync');

export interface CanvasObject {
  id: string;
  type: 'note' | 'shape' | 'text' | 'image' | 'drawing' | 'frame';
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  content?: string;
  color?: string;
  shape?: 'rectangle' | 'circle' | 'triangle';
  imageUrl?: string;
  zIndex: number;
  points?: { x: number; y: number }[];
  fontWeight?: 'normal' | 'bold';
  fontStyle?: 'normal' | 'italic';
  textDecoration?: 'none' | 'underline';
  fontSize?: number;
  penStyle?: {
    key: string;
    label: string;
    strokeWidth: number;
    dash: string;
    opacity: number;
    icon: JSX.Element;
  };
  framePreset?: string;
  label?: string;
  textColor?: string;
}

export interface CanvasViewport {
  x: number;
  y: number;
  scale: number;
}

export interface CanvasData {
  objects: CanvasObject[];
  viewport: CanvasViewport;
}

export interface CanvasDbRecord {
  id: string;
  user_id: string;
  chat_id: string;
  objects: CanvasObject[];
  viewport: CanvasViewport;
  created_at: string;
  updated_at: string;
}

// Validate Supabase access
async function validateSupabaseAccess(): Promise<{ success: boolean; error?: string }> {
  try {
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    if (sessionError || !session?.user) {
      return { success: false, error: `Authentication failed: ${sessionError?.message || 'No session'}` };
    }
    return { success: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return { success: false, error: `Validation failed: ${errorMessage}` };
  }
}

// Save canvas data to Supabase
export async function saveCanvasToSupabase(
  chatId: string,
  canvasData: CanvasData
): Promise<{ success: boolean; error?: string }> {
  if (!navigator.onLine) {
    logger.warn('No network connection available, skipping canvas save');
    return { success: false, error: 'No network connection' };
  }

  if (!chatId) {
    logger.warn('No chat ID provided for canvas save');
    return { success: false, error: 'No chat ID provided' };
  }

  try {
    logger.info('Saving canvas to Supabase:', { 
      chatId, 
      objectCount: canvasData.objects.length,
      viewport: canvasData.viewport
    });
    
    // Validate Supabase access
    const validation = await validateSupabaseAccess();
    if (!validation.success) {
      throw new Error(validation.error);
    }

    // Get current session
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) {
      throw new Error('No authenticated user found');
    }

    const userId = session.user.id;

    // Clean the objects data for storage (remove JSX elements from penStyle)
    const cleanObjects = canvasData.objects.map(obj => {
      const cleanObj = { ...obj };
      if (cleanObj.penStyle) {
        const { icon, ...penStyleWithoutIcon } = cleanObj.penStyle;
        cleanObj.penStyle = penStyleWithoutIcon as any;
      }
      return cleanObj;
    });

    // Upsert canvas data
    const { data, error } = await supabase
      .from('canvas_data')
      .upsert({
        user_id: userId,
        chat_id: chatId,
        objects: cleanObjects,
        viewport: canvasData.viewport,
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'user_id,chat_id'
      })
      .select()
      .single();

    if (error) {
      throw error;
    }

    logger.info('Successfully saved canvas to Supabase:', { chatId, recordId: data.id });
    return { success: true };
  } catch (error) {
    logger.error('Failed to save canvas to Supabase:', error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return { success: false, error: errorMessage };
  }
}

// Load canvas data from Supabase
export async function loadCanvasFromSupabase(
  chatId: string
): Promise<{ success: boolean; data?: CanvasData; error?: string }> {
  if (!navigator.onLine) {
    logger.warn('No network connection available, skipping canvas load');
    return { success: false, error: 'No network connection' };
  }

  if (!chatId) {
    logger.warn('No chat ID provided for canvas load');
    return { success: false, error: 'No chat ID provided' };
  }

  try {
    logger.info('Loading canvas from Supabase:', { chatId });
    
    // Validate Supabase access
    const validation = await validateSupabaseAccess();
    if (!validation.success) {
      throw new Error(validation.error);
    }

    // Get current session
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) {
      throw new Error('No authenticated user found');
    }

    const userId = session.user.id;

    // Load canvas data
    const { data, error } = await supabase
      .from('canvas_data')
      .select('*')
      .eq('user_id', userId)
      .eq('chat_id', chatId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        // No data found - this is not an error, just return empty canvas
        logger.info('No canvas data found for chat:', { chatId });
        return { 
          success: true, 
          data: { 
            objects: [], 
            viewport: { x: 0, y: 0, scale: 1 } 
          } 
        };
      }
      throw error;
    }

    const canvasData: CanvasData = {
      objects: data.objects || [],
      viewport: data.viewport || { x: 0, y: 0, scale: 1 }
    };

    logger.info('Successfully loaded canvas from Supabase:', { 
      chatId, 
      objectCount: canvasData.objects.length 
    });
    return { success: true, data: canvasData };
  } catch (error) {
    logger.error('Failed to load canvas from Supabase:', error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return { success: false, error: errorMessage };
  }
}

// Delete canvas data from Supabase
export async function deleteCanvasFromSupabase(
  chatId: string
): Promise<{ success: boolean; error?: string }> {
  if (!navigator.onLine) {
    logger.warn('No network connection available, skipping canvas delete');
    return { success: false, error: 'No network connection' };
  }

  if (!chatId) {
    logger.warn('No chat ID provided for canvas delete');
    return { success: false, error: 'No chat ID provided' };
  }

  try {
    logger.info('Deleting canvas from Supabase:', { chatId });
    
    // Validate Supabase access
    const validation = await validateSupabaseAccess();
    if (!validation.success) {
      throw new Error(validation.error);
    }

    // Get current session
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) {
      throw new Error('No authenticated user found');
    }

    const userId = session.user.id;

    // Delete canvas data
    const { error } = await supabase
      .from('canvas_data')
      .delete()
      .eq('user_id', userId)
      .eq('chat_id', chatId);

    if (error) {
      throw error;
    }

    logger.info('Successfully deleted canvas from Supabase:', { chatId });
    return { success: true };
  } catch (error) {
    logger.error('Failed to delete canvas from Supabase:', error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return { success: false, error: errorMessage };
  }
}

// Get all canvas data for a user (for debugging/admin purposes)
export async function getUserCanvasData(): Promise<{ success: boolean; data?: CanvasDbRecord[]; error?: string }> {
  try {
    // Validate Supabase access
    const validation = await validateSupabaseAccess();
    if (!validation.success) {
      throw new Error(validation.error);
    }

    // Get current session
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) {
      throw new Error('No authenticated user found');
    }

    const userId = session.user.id;

    // Load all canvas data for user
    const { data, error } = await supabase
      .from('canvas_data')
      .select('*')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false });

    if (error) {
      throw error;
    }

    logger.info('Successfully loaded all canvas data for user:', { 
      userId, 
      recordCount: data?.length || 0 
    });
    return { success: true, data: data || [] };
  } catch (error) {
    logger.error('Failed to load user canvas data:', error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return { success: false, error: errorMessage };
  }
} 