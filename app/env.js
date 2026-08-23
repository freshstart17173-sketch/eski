// env.js — the public client config. Every value here is browser-safe BY DESIGN
// (see .env.example): the Supabase URL + publishable key identify the project and
// are gated by RLS, and the R2 public base is where readers fetch media. The
// SECRET keys (Supabase service role, R2 API key pair, SMTP) live only in Vercel
// env and are read server-side by api/sign.mjs — they never appear in this file.

export const SUPABASE_URL = "https://zidqagrmxeawpasurpwi.supabase.co";
export const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_cZuZnUhWmEGESYb7BR1Kzg_nPjR8CZR";

// Public read base for media — the eski.lol zone is on Cloudflare and cdn.eski.lol
// is bound to the R2 bucket (Proxied), so this is the custom domain, not the
// rate-limited r2.dev dev host. The DB stores object KEYS (never full URLs), so a
// media URL is `${R2_PUBLIC_BASE_URL}/${key}` — no trailing slash here. Keep this in
// sync with the R2_PUBLIC_BASE_URL server env var in Vercel.
export const R2_PUBLIC_BASE_URL = "https://cdn.eski.lol";
