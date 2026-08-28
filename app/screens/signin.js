// screens/signin.js — sign-in. Two paths: Continue with Google (OAuth, the
// preferred path — no email round-trip, so it dodges the magic-link mailer's rate
// limit) and, below an "or", a magic-link email fallback. Google is enabled in the
// Supabase project; clicking it redirects to Google and detectSessionInUrl
// (supabase.js) completes the session on return. No passwords.
//
// Used two ways: as the /signin route, and as the signed-out prompt any in-shell
// route falls back to (main.js) when there's no session.

import { el, Field, Button, toast } from "../ui.js";
import { icon } from "../icons.js";
import { signInWithOtp, signInWithGoogle } from "../supabase.js";

// The Google "G" — inline as its own 4-colour brand SVG, NOT through the mono
// icon sprite. A third-party logo is the recognised exception to the tokens-only
// rule (like the one #fff in .btn.danger); it must keep its brand colours to be
// legible as Google, and it lives only on this auth screen.
function googleG() {
  const tpl = document.createElement("template");
  tpl.innerHTML =
    '<svg class="gmark" width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">' +
    '<path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62z"/>' +
    '<path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18z"/>' +
    '<path fill="#FBBC05" d="M3.97 10.72a5.4 5.4 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.33z"/>' +
    '<path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.47.9 11.43 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58z"/>' +
    "</svg>";
  return tpl.content.firstElementChild;
}

export function renderSignin() {
  const screen = el(".screen", { "data-screen": "auth" });
  const card = el(".authcard");
  card.innerHTML = `<div class="wm wordmark">eski!</div><p class="sub">Sign in to keep building.</p>`;

  // ── Google (preferred) ──────────────────────────────────────────────────
  const google = el("button.btn.outline.oauthbtn", { type: "button" }, [googleG(), "Continue with Google"]);
  google.addEventListener("click", async () => {
    google.disabled = true;
    const { error } = await signInWithGoogle();
    // On success the page navigates to Google, so we only get here on error.
    if (error) { google.disabled = false; toast({ message: error.message || "Couldn’t start Google sign-in" }); }
  });

  const divider = el(".ordiv", {}, [el("span", {}, ["or"])]);

  // ── magic-link fallback ─────────────────────────────────────────────────
  const field = Field({ icon: "mail", type: "email", placeholder: "you@email.com" });
  const btn = Button({ label: "Email me a magic link", variant: "outline", icon: "send" });
  const note = el("p.authnote", { hidden: true });

  async function submit() {
    const email = field.input.value.trim();
    if (!email || !/.+@.+\..+/.test(email)) { field.classList.add("err"); return; }
    field.classList.remove("err");
    btn.disabled = true;
    const { error } = await signInWithOtp(email);
    btn.disabled = false;
    note.hidden = false;
    if (error) { note.textContent = error.message || "Couldn't send the link — try again."; note.classList.add("err"); }
    else { note.classList.remove("err"); note.textContent = `Check ${email} for the sign-in link.`; toast({ message: "Magic link sent" }); }
  }
  btn.addEventListener("click", submit);
  field.input.addEventListener("keydown", (e) => { if (e.key === "Enter") submit(); });

  card.append(google, divider, field, btn, note);
  screen.append(card);
  return screen;
}
