// screens/landing.js — the signed-out marketing home. main.js shows this for
// "/" only when there's no session; a deep link to any other in-shell route
// still falls through to the plain magic-link prompt (screens/signin.js) — the
// landing page owns exactly one URL, it isn't a general signed-out fallback.
//
// Pitches eski as a social file library (the "social file sharing" framing),
// not the internal "servers/channels" jargon CANON uses for the builders — but
// every claim here maps to a real CANON concept (Feed, server, File explorer,
// comments, visibility, friends) so the copy never promises something the
// contract doesn't back.

import { icon } from "../icons.js";

const FEATURES = [
  { ic: "grid", title: "A feed, not a folder dump",
    body: "Friends’ public posts show up like a feed — scroll what people are making, not a file listing." },
  { ic: "server", title: "Servers for your crew",
    body: "Invite people into a server, split talk into channels, and keep every file that gets shared there." },
  { ic: "folder", title: "A real drive underneath",
    body: "Nested folders and search give the work a permanent home — nothing gets lost in scrollback." },
  { ic: "comment", title: "Feedback where the work lives",
    body: "Comment on a post, or reply in the channel it was shared in — never chase a file across five threads." },
  { ic: "lock", title: "Public, server, or just you",
    body: "Every file picks one of three audiences, labelled the same way everywhere, so you always know who’s looking." },
  { ic: "mail", title: "Friends, not followers",
    body: "One mutual relationship. Add a friend and their public work lands in your feed and your DMs open up." },
];

const USES = [
  { label: "Bands", body: "Drop a rough mix in #demos and keep stems in the drive — no re-uploading a file just to get notes on it." },
  { label: "Artists", body: "Post finished pieces to your public shelf; keep works-in-progress private until they’re ready to share." },
  { label: "Studios", body: "One server per project — a single place for renders, feedback, and everyone who needs to see them." },
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
      <p class="leyebrow">a social file library for creative teams</p>
      <h1>Share the work.<br>Keep every file where it belongs.</h1>
      <p class="lsub">Post to friends like a feed. Organize a team like a drive. Talk about it in
        channels that remember everything — without losing a version in a group chat.</p>
      <div class="lcta">
        <a class="btn primary" href="/signin">${icon("send")}Get started</a>
        <a class="btn ghost" href="#features">See what’s inside</a>
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

    <div class="lsection" id="features">
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

    <div class="lsection alt">
      <div class="lwrap">
        <h2>Built for people who make things</h2>
        <div class="luses">
          ${USES.map((u) => `
            <div class="luse">
              <b>${u.label}</b>
              <p>${u.body}</p>
            </div>`).join("")}
        </div>
      </div>
    </div>

    <div class="lclose">
      <h2>Stop losing files in a group chat.</h2>
      <a class="btn primary" href="/signin">${icon("send")}Get started — it’s free</a>
    </div>

    <footer class="lfoot">
      <span class="wordmark">eski!</span>
      <span class="lfootsub">a social file library for creative teams</span>
    </footer>
  `;
  return screen;
}
