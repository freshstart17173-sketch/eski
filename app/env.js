// env.js — the public client config. Every value here is browser-safe BY DESIGN
// (see .env.example): the Supabase URL + publishable key identify the project and
// are gated by RLS, and the R2 public base is where readers fetch media. The
// SECRET keys (Supabase service role, R2 API key pair, SMTP) live only in Vercel
// env and are read server-side by api/sign.mjs — they never appear in this file.

export const SUPABASE_URL = "https://zidqagrmxeawpasurpwi.supabase.co";
export const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_cZuZnUhWmEGESYb7BR1Kzg_nPjR8CZR";

// Public read base for media. This is the rate-limited r2.dev dev domain; swap to
// https://cdn.eski.lol once the eski.lol zone is on Cloudflare. Because the DB
// stores object KEYS (never full URLs), that swap is this one line (.env.example).
export const R2_PUBLIC_BASE_URL = "https://pub-b9e7c6b680ca415e9ffd5875bad0df03.r2.dev";
