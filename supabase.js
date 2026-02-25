const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    console.error('\n Supabase credentials not set! Add to .env:\n   SUPABASE_URL=your_url\n   SUPABASE_SERVICE_ROLE_KEY=your_key\n');
}

// Use the service role key for server-side operations (bypasses RLS)
const supabase = createClient(SUPABASE_URL || '', SUPABASE_SERVICE_KEY || '', {
    auth: {
        autoRefreshToken: false,
        persistSession: false
    }
});

module.exports = supabase;
