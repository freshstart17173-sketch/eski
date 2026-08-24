// demo.js — the Late Bloom LP fixture that matches the gallery's `workspace`
// screen (docs/design/gallery.html, ?app=1#workspace), the visual LAW for P4.
//
// The workspace renders from a data object of this exact shape; against the live
// (empty) database the data layer returns the empty equivalent and the screen
// shows its empty states. This fixture drives the POPULATED render so the P4 UI
// can be verified pixel-against-gallery without seeding the database. It is gated
// behind `?demo=1` (see data.js) — never returned to a signed-in, real user.
//
// Member hues are indices into the 30-hue palette (tokens --m1..--m30); the
// byline colour is applied inline per member (server-scoped, CANON §A).

export const me = { id: "me", name: "jax", initials: "JX", handle: "jax", colorIdx: 5 };

// people, keyed so messages/members/pins share one identity + hue
const P = {
  jax:  { name: "jax",  initials: "JX", colorIdx: 5 },
  rae:  { name: "rae",  initials: "RA", colorIdx: 1 },
  dev:  { name: "dev",  initials: "DV", colorIdx: 3 },
  tomo: { name: "tomo", initials: "TM", colorIdx: 2 },
  kofi: { name: "kofi", initials: "KO", colorIdx: 4 },
  nel:  { name: "nel",  initials: "NL", colorIdx: 6 },
  mira: { name: "mira", initials: "MI", colorIdx: 4 },
};

export function demoWorkspace() {
  return {
    me,
    isAdmin: true,                      // jax is an admin of this server
    // server rail
    servers: [
      { id: "lb", name: "Late Bloom LP", initials: "LB", active: true },
      { id: "sp", name: "Specter",       initials: "SP", mentions: 7 },
      { id: "bs", name: "Beat swap",     initials: "BS" },
    ],
    dmUnread: 3,

    server: { id: "lb", name: "Late Bloom LP", initials: "LB" },

    // channel column — grouped by kind, in order
    channelGroups: [
      { kind: "text", label: "Channels", channels: [
        { id: "announcements", name: "announcements" },
        { id: "beats",   name: "beats", active: true },
        { id: "verses",  name: "verses", mentions: 4 },
        { id: "mixing",  name: "mixing" },
        { id: "references", name: "references" },
        { id: "stems", name: "stems and sessions" },
      ] },
      { kind: "voice", label: "Voice", channels: [
        { id: "booth", name: "the booth", voice: [
          { name: "dev", colorIdx: 3, doing: "sharing FL" },
          { name: "rae", colorIdx: 1 },
        ] },
        { id: "cowrite", name: "co-writing", voice: [] },
      ] },
    ],

    channel: { id: "beats", name: "beats", topic: "put the session name in the file name", pins: 3, files: 12 },

    // reverse-chron message stream (rendered top→bottom oldest→newest)
    messages: [
      { id: "m1", author: P.dev, time: "2:14 PM",
        body: "reworked the back half. same bpm, swapped the drums to the ones @rae liked",
        mentions: [{ name: "rae", colorIdx: 1 }],
        attach: { kind: "file", name: "late_bloom_beat.flp", ext: "FLP", tags: ["drums", "142bpm", "bridge"] },
        actions: true,
        reactions: [{ emoji: "🔥", n: 3 }, { emoji: "👀", n: 1 }],
        replies: 3 },
      { id: "m2", author: P.dev, time: "2:16 PM",
        body: "dropped the whole one-shot pack, grab what you want",
        clump: [
          { kind: "audio", name: "kick_punchy.wav" },
          { kind: "audio", name: "snare_tight.wav" },
          { kind: "audio", name: "hat_loop_142.wav" },
          { kind: "audio", name: "break_chop.wav" },
          { kind: "file",  name: "drum_bus.flp" },
        ], clumpMore: 3,
        reactions: [{ emoji: "🥁", n: 2 }] },
      { id: "m3", author: P.rae, time: "2:31 PM",
        body: "this is the one. pulling it into #mixing, dropping a scratch verse now",
        channelMentions: ["mixing"], edited: true,
        attach: { kind: "audio", name: "bridge_scratch_rae.wav", ext: "WAV", tags: ["acapella"] } },
      { id: "divider", newDivider: true },
      { id: "m4", author: P.mira, time: "2:38 PM",
        forward: { fromChannel: "references",
          author: { name: "nel", colorIdx: 6 }, when: "yesterday",
          text: "the drum sound we keep coming back to, this reference board" } },
      { id: "m5", author: P.tomo, time: "2:47 PM",
        body: "ableton user here, opened dev's stems fine. one note on the low end, dropped a comment on the bounce",
        attach: { kind: "file", name: "stems_sh040.zip", ext: "ZIP", size: "48 MB" } },
    ],

    typing: ["tomo"],

    pins: [
      { by: "jax", author: P.jax, time: "Mon", text: "session is Fri 3pm. bring stems bounced at 24/48, not the project files." },
      { by: "rae", author: P.dev, time: "2:14 PM", text: "latest beat", attach: { name: "late_bloom_beat.flp" } },
      { by: "jax", author: P.tomo, time: "Tue", text: "reference for the drum sound, the break at 0:48 is what we're chasing" },
    ],

    files: [
      { kind: "file",  name: "late_bloom_beat.flp",  ext: "FLP", who: "dev" },
      { kind: "audio", name: "bridge_scratch_rae.wav", ext: "WAV", who: "rae" },
      { kind: "image", name: "ref_drums.png", shot: "c", who: "rae" },
      { kind: "audio", name: "bounce_warm.wav", ext: "WAV", who: "dev" },
    ],

    // members rail, grouped by role
    memberGroups: [
      { label: "Admins", members: [
        { ...P.jax, doing: "arranging, Ableton", presence: "online" },
        { ...P.rae, doing: "recording", presence: "online" },
      ] },
      { label: "Members", members: [
        { ...P.dev, doing: "in FL Studio", presence: "online" },
        { ...P.tomo, doing: "reviewing the beat", presence: "online" },
        { ...P.kofi, doing: "offline", presence: "offline" },
        { ...P.nel,  doing: "offline", presence: "offline" },
      ] },
    ],

    // (the File explorer's own demo fixture lives in demoExplorer(), below)

    // a thread opened from m1's "3 replies"
    thread: {
      channel: "beats",
      parent: { author: P.dev, time: "2:14 PM", body: "reworked the back half. same bpm, swapped the drums",
        attach: { kind: "file", name: "late_bloom_beat.flp", ext: "FLP" } },
      replies: [
        { author: P.rae, time: "2:18 PM", body: "low end's a bit much on the bridge, otherwise this is the one" },
        { author: P.jax, time: "2:22 PM", body: "agreed. @tomo can you pull it down a couple db and bounce a rough?", mentions: [{ name: "tomo", colorIdx: 2 }] },
        { author: P.tomo, time: "2:26 PM", body: "on it, pushing a new bounce in a sec" },
      ],
    },
  };
}

