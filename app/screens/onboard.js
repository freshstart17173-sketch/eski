// screens/onboard.js — create-profile onboarding. A fresh account (Google or magic
// link) has no `profiles` row, so it has no handle and can't be linked to; this one-time
// step captures a username (+ optional display name) and writes the profile. main.js gates
// every in-app route behind needsProfileSetup() until this is done.
//
// Reuses the auth full-screen card so onboarding reads like the rest of the entry flow.

import { el, Field, Button, toast } from "../ui.js";
import { session } from "../supabase.js";
import { createProfile } from "../data.js";

// `onDone` re-renders the current route once the profile exists (needsProfileSetup() now
// false), so the app continues in place — no reload, no lost toast.
export function renderCreateProfile(onDone) {
  const screen = el(".screen", { "data-screen": "auth" });
  const card = el(".authcard");
  card.innerHTML = `<div class="wm wordmark">eski!</div><p class="sub">Pick a username to finish setting up your profile.</p>`;

  // Suggest the email stem, cleaned to the handle charset — just a starting point.
  const suggested = (session()?.email?.split("@")[0] || "").replace(/[^a-z0-9_]/gi, "").toLowerCase();
  const nameField = Field({ icon: "user", placeholder: "Display name (optional)" });
  const handleField = Field({ at: true, placeholder: "username", value: suggested });
  const btn = Button({ label: "Create profile", variant: "primary" });
  const note = el("p.authnote", { hidden: true });

  async function submit() {
    const handle = handleField.input.value.trim();
    if (!handle) { handleField.classList.add("err"); handleField.input.focus(); return; }
    handleField.classList.remove("err");
    btn.disabled = true; note.hidden = true;
    try {
      await createProfile({ handle, name: nameField.input.value });
      toast({ message: "Welcome to eski", icon: "check" });
      onDone && onDone();
    } catch (e) {
      note.hidden = false; note.classList.add("err");
      note.textContent = e?.message || "Couldn’t create your profile";
      btn.disabled = false;
      if (/taken/i.test(e?.message || "")) handleField.classList.add("err");
    }
  }
  btn.addEventListener("click", submit);
  handleField.input.addEventListener("keydown", (e) => { if (e.key === "Enter") submit(); });

  card.append(nameField, handleField, btn, note);
  screen.append(card);
  // focus the username so a keyboard user can type straight away
  setTimeout(() => handleField.input.focus(), 0);
  return screen;
}
