// supabase.js — the singleton Supabase client and the session module (P0.2).
// Everything that reads the current user waits on `ready` first, so nothing ever
// reads the session before Auth has hydrated from storage.

import { createClient } from "../vendor/supabase.js";
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from "./env.js";

// The runtime client is the vendored build (../vendor/supabase.js, not the npm package — see
// OPTIMIZATION.md §1.4 on why). @supabase/supabase-js is a devDependency ONLY for its TYPES
// (tsconfig.json's `tsc --checkJs` pass) — this JSDoc cast gives every `.from("table")` call
// real column-name/shape checking against db-types.ts (generated from the live schema) without
// shipping an extra byte to the browser or touching the buildless runtime.
/** @type {import("@supabase/supabase-js").SupabaseClient<import("./db-types").Database>} */
export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,   // completes the magic-link / OAuth redirect
  },
});

// Expose the public (anon) client on localhost ONLY — the e2e harness
// (docs/design/verify-live.mjs) signs in the demo users through it. Never exposed
// on preview/prod; and it's the publishable key anyway, gated entirely by RLS.
if (location.hostname === "localhost" || location.hostname === "127.0.0.1") {
  window.__sb = supabase;
}

let _session = null;
const listeners = new Set();

// `ready` resolves once the first getSession() settles. Pages await this before
// calling session(); resolving (not rejecting) on error keeps boot resilient —
// a failed hydrate just means "signed out", which callers already handle.
export const ready = supabase.auth.getSession()
  .then(({ data }) => { _session = data.session ?? null; })
  .catch(() => { _session = null; });

// Keep _session live and fan out to subscribers on every auth transition
// (sign-in, sign-out, token refresh, magic-link return). The event name is passed
// through so callers can tell a real SIGNED_OUT from a transient null.
supabase.auth.onAuthStateChange((event, session) => {
  _session = session ?? null;
  for (const cb of [...listeners]) cb(_session, event);
});

/** Current auth user, or null. Only meaningful after `await ready`. */
export function session() { return _session?.user ?? null; }

/** Raw session (tokens etc.), or null. */
export function rawSession() { return _session; }

/** Send a magic-link to `email`. Returns the supabase-js result. */
export function signInWithOtp(email) {
  return supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: window.location.origin },
  });
}

/**
 * Start the Google OAuth flow (the provider is enabled in the Supabase project).
 * Redirects the whole page to Google; on return, detectSessionInUrl (above)
 * completes the session. Preferred over the magic link — no email round-trip, so
 * it dodges the built-in mailer's rate limit. Returns the supabase-js result
 * (only meaningful on error, since success navigates away).
 */
export function signInWithGoogle() {
  return supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: window.location.origin },
  });
}

/** Sign out and clear local session. */
export function signOut() { return supabase.auth.signOut(); }

/** Subscribe to session changes; returns an unsubscribe fn. */
export function onChange(cb) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}
