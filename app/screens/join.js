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
// NOTE: a richer preview (server name · member count · inviter) needs an anon-readable
// preview RPC — a non-member can't read `servers` pre-join. Tracked in BUGLOG; until then
// the card is intentionally generic, which still beats a dead grey screen.

import { el, toast, Button } from "../ui.js";
import { iconEl } from "../icons.js";
import { navigate } from "../router.js";
import { session } from "../supabase.js";
import { isDemo, joinServer } from "../data.js";

function withDemo(path) { return isDemo() ? path + "?demo=1" : path; }

// One centered card on a full scrim — the same visual language as the create/join modals,
// rendered as a screen so a route can own it.
function card(kids) {
  const screen = el("section.screen", { "data-screen": "join" });
  screen.append(el(".scrim", { style: "position:fixed;inset:0;display:grid;place-items:center;padding:24px" }, [
    el(".modal.joincard", { role: "dialog", "aria-label": "Invite", style: "max-width:400px;width:100%;text-align:center;padding:28px 26px" }, kids),
  ]));
  return screen;
}

export function renderJoin(code) {
  // Signed out: send them to sign in, keeping the invite so the link resolves on return.
  if (!session() && !isDemo()) {
    try { sessionStorage.setItem("eski:pending-invite", code || ""); } catch {}
    return card([
      el(".joinmark", { style: "display:grid;place-items:center;margin-bottom:12px;color:var(--soft)" }, [iconEl("mail")]),
      el("h1", { style: "font-size:var(--fs-xl);font-weight:600" }, ["You've been invited"]),
      el("p", { style: "color:var(--muted);font-size:var(--fs-sm);margin:8px auto 0;max-width:300px" }, ["Sign in to accept this invite and join the server."]),
      el("div", { style: "margin-top:18px;display:flex;gap:8px;justify-content:center" }, [
        Button({ label: "Sign in to join", variant: "primary", onClick: () => navigate("/signin") }),
      ]),
    ]);
  }

  const join = Button({ label: "Join server", variant: "primary" });
  const note = el("p", { style: "color:var(--muted);font-size:var(--fs-sm);margin:8px auto 0;max-width:300px" }, ["You've been invited to a server on eski. Join to see its channels and files."]);
  const screen = card([
    el(".joinmark", { style: "display:grid;place-items:center;margin-bottom:12px;color:var(--soft)" }, [iconEl("server")]),
    el("h1", { style: "font-size:var(--fs-xl);font-weight:600" }, ["Join this server"]),
    note,
    el("div", { style: "margin-top:18px;display:flex;gap:8px;justify-content:center" }, [
      Button({ label: "Not now", variant: "ghost", onClick: () => navigate(withDemo("/")) }),
      join,
    ]),
  ]);

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
      card2.replaceChildren(
        el(".joinmark", { style: "display:grid;place-items:center;margin-bottom:12px;color:var(--danger)" }, [iconEl("clock")]),
        el("h1", { style: "font-size:var(--fs-xl);font-weight:600" }, ["This invite doesn't work"]),
        el("p", { style: "color:var(--muted);font-size:var(--fs-sm);margin:8px auto 0;max-width:300px" }, [e?.message || "That invite link isn't valid anymore. Ask for a fresh one."]),
        el("div", { style: "margin-top:18px;display:flex;justify-content:center" }, [
          Button({ label: "Go to your feed", variant: "primary", icon: "home", onClick: () => navigate(withDemo("/")) }),
        ]),
      );
    }
  });

  return screen;
}
