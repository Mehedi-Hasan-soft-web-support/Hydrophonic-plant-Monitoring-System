const { SUPABASE_URL, SUPABASE_ANON_KEY } = window.APP_CONFIG || {};

if (!SUPABASE_URL || !SUPABASE_ANON_KEY || SUPABASE_URL.includes("YOUR_PROJECT_REF")) {
  console.warn("Please copy js/config.example.js to js/config.js and add your Supabase URL and anon key.");
}

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
