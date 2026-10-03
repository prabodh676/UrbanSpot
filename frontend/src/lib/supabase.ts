import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://zchqosjmykoacskhbaaz.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpjaHFvc2pteWtvYWNza2hiYWF6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTEwMTQ1NDQsImV4cCI6MjEwNjU5MDU0NH0.ed7OKEjEn6MyjspcVFjw1i621mKmW0iH4mGZuT9Jp-8';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
