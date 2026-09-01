// screens/join.js — the invite landing (CANON §F, gallery #join / #deadinvite). A route,
// not a modal: invite links (`/join/:code`) and invite notifications navigate here, so it
// must be a real screen — never the "not yet ported" placeholder (owner bug 2026-08-28).
//
// A standalone centered card on a scrim (works signed-in or signed-out, no rail):
//   - signed out → "Sign in to accept" (join_via_invite needs auth); the code is kept so
//     the link still works after returning.
//   - signed in  → "You've been invited" + Join → join_via_invite → land in the server.
//   - a bad/expired/revoked/full code → the dead-invite state with the reason + a way back.
//
// The card is enriched by `preview_invite` (K1) — an anon-readable RPC that returns the server
// name/icon, active member count, and inviter for a valid code (a non-member can't read `servers`
// pre-join). The fetch is async and non-blocking: the card renders generic copy first, then fills
// in; a revoked/expired/invalid code resolves to null → the dead-invite state shown proactively.

import { el, toast, Button, Avatar } from "../ui.js";
import { iconEl } from "../icons.js";
import { navigate } from "../router.js";
import { session } from "../supabase.js";
import { isDemo, joinServer, loadInvitePreview } from "../data.js";
import { avatarUrl } from "../cards.js";

function withDemo(path) { return isDemo() ? path + "?demo=1" : path; }

// square server badge (icon or initials) for the invite card — a server is always square (--r).
function serverBadge(preview) {
  const url = avatarUrl(preview.iconKey);
  const box = el(".srvicon", { style: "width:52px;height:52px;margin:0 auto 12px;border-radius:var(--r);display:grid;place-items:center;background:var(--paper1);font-weight:600;overflow:hidden" });
  if (url) { const im = el("img", { src: url, alt: "", style: "width:100%;height:100%;object-fit:cover" }); im.addEventListener("error", () => { box.replaceChildren(); box.textContent = (preview.name || "?").slice(0, 2).toUpperCase(); }, { once: true }); box.append(im); }
  else box.textContent = (preview.name || "?").slice(0, 2).toUpperCase();
  return box;
}
function memberLine(preview) {
  const n = preview.memberCount || 0;
  const who = preview.inviter ? `${preview.inviter} invited you` : "You've been invited";
  return `${who} · ${n} member${n === 1 ? "" : "s"}`;
}

// One centered card on a full scrim — the same visual language as the create/join modals,
// rendered as a screen so a route can own it.
function card(kids) {
  const screen = el("section.screen", { "data-screen": "join" });
  screen.append(el(".scrim", { style: "position:fixed;inset:0;display:grid;place-items:center;padding:24px" }, [
    el(".modal.joincard", { role: "dialog", "aria-label": "Invite", style: "max-width:400px;width:100%;text-align:center;padding:28px 26px" }, kids),
  ]));
  return screen;
}

// swap a card's contents to the dead-invite state (revoked / expired / full / invalid).
function deadInvite(card2, message) {
  card2.replaceChildren(
    el(".joinmark", { style: "display:grid;place-items:center;margin-bottom:12px;color:var(--danger)" }, [iconEl("clock")]),
    el("h1", { style: "font-size:var(--fs-xl);font-weight:600" }, ["This invite doesn't work"]),
    el("p", { style: "color:var(--muted);font-size:var(--fs-sm);margin:8px auto 0;max-width:300px" }, [message || "That invite link isn't valid anymore. Ask for a fresh one."]),
    el("div", { style: "margin-top:18px;display:flex;justify-content:center" }, [
      Button({ label: "Go to your files", variant: "primary", icon: "home", onClick: () => navigate(withDemo("/")) }),
    ]),
  );
}

export function renderJoin(code) {
  // Signed out: send them to sign in, keeping the invite so the link resolves on return.
  if (!session() && !isDemo()) {
    try { sessionStorage.setItem("eski:pending-invite", code || ""); } catch {}
    const soMark = el(".joinmark", { style: "display:grid;place-items:center;margin-bottom:12px;color:var(--soft)" }, [iconEl("mail")]);
    const soTitle = el("h1", { style: "font-size:var(--fs-xl);font-weight:600" }, ["You've been invited"]);
    const soNote = el("p", { style: "color:var(--muted);font-size:var(--fs-sm);margin:8px auto 0;max-width:300px" }, ["Sign in to accept this invite and join the server."]);
    const soScreen = card([soMark, soTitle, soNote,
      el("div", { style: "margin-top:18px;display:flex;gap:8px;justify-content:center" }, [
        Button({ label: "Sign in to join", variant: "primary", onClick: () => navigate("/signin") }),
      ]),
    ]);
    // enrich with the real server once the anon preview resolves (a dead code shows the reason).
    loadInvitePreview(code).then((p) => {
      const c2 = soScreen.querySelector(".joincard");
      if (!c2) return;
      if (!p) return deadInvite(c2);
      soMark.replaceWith(serverBadge(p));
      soTitle.textContent = `Join ${p.name}`;
      soNote.textContent = `${memberLine(p)}. Sign in to accept.`;
    }).catch(() => {});
    return soScreen;
  }

  const join = Button({ label: "Join server", variant: "primary" });
  const mark = el(".joinmark", { style: "display:grid;place-items:center;margin-bottom:12px;color:var(--soft)" }, [iconEl("server")]);
  const title = el("h1", { style: "font-size:var(--fs-xl);font-weight:600" }, ["Join this server"]);
  const note = el("p", { style: "color:var(--muted);font-size:var(--fs-sm);margin:8px auto 0;max-width:300px" }, ["You've been invited to a server on eski. Join to see its channels and files."]);
  const screen = card([
    mark, title, note,
    el("div", { style: "margin-top:18px;display:flex;gap:8px;justify-content:center" }, [
      Button({ label: "Not now", variant: "ghost", onClick: () => navigate(withDemo("/")) }),
      join,
    ]),
  ]);

  // Enrich the card with the real server (name · member count · inviter · icon). A dead code
  // resolves to null → show the dead-invite state now, before they click a doomed Join.
  loadInvitePreview(code).then((p) => {
    const c2 = screen.querySelector(".joincard");
    if (!c2 || !c2.contains(title)) return;   // card already replaced (e.g. join clicked)
    if (!p) return deadInvite(c2, "That invite link isn't valid anymore. Ask for a fresh one.");
    mark.replaceWith(serverBadge(p));
    title.textContent = `Join ${p.name}`;
    note.textContent = memberLine(p);
  }).catch(() => {});

  join.addEventListener("click", async () => {
    if (join.disabled) return;
    join.disabled = true;
    try {
      const srv = await joinServer(code);
      if (isDemo()) { toast({ message: "Joined (demo)", icon: "check" }); navigate(withDemo("/")); return; }
      toast({ message: `Joined ${srv?.name || "the server"}`, icon: "check" });
      navigate(srv?.id ? `/s/${srv.id}` : "/");
    } catch (e) {
      // Dead invite (expired / revoked / full / already used) → show the reason in place with
      // a way back, instead of leaving a disabled button and a silent failure.
      const card2 = screen.querySelector(".joincard");
      if (card2) deadInvite(card2, e?.message);
    }
  });

  return screen;
}
