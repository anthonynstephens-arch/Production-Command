import { createClient } from "@supabase/supabase-js";

export function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://izjwlyssxvhipmfwystr.supabase.co";
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!secret) throw new Error("SUPABASE_SECRET_KEY is not available to this deployment.");
  return createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
}
