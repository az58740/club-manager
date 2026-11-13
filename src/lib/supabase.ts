/**
 * Supabase is only the doorbell: its Realtime socket tells a phone that a row
 * changed. Accounts, reads and writes all belong to the club API, so no browser
 * client is created here and no anon key ever authorises a write.
 */
export const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);
