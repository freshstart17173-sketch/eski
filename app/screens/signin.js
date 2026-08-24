// screens/signin.js — a minimal magic-link sign-in (P4.10 needs a real session;
// the full auth screen with its polish is P9). Enter an email → we send a
// one-time link via Supabase OTP → clicking it returns to the app and
// detectSessionInUrl (supabase.js) completes the session. No passwords.
//
// Used two ways: as the /signin route, and as the signed-out prompt any in-shell
// route falls back to (main.js) when there's no session.

import { el, Field, Button, toast } from "../ui.js";
import { icon } from "../icons.js";
import { signInWithOtp } from "../supabase.js";

export function renderSignin() {
  const screen = el(".screen", { "data-screen": "auth" });
  const card = el(".authcard");
  card.innerHTML = `<div class="wm wordmark">eski!</div><p class="sub">Sign in with a magic link — no password.</p>`;

  const field = Field({ icon: "mail", type: "email", placeholder: "you@email.com" });
  const btn = Button({ label: "Send magic link", variant: "primary", icon: "send" });
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

  card.append(field, btn, note);
  screen.append(card);
  return screen;
}
