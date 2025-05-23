import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Supabase credentials
const supabaseUrl = 'https://hwxqmtguaaarjneyfyad.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh3eHFtdGd1YWFhcmpuZXlmeWFkIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0NzkwMTA0MywiZXhwIjoyMDYzNDc3MDQzfQ.N-CpkbBM-3GTjHDPVl1Tg-ei7Kf9-3RLzDZQdPw4FEo';

const supabase = createClient(supabaseUrl, supabaseKey);

async function runMigration() {
  try {
    console.log('Running Supabase migration...');
    
    const migrationPath = path.join(__dirname, '../supabase/migrations/20240321000000_create_chat_history.sql');
    const sql = fs.readFileSync(migrationPath, 'utf8');

    // Split the SQL into individual statements
    const statements = sql.split(';').filter(stmt => stmt.trim());

    // Execute each statement
    for (const statement of statements) {
      if (!statement.trim()) continue;
      
      console.log('Executing:', statement.trim().split('\n')[0] + '...');
      
      const { error } = await supabase.from('_migrations').select('*').limit(0);
      if (error?.message?.includes('relation "_migrations" does not exist')) {
        // Create migrations table if it doesn't exist
        await supabase.from('_migrations').insert([]);
      }

      const { error: queryError } = await supabase.rpc('pg_raw_query', { query: statement.trim() });
      
      if (queryError) {
        // If the error is about the function not existing, we'll create it first
        if (queryError.message.includes('function pg_raw_query')) {
          console.log('Creating pg_raw_query function...');
          const createFuncSQL = `
            CREATE OR REPLACE FUNCTION pg_raw_query(query text)
            RETURNS void
            LANGUAGE plpgsql
            SECURITY DEFINER
            AS $$
            BEGIN
              EXECUTE query;
            END;
            $$;
          `;
          
          const { error: funcError } = await supabase.rpc('pg_raw_query', { query: createFuncSQL });
          if (funcError) {
            throw funcError;
          }
          
          // Retry the original query
          const { error: retryError } = await supabase.rpc('pg_raw_query', { query: statement.trim() });
          if (retryError) {
            throw retryError;
          }
        } else {
          throw queryError;
        }
      }
    }

    console.log('Migration completed successfully!');
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
}

runMigration(); 