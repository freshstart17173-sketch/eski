// screens/search.js — the global Search screen (/search, CANON §C.18). A full-screen search
// that jumps across your servers, their channels, and your people. Type to filter; results
// group by kind; Enter opens the top result. (The ⌘K quick-switcher is the fast overlay of the
// same idea; this is the full page. Full-text file/message search is a follow-up — it needs a
// search RPC over search_tsv.)

import { el, Avatar } from "../ui.js";
import { iconEl } from "../icons.js";
import { navigate } from "../router.js";
import { isDemo } from "../data.js";
import { avatarUrl } from "../cards.js";

function withDemo(path) { return isDemo() ? path + (path.includes("?") ? "&" : "?") + "demo=1" : path; }

export function renderSearch(data) {
  const screen = el("section.screen.search", { "data-screen": "search" });
  const pane = el(".pane");
  screen.append(pane);

  const state = { q: "" };
  const input = el("input", { placeholder: "Search servers, channels, people…", "aria-label": "Search", value: "", onInput: (e) => { state.q = e.target.value; paint(); } });
  const field = el(".field.searchbig.searchbar", {}, [iconEl("search", "sm"), input]);
  const panehd = el(".panehd", {}, [el(".title", {}, ["Search"])]);
  const body = el(".panebody");
  pane.replaceChildren(panehd, el(".toolbar", {}, [field]), body);

  // one flat, ranked candidate list; grouped for render
  function candidates() {
    const q = state.q.trim().toLowerCase();
    const match = (s) => !q || String(s || "").toLowerCase().includes(q);
    return {
      servers: (data.servers || []).filter((s) => match(s.name)),
      channels: (data.channels || []).filter((c) => match(c.name) || match(c.serverName)),
      people: (data.friends || []).filter((p) => match(p.name) || match(p.handle)),
    };
  }
  let rows = [];   // flat list of {href, node} for keyboard nav
  function paint() {
    const c = candidates();
    body.replaceChildren();
    rows = [];
    const total = c.servers.length + c.channels.length + c.people.length;
    if (!total) { body.append(el(".emptystate", {}, [iconEl("search"), el("h3", {}, [state.q.trim() ? "No results" : "Search eski"]), state.q.trim() ? el("p", {}, [`Nothing matches “${state.q.trim()}”.`]) : el("p", {}, ["Jump to a server, channel, or person."])])); return; }
    group("Servers", c.servers.map((s) => row(withDemo(`/s/${s.id}`), el("span.qsav.sq", {}, [s.initials]), s.name, "Server")));
    group("Channels", c.channels.map((ch) => row(withDemo(`/s/${ch.serverId}/c/${ch.id}`), el("span.qsav.sq", {}, [iconEl("hash", "sm")]), "#" + ch.name, ch.serverName)));
    group("People", c.people.map((p) => row(withDemo(`/u/${p.handle}`), Avatar({ name: p.initials, size: "sm", src: avatarUrl(p.avatar_key) }), p.name, "@" + p.handle)));
    markActive(0);
  }
  function group(label, nodes) {
    if (!nodes.length) return;
    body.append(el(".srchgrp", {}, [el(".seclabel", {}, [label]), ...nodes]));
  }
  function row(href, avatar, title, sub) {
    const r = el("button.srchrow", { onClick: () => navigate(href) }, [avatar, el(".info", {}, [el("b", {}, [title]), el("span.sub", {}, [sub])])]);
    rows.push({ href, node: r });
    return r;
  }
  let active = 0;
  function markActive(i) { active = Math.max(0, Math.min(rows.length - 1, i)); rows.forEach((r, k) => r.node.classList.toggle("on", k === active)); }
  input.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown") { e.preventDefault(); markActive(active + 1); rows[active]?.node.scrollIntoView({ block: "nearest" }); }
    else if (e.key === "ArrowUp") { e.preventDefault(); markActive(active - 1); rows[active]?.node.scrollIntoView({ block: "nearest" }); }
    else if (e.key === "Enter" && rows[active]) { e.preventDefault(); navigate(rows[active].href); }
  });

  paint();
  setTimeout(() => input.focus(), 0);
  return screen;
}
