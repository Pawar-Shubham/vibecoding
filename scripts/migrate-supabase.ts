import { supabase } from '~/lib/supabase';
import fs from 'fs';
import path from 'path';

async function runMigration() {
  try {
    console.log('Running Supabase migration...');
    
    const migrationPath = path.join(__dirname, '../supabase/migrations/20240321000000_create_chat_history.sql');
    const sql = fs.readFileSync(migrationPath, 'utf8');

    const { error } = await supabase.rpc('run_sql_migration', { sql });

    if (error) {
      throw error;
    }

    console.log('Migration completed successfully!');
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
}

runMigration(); 