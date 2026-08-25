// screens/notfound.js — the 404 (CANON §C, gallery #e404). A standalone centered card (no
// shell): an unknown route lands here with a way back to the Feed.

import { el } from "../ui.js";
import { iconEl } from "../icons.js";
import { navigate } from "../router.js";

function withDemo(path) { return new URLSearchParams(location.search).get("demo") === "1" ? path + "?demo=1" : path; }

export function renderNotFound() {
  const screen = el("section.screen", { "data-screen": "notfound" });
  screen.append(el(".e404", { style: "position:fixed;inset:0;display:grid;place-items:center;background:var(--paper);text-align:center;padding:24px" }, [
    el("div", {}, [
      el("div", { style: "font-size:46px;font-weight:700;letter-spacing:.02em;color:var(--soft)" }, ["404"]),
      el("h1", { style: "margin-top:4px;font-size:var(--fs-xl);font-weight:600" }, ["Page not found"]),
      el("p", { style: "color:var(--muted);font-size:var(--fs-sm);margin-top:8px;max-width:360px;margin-left:auto;margin-right:auto" }, ["That link doesn't lead anywhere. It may have moved, or never existed."]),
      el("button.btn.primary", { style: "margin-top:16px", onClick: () => navigate(withDemo("/")) }, [iconEl("home", "sm"), "Go to your feed"]),
    ]),
  ]));
  return screen;
}