// The File-explorer fixture (P5.4) — the same Late Bloom LP server as the
// workspace demo, shaped like loadExplorer()'s live return so the screen renders
// identically from either source. Folders nest (beats › drums); files carry their
// `folderId` (null = server root) and the member hue via `who.colorIdx`.
export function demoExplorer() {
  const W = (id, title, kind, ext, bytes, who, folderId, channelName, tags = []) => ({
    id, title, name: title, kind, file_ext: ext, blob_sha: null, bytes,
    who: { name: who, colorIdx: P[who].colorIdx }, channelName, folderId,
    created_at: "2026-08-15T12:00:00Z", hidden: false, tags,
  });
  return {
    needsAuth: false, live: false,
    me, isAdmin: true, dmUnread: 3,
    servers: [
      { id: "lb", name: "Late Bloom LP", initials: "LB", active: true },
      { id: "sp", name: "Specter", initials: "SP", mentions: 7 },
      { id: "bs", name: "Beat swap", initials: "BS" },
    ],
    server: { id: "lb", name: "Late Bloom LP", initials: "LB" },
    channelGroups: [
      { kind: "text", label: "Channels", channels: [
        { id: "announcements", name: "announcements" }, { id: "beats", name: "beats" },
        { id: "verses", name: "verses" }, { id: "mixing", name: "mixing" },
        { id: "references", name: "references" }, { id: "stems", name: "stems and sessions" },
      ] },
      { kind: "voice", label: "Voice", channels: [
        { id: "booth", name: "the booth", voice: [] }, { id: "cowrite", name: "co-writing", voice: [] },
      ] },
    ],
    membersById: {},
    folders: [
      { id: "beats", name: "beats", parentId: null, archived: false, locked: false, count: 4 },
      { id: "drums", name: "drums", parentId: "beats", archived: false, locked: false, count: 0 },
      { id: "verses", name: "verses", parentId: null, archived: false, locked: false, count: 0 },
      { id: "mixing", name: "mixing", parentId: null, archived: false, locked: false, count: 0 },
      { id: "references", name: "references", parentId: null, archived: false, locked: false, count: 1 },
      { id: "stems", name: "stems and sessions", parentId: null, archived: false, locked: true, count: 1 },
    ],
    files: [
      W("f1", "late_bloom_beat.flp", "other", "flp", 8.4e6, "dev", "beats", "beats", ["drums", "142bpm", "bridge"]),
      W("f2", "bridge_scratch_rae.wav", "audio", "wav", 18e6, "rae", "beats", "beats", ["acapella"]),
      W("f3", "ref_drums.png", "image", "png", 2.1e6, "rae", "beats", "beats", ["reference"]),
      W("f4", "bloom_master.als", "other", "als", 36e6, "jax", "beats", "beats", ["ableton", "master"]),
      W("f5", "moodboard.png", "image", "png", 3.3e6, "nel", "references", "references", ["cover", "wip"]),
      W("f6", "stems_sh040.zip", "other", "zip", 48e6, "tomo", "stems", "stems and sessions", ["stems"]),
      W("f7", "session_notes.md", "text", "md", 4200, "jax", null, null, []),
    ],
    currentFolderId: null,
    storage: { usedBytes: 74 * 1024 ** 3, capGb: 120, capBytes: 120 * 1024 ** 3, status: "active", overCap: false },
    activeServerId: "lb",
  };
}
