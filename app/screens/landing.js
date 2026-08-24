// screens/landing.js — the signed-out marketing home. main.js shows this for
// "/" only when there's no session; a deep link to any other in-shell route
// still falls through to the plain magic-link prompt (screens/signin.js) — the
// landing page owns exactly one URL, it isn't a general signed-out fallback.
//
// Copy describes the product only — no audience targeting ("for bands", "for
// creatives"). The pitch is mechanical: Discord, with a real file server
// underneath. Every claim maps to a real CANON concept (Feed, server, File
// explorer, comments, visibility, friends) so nothing here promises something
// the contract doesn't back.

import { icon } from "../icons.js";

const FEATURES = [
  { ic: "grid", title: "A feed, not a folder dump",
    body: "Public posts show up like a feed. Scroll what's shared, not a file listing." },
  { ic: "server", title: "Servers and channels",
    body: "Invite people into a server, split talk into channels, and keep every file that gets shared there." },
  { ic: "folder", title: "A real drive underneath",
    body: "Nested folders and search give every file a permanent home, so nothing gets lost in scrollback." },
  { ic: "comment", title: "Comments where the file lives",
    body: "Comment on a post, or reply in the channel it was shared in, instead of chasing a file across five threads." },
  { ic: "lock", title: "Public, server, or just you",
    body: "Every file picks one of three audiences, labelled the same way everywhere, so you always know who's looking." },
  { ic: "mail", title: "Friends and DMs",
    body: "Friendship goes both ways. Add someone and their public posts show up in your feed, with DMs open too." },
];

const MOCK = [
  { ic: "image", name: "cover_final.png", by: "rae" },
  { ic: "music", name: "demo_v3.wav", by: "jules" },
  { ic: "video", name: "trailer_cut.mp4", by: "kit" },
  { ic: "file", name: "session.flp", by: "rae" },
  { ic: "folder", name: "renders", by: "kit" },
  { ic: "image", name: "poster.png", by: "jules" },
];

export function renderLanding() {
  const screen = document.createElement("section");
  screen.className = "screen landing";
  screen.dataset.screen = "landing";
  screen.innerHTML = `
    <header class="lnav">
      <a class="lbrand wordmark" href="/">eski!</a>
      <a class="btn outline" href="/signin">Sign in</a>
    </header>

    <div class="lhero">
      <h1>Discord, with a file server built in.</h1>
      <p class="lsub">Chat in servers and channels. Every file shared there lands in a real, organized
        drive: folders, search, and a feed of what's public. Comment on it, save a copy, find it again months later.</p>
      <div class="lcta">
        <a class="btn primary" href="/signin">Get started</a>
      </div>
    </div>

    <div class="lmock" aria-hidden="true">
      <div class="lmockgrid">
        ${MOCK.map((m) => `
          <div class="lmockcard">
            <div class="lmockmedia">${icon(m.ic)}</div>
            <div class="lmockmeta">
              <span class="lmockname">${m.name}</span>
              <span class="lmockby">${m.by}</span>
            </div>
          </div>`).join("")}
      </div>
    </div>

    <div class="lsection">
      <div class="lwrap">
        <h2>Everything a file needs</h2>
        <div class="lgrid">
          ${FEATURES.map((f) => `
            <div class="lcard">
              <div class="lic">${icon(f.ic)}</div>
              <h3>${f.title}</h3>
              <p>${f.body}</p>
            </div>`).join("")}
        </div>
      </div>
    </div>

    <div class="lclose">
      <h2>Stop losing files in a group chat.</h2>
      <a class="btn primary" href="/signin">Get started for free</a>
    </div>

    <footer class="lfoot">
      <span class="wordmark">eski!</span>
      <span class="lfootsub">Discord with a file server.</span>
    </footer>
  `;
  return screen;
}
