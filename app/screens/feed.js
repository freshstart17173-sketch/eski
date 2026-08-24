// screens/feed.js — the home Feed (P5.1, CANON §C.5): the friends-only portfolio
// grid. Friends' PUBLIC posts, the SAME card renderer as the explorer but with NO
// member colour (public context — the hue is server-scoped and renders nowhere
// public). A wordmark + Feed/Notifications/You nav, a search + Type/Sort/layout
// toolbar, an even-square grid ⇄ masonry toggle (default even), and the "quiet
// feed" empty state. Cards open the Details pane as a public post (comment thread).

import { el, toast, openMenu } from "../ui.js";
import { iconEl } from "../icons.js";
import { navigate } from "../router.js";
import { workCard } from "../cards.js";
import { openDetails } from "./details.js";
import { isDemo } from "../data.js";

function withDemo(path) { return isDemo() ? path + (path.includes("?") ? "&" : "?") + "demo=1" : path; }

export function renderFeed(data) {
  const screen = el("section.screen", { "data-screen": "feed" });
  const pane = el(".pane");
  screen.append(pane);

  const state = { even: true, query: "" };

  // header: wordmark + top-level nav (Feed active)
  const nav = el("nav", {}, [
    el("a.nav.on", {}, ["Feed"]),
    el("a.nav", { href: withDemo("/notifications"), onClick: () => toast({ message: "Notifications (P7)" }) }, ["Notifications"]),
    el("a.nav", { href: withDemo(`/u/${data.me.handle}`), onClick: () => toast({ message: "Profile (P5.10)" }) }, ["You"]),
  ]);
  const panehd = el(".panehd", {}, [el(".wm", {}, ["eski"]), nav]);

  // toolbar: search · Type · Sort · layout toggle
  const layoutBtn = el("button.iconbtn", { title: "Grid / masonry", onClick: () => { state.even = !state.even; repaint(); } }, [iconEl("grid", "sm")]);
  const search = el(".field", {}, [iconEl("search", "sm"),
    el("input", { placeholder: "Search your friends", value: state.query, onInput: (e) => { state.query = e.target.value; repaint(); } }),
  ]);
  const toolbar = el(".toolbar", {}, [
    search,
    el("button.btn", { "aria-haspopup": "menu", onClick: (e) => openMenu(e.currentTarget, ["All", "Images", "Audio", "Video"].map((t) => ({ label: t, onClick: () => toast({ message: `Filter: ${t} (P5.9)` }) }))) }, ["Type", iconEl("chev", "sm")]),
    el("button.btn", { "aria-haspopup": "menu", onClick: (e) => openMenu(e.currentTarget, ["Latest", "Oldest"].map((t) => ({ label: t, onClick: () => toast({ message: `Sort: ${t} (P5.9)` }) }))) }, ["Latest", iconEl("chev", "sm")]),
    layoutBtn,
  ]);

  const body = el(".panebody");
  pane.replaceChildren(panehd, toolbar, body);
  repaint();
  return screen;

  function repaint() {
    const q = state.query.trim().toLowerCase();
    const posts = q
      ? (data.posts || []).filter((p) => (p.title || "").toLowerCase().includes(q) || (p.who?.name || "").toLowerCase().includes(q))
      : (data.posts || []);

    if (!posts.length) {
      body.replaceChildren(q ? emptyState("search", "No results", `Nothing in your feed matches “${state.query.trim()}”.`) : feedEmpty());
      return;
    }
    // open a post in the Details pane — public post (comment thread), siblings = feed
    const openPost = (w) => openDetails(w, { serverName: null, personal: false, isPost: true, comments: [], siblings: posts });
    const grid = el(".masonry" + (state.even ? ".even" : ""));
    for (const p of posts) grid.append(workCard(p, { onOpen: openPost, hue: false }));
    body.replaceChildren(grid);
  }
}

function feedEmpty() {
  const eic = iconEl("home"); eic.classList.add("eic");
  return el(".emptystate", {}, [
    eic, el("h3", {}, ["Your feed is quiet"]),
    el("p", {}, ["Public work from your friends lands here. Add a few people and their posts show up in this feed."]),
    el("button.btn.primary", { onClick: () => toast({ message: "Find friends (P7)" }) }, [iconEl("plus", "sm"), "Find friends"]),
  ]);
}

function emptyState(icon, title, sub) {
  const eic = iconEl(icon); eic.classList.add("eic");
  return el(".emptystate", {}, [eic, el("h3", {}, [title]), el("p", {}, [sub])]);
}
