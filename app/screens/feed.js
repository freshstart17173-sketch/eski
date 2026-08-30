// screens/feed.js — the home Feed (P5.1, CANON §C.5): the friends-only portfolio
// grid. Friends' PUBLIC posts, the SAME card renderer as the explorer but with NO
// member colour (public context — the hue is server-scoped and renders nowhere
// public). A wordmark + Feed/Notifications/You nav, a search + Type/Sort/layout
// toolbar, an even-square grid ⇄ masonry toggle (default even), and the "quiet
// feed" empty state. Cards open the Details pane as a public post (no comment thread —
// commenting was cut from the beta, P4 2026-08-30; the post view itself stays).

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

  const state = { even: true, query: "", type: "all", sort: "latest" };

  // header: wordmark + top-level nav (Feed active). The nav links navigate (the screens exist).
  const nav = el("nav", {}, [
    el("a.nav.on", {}, ["Feed"]),
    el("a.nav", { onClick: () => navigate(withDemo("/notifications")) }, ["Notifications"]),
    el("a.nav", { onClick: () => navigate(withDemo(`/u/${data.me.handle}`)) }, ["You"]),
  ]);
  const panehd = el(".panehd", {}, [el(".wm", {}, ["eski!"]), nav]);

  // toolbar: search · Type · Sort · layout toggle. Type/Sort are real client filters over the
  // loaded posts (a dropdown = .btn + chevron, selection shown by inversion).
  const TYPES = [["all", "All"], ["image", "Images"], ["audio", "Audio"], ["video", "Video"]];
  const SORTS = [["latest", "Latest"], ["oldest", "Oldest"]];
  const layoutBtn = el("button.iconbtn", { title: "Grid / masonry", onClick: () => { state.even = !state.even; repaint(); } }, [iconEl("grid", "sm")]);
  const search = el(".field", {}, [iconEl("search", "sm"),
    el("input", { placeholder: "Search your friends", value: state.query, onInput: (e) => { state.query = e.target.value; repaint(); } }),
  ]);
  const typeBtn = el("button.btn" + (state.type !== "all" ? ".on" : ""), { "aria-haspopup": "menu" }, [el("span.tlbl", {}, ["Type"]), iconEl("chev", "sm")]);
  typeBtn.addEventListener("click", () => openMenu(typeBtn, TYPES.map(([k, l]) => ({ label: l, selected: state.type === k, onClick: () => { state.type = k; typeBtn.querySelector(".tlbl").textContent = k === "all" ? "Type" : l; typeBtn.classList.toggle("on", k !== "all"); repaint(); } }))));
  const sortBtn = el("button.btn", { "aria-haspopup": "menu" }, [el("span.slbl", {}, ["Latest"]), iconEl("chev", "sm")]);
  sortBtn.addEventListener("click", () => openMenu(sortBtn, SORTS.map(([k, l]) => ({ label: l, selected: state.sort === k, onClick: () => { state.sort = k; sortBtn.querySelector(".slbl").textContent = l; repaint(); } }))));
  const toolbar = el(".toolbar", {}, [search, typeBtn, sortBtn, layoutBtn]);

  const body = el(".panebody");
  pane.replaceChildren(panehd, toolbar, body);
  repaint();
  return screen;

  function repaint() {
    const q = state.query.trim().toLowerCase();
    let posts = (data.posts || []);
    if (q) posts = posts.filter((p) => (p.title || "").toLowerCase().includes(q) || (p.who?.name || "").toLowerCase().includes(q));
    if (state.type !== "all") posts = posts.filter((p) => p.kind === state.type);
    posts = posts.slice().sort((a, b) => {
      const d = new Date(a.created_at || 0) - new Date(b.created_at || 0);
      return state.sort === "oldest" ? d : -d;
    });

    if (!posts.length) {
      body.replaceChildren(q ? emptyState("search", "No results", `Nothing in your feed matches “${state.query.trim()}”.`) : feedEmpty());
      return;
    }
    // open a post in the Details pane — public post (no comment thread; P4), siblings = feed
    const openPost = (w) => openDetails(w, { serverName: null, personal: false, isPost: true, siblings: posts });
    const grid = el(".masonry" + (state.even ? ".even" : ""));
    for (const p of posts) grid.append(workCard(p, { onOpen: openPost, hue: false }));
    body.replaceChildren(grid);
  }
}

function feedEmpty() {
  const eic = iconEl("home"); eic.classList.add("eic");
  return el(".emptystate", {}, [
    eic, el("h3", {}, ["Your feed is quiet"]),
    el("p", {}, ["Friends' public work lands here."]),
    el("button.btn.primary", { onClick: () => navigate(withDemo("/messages")) }, ["Add friends"]),
  ]);
}

function emptyState(icon, title, sub) {
  const eic = iconEl(icon); eic.classList.add("eic");
  return el(".emptystate", {}, [eic, el("h3", {}, [title]), sub ? el("p", {}, [sub]) : null]);
}
