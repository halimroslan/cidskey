import { createClient } from '@supabase/supabase-js';

let _supabase = null;

// Lazy init - hanya buat client bila dipanggil, bukan masa module load
export function getSupabase() {
    if (_supabase) return _supabase;
    
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://sennodrfmsijorfcnrud.supabase.co';
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNlbm5vZHJmbXNpam9yZmNucnVkIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NDE3MzY2NiwiZXhwIjoyMDk5NzQ5NjY2fQ.a2Ocfy4OQ-nPaEDeyzI9slDFzyT8OwFtz403G8uFcAY';

    if (!supabaseUrl || !supabaseServiceKey) {
        throw new Error('Missing Supabase credentials');
    }

    _supabase = createClient(supabaseUrl, supabaseServiceKey, {
        auth: {
            autoRefreshToken: false,
            persistSession: false
        }
    });
    
    return _supabase;
}

// Backward compat export
export const supabase = new Proxy({}, {
    get(_, prop) {
        return getSupabase()[prop];
    }
});
