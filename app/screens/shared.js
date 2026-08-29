// screens/shared.js — the read-only shared-link viewer (P5.16, CANON #40). What a
// /shared/:token link opens to: ONLY the shared work, no rail, no way to browse the rest
// of the server. A standalone full-screen page (mounted outside the app shell by main.js),
// works signed-out. Media rendering is the SAME dispatch the details pane uses (fillMedia)
// so a shared file previews identically. No member hue — this is an anon / out-of-server
// context, so the sharer's name is plain text (the server-scoped hue renders nowhere here).

import { el, toast, Avatar } from "../ui.js";
import { iconEl } from "../icons.js";
import { fillMedia, fmtBytes, openDetails } from "./details.js";
import { downloadWork, workCard } from "../cards.js";
import { saveToFiles, requestToJoin, isDemo } from "../data.js";
import { navigate } from "../router.js";

const KIND_LABEL = { audio: "Audio", image: "Image", video: "Video", text: "Text", other: "File" };

export function renderShared(data) {
  const screen = el("section.screen", { "data-screen": "shared" });
  const view = el(".sharedview");
  screen.append(view);

  const head = el("header.svhd", {}, [
    el(".brand", {}, ["eski"]),
    el(".svctx", {}, data.dead
      ? ["Shared link"]
      : ["Shared by ", el("b", {}, [data.work?.who?.name || "someone"]), " · read-only"]),
  ]);

  if (data.dead) {
    view.append(head, deadState());
    return screen;
  }

  const w = data.work;
  // actions — Save needs a session (an anon viewer gets a sign-in toast); Download waits on
  // the R2 read env (same marker as the details pane). RLS is the fence on Save.
  head.append(el(".svacts", {}, [
    el("button.btn", { onClick: () => saveOne(w) }, [iconEl("save", "sm"), "Save to my files"]),
    el("button.btn.primary", { onClick: () => downloadWork(w) }, [iconEl("download", "sm"), "Download"]),
  ]));

  const media = el(".svmedia");
  fillMedia(media, w);

  const meta = el(".meta", {}, [
    metaRow("Shared by", w.who?.name || "someone"),
    metaRow("Type", (w.file_ext ? w.file_ext.toUpperCase() : (KIND_LABEL[w.kind] || "File")) + (w.kind && w.kind !== "other" ? ` · ${w.kind}` : "")),
    metaRow("Size", fmtBytes(w.bytes)),
    metaRow("Access", "Anyone with the link · view"),
  ]);

  const tags = (w.tags && w.tags.length)
    ? el(".dsec", {}, [el(".lb", {}, ["Tags"]), el(".chips", {}, w.tags.map((t) => el("span.tag", {}, [t])))])
    : null;

  const note = el(".svnote", {}, [iconEl("lock", "sm"), el("span", {}, ["You can only see what was shared with you. You can't browse the rest of this server."])]);

  view.append(head, el("main.svbody", {}, [media, el(".svmeta", {}, [el("h1", {}, [w.title || w.name || "untitled"]), meta, tags, note])]));
  return screen;
}

// K9 — the shared-FOLDER viewer: a read-only public listing of a folder's files (server or
// personal), no rail, works signed-out (the token is the capability). A shared SERVER folder
// also offers "Request to join {server}" so a viewer can ask in without an invite. Reuses the
// .sharedview chrome + the canonical workCard renderer (opens the details pane read-only).
export function renderSharedFolder(data) {
  const screen = el("section.screen", { "data-screen": "sharedfolder" });
  const view = el(".sharedview");
  screen.append(view);

  const head = el("header.svhd", {}, [
    el(".brand", {}, ["eski"]),
    el(".svctx", {}, data.dead ? ["Shared folder"] : ["Shared folder · read-only"]),
  ]);
  if (data.dead) { view.append(head, deadState()); return screen; }

  const files = data.files || [];
  // Request-to-join lives on a server folder only (a personal folder has no server to join).
  if (data.serverId) {
    const reqBtn = el("button.btn.primary", {}, [iconEl("plus", "sm"), `Request to join ${data.serverName || "server"}`]);
    reqBtn.addEventListener("click", async () => {
      reqBtn.disabled = true;
      try {
        const st = await requestToJoin(data.serverId);
        if (st === "member") { toast({ message: "You’re already a member", icon: "check" }); navigate(isDemo() ? `/s/${data.serverId}?demo=1` : `/s/${data.serverId}`); return; }
        reqBtn.replaceChildren(iconEl("check", "sm"), document.createTextNode("Request sent"));
        toast({ message: "Request sent — an admin will review it", icon: "check" });
      } catch (e) { reqBtn.disabled = false; toast({ message: e?.message || "Couldn’t send the request" }); }
    });
    head.append(el(".svacts", {}, [reqBtn]));
  }

  const grid = el(".masonry.even");
  for (const f of files) grid.append(workCard(f, { onOpen: () => openDetails(f, { siblings: files, isPost: false }), showWho: false, hue: false }));
  if (!files.length) grid.append(el(".emptystate", {}, [iconEl("grid"), el("h3", {}, ["This folder is empty"])]));

  const note = el(".svnote", {}, [iconEl("lock", "sm"), el("span", {}, ["You can only see this folder. You can't browse the rest of this server."])]);

  view.append(head, el("main.svbody", {}, [
    el(".svmeta", { style: "width:100%" }, [
      el("h1", {}, [data.folder || "Shared folder"]),
      el(".lb", { style: "color:var(--muted);margin:2px 0 16px" }, [`${files.length} file${files.length === 1 ? "" : "s"}`]),
      grid, note,
    ]),
  ]));
  return screen;
}

function metaRow(k, v) { return el(".row", {}, [el("span.k", {}, [k]), el("span.v", {}, [v])]); }

function saveOne(w) {
  saveToFiles(w.id)
    .then(() => toast({ message: "Saved to your files", icon: "check" }))
    .catch((e) => toast({ message: e?.message || "Sign in to save files" }));
}

function deadState() {
  return el("main.svbody.svexpired", {}, [
    el(".deadshare", {}, [
      el(".deadicon", {}, [iconEl("lock")]),
      el("h1", {}, ["This link is no longer active"]),
      el(".lead", {}, ["The person who shared this turned the link off or set it to expire. Ask them for a new one."]),
    ]),
  ]);
}
