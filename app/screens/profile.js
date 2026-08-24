// screens/profile.js — the Profile (P5.10, CANON §C.10). A person's shelves,
// rendered by POV (viewer-dependent, enforced server-side): owner sees all three
// shelves + Settings and an Edit-profile action; a stranger sees only Public + Add
// friend; a friend sees Public + Server + Message. Same card renderer as the Feed,
// NO member colour (a public profile is never server-scoped).

import { el, toast, Avatar, openModal, Button } from "../ui.js";
import { iconEl } from "../icons.js";
import { navigate } from "../router.js";
import { workCard, avatarUrl } from "../cards.js";
import { openDetails } from "./details.js";
import { updateProfile, updateProfileImage, isDemo } from "../data.js";
import { uploadBlobs } from "../upload-r2.js";

const SHELVES = [
  { key: "public", label: "Public", icon: "globe" },
  { key: "server", label: "Server", icon: "server" },
  { key: "private", label: "Private", icon: "lock" },
];

export function renderProfile(data) {
  const screen = el("section.screen", { "data-screen": "profile" });
  const prof = el(".prof");
  screen.append(prof);

  if (data.notFound) {
    prof.append(emptyState("user", "No such profile", "That handle doesn't exist, or you can't see it."));
    return screen;
  }

  const p = data.profile;
  const pov = data.pov || "public";
  // which shelves this POV may see: owner all three; mutual Public+Server; public only Public
  const visibleShelves = pov === "owner" ? SHELVES : pov === "mutual" ? SHELVES.slice(0, 2) : SHELVES.slice(0, 1);
  const state = { shelf: visibleShelves[0].key, even: true, query: "" };

  // hero — round avatar (from avatar_key, initials fallback), name, @handle, bio, POV actions
  const who = el(".who", {}, whoKids(p));
  const heroAv = Avatar({ name: p.initials || p.name, size: "lg", src: avatarUrl(p.avatar_key) });
  const actions = el(".actions");
  if (pov === "owner") actions.append(el("button.btn.primary", { onClick: () => openEditProfile(data, {
    onSaved: () => who.replaceChildren(...whoKids(p)),
    onAvatar: (src) => setAvatarImg(heroAv, src, p.initials || p.name),
  }) }, [iconEl("pen", "sm"), "Edit profile"]));
  else if (pov === "public") actions.append(el("button.btn.primary", { onClick: () => toast({ message: "Friend request sent" }) }, [iconEl("plus", "sm"), "Add friend"]));
  else actions.append(el("button.btn.primary", { onClick: () => toast({ message: "Message (P7)" }) }, [iconEl("mail", "sm"), "Message"]));
  const hero = el(".phero", {}, [el(".top", {}, [heroAv, who, actions])]);

  // shelf tabs (+ Settings for owner) + search
  const tabs = el(".ptabs2");
  const body = el(".pbody");
  for (const sh of visibleShelves) {
    const count = (data.shelves?.[sh.key] || []).length;
    const tab = el("button.ptab2" + (sh.key === state.shelf ? ".on" : ""), { onClick: () => { state.shelf = sh.key; paint(); } }, [
      iconEl(sh.icon), sh.label, el("span.ct", {}, [String(count)]),
    ]);
    tabs.append(tab);
  }
  if (pov === "owner") tabs.append(el("button.ptab2", { onClick: () => toast({ message: "User settings (P9)" }) }, [iconEl("settings"), "Settings"]));

  // search — a toggle that reveals an inline filter over the VISIBLE shelf (title match);
  // it's a client-side narrow of what's already loaded, not a new query, so no backend call.
  const searchInput = el("input", { placeholder: "Search this profile", "aria-label": "Search this profile" });
  const searchField = el(".field.psearch", { style: "margin-left:auto;max-width:240px;display:none" }, [searchInput]);
  const searchBtn = el("button.iconbtn", { style: "margin-left:auto", title: "Search this profile", "aria-label": "Search this profile", onClick: () => toggleSearch() });
  searchBtn.append(iconEl("search"));
  searchInput.addEventListener("input", () => { state.query = searchInput.value.trim(); paint(); });
  searchInput.addEventListener("keydown", (e) => { if (e.key === "Escape") { e.preventDefault(); toggleSearch(false); } });
  function toggleSearch(on) {
    const show = on == null ? searchField.style.display === "none" : on;
    searchField.style.display = show ? "flex" : "none";
    searchBtn.style.display = show ? "none" : "";
    if (show) searchInput.focus();
    else if (state.query) { searchInput.value = ""; state.query = ""; paint(); }
  }
  tabs.append(searchBtn, searchField);

  prof.append(hero, tabs, body);
  paint();
  return screen;

  function paint() {
    // reflect the active tab. NB coerce to a real boolean: classList.toggle(cls,
    // undefined) *flips* rather than clears, which would wrongly light the Settings
    // tab (it sits past the end of visibleShelves).
    tabs.querySelectorAll(".ptab2").forEach((t, i) => t.classList.toggle("on", !!(visibleShelves[i] && visibleShelves[i].key === state.shelf)));
    let works = data.shelves?.[state.shelf] || [];
    const q = state.query.toLowerCase();
    if (q) works = works.filter((w) => (w.title || w.name || "").toLowerCase().includes(q));
    if (!works.length) {
      body.replaceChildren(q
        ? emptyState("search", "No results", `Nothing on this shelf matches “${state.query}”.`)
        : shelfEmpty(state.shelf));
      return;
    }
    const openPost = (w) => openDetails(w, { serverName: null, personal: false, isPost: state.shelf === "public", comments: [], siblings: works });
    const grid = el(".masonry" + (state.even ? ".even" : ""));
    for (const w of works) grid.append(workCard(w, { onOpen: openPost, hue: false }));
    body.replaceChildren(grid);
  }
}

// the hero identity block — extracted so Edit-profile can repaint it in place after a save
// (the bio row only exists when there's a bio, so replaceChildren rebuilds cleanly).
function whoKids(p) {
  return [
    el("h1", {}, [p.name]),
    el(".handle", {}, ["@" + p.handle]),
    p.bio ? el(".bio", {}, [p.bio]) : null,
  ];
}

// replace an avatar element's content with a photo (initials fallback on load error)
function setAvatarImg(avEl, src, name) {
  avEl.replaceChildren(); avEl.style.color = "";
  if (!src) { avEl.textContent = (name || "?").trim().slice(0, 2).toUpperCase(); return; }
  const img = el("img", { src, alt: name || "" });
  img.addEventListener("error", () => { avEl.replaceChildren(); avEl.textContent = (name || "?").trim().slice(0, 2).toUpperCase(); }, { once: true });
  avEl.append(img);
}

// Edit-profile modal (CANON §C.10, gallery #epModal). Text fields (name/handle/bio) are a
// self-only `profiles` write (updateProfile). **Change photo is now a real upload**: pick an
// image → upload-r2 (sign→PUT) → `profiles.avatar_key`, and the new photo repaints in the
// dialog + the hero (via onAvatar). Demo previews the picked file locally (a blob URL), no R2.
// Change banner stays a marker until a hero banner is rendered (banner_key write is ready).
// `opts`: { onSaved, onAvatar }.
function openEditProfile(data, opts = {}) {
  const p = data.profile;
  const demo = isDemo();
  const avImg = Avatar({ name: p.initials || p.name, size: "lg", src: avatarUrl(p.avatar_key) });
  const fileInput = el("input", { type: "file", accept: "image/*", style: "display:none" });
  fileInput.addEventListener("change", async () => {
    const file = fileInput.files?.[0]; fileInput.value = "";
    if (!file) return;
    try {
      let src;
      if (demo) src = URL.createObjectURL(file);   // demo: local preview, never touches R2
      else { const [{ key }] = await uploadBlobs([file]); await updateProfileImage("avatar_key", key); p.avatar_key = key; src = avatarUrl(key); }
      setAvatarImg(avImg, src, p.name);
      opts.onAvatar?.(src);
      toast({ message: "Photo updated", icon: "check" });
    } catch (e) { toast({ message: e?.message || "Couldn’t update your photo" }); }
  });
  const avRow = el(".epavrow", { style: "display:flex;align-items:center;gap:12px;margin-bottom:6px" }, [
    avImg,
    fileInput,
    Button({ label: "Change photo", size: "sm", icon: "pen", onClick: () => fileInput.click() }),
    Button({ label: "Change banner", size: "sm", icon: "pen", onClick: () => toast({ message: "Profile banner (a hero banner render lands next)" }) }),
  ]);

  const nameI = el("input", { value: p.name || "", "aria-label": "Display name" });
  const handleI = el("input", { value: p.handle || "", "aria-label": "Handle" });
  const bioI = el("input", { value: p.bio || "", "aria-label": "Bio" });

  const body = el("div", {}, [
    avRow,
    el("label.ulab", {}, ["Display name"]),
    el(".field", {}, [nameI]),
    el("label.ulab", {}, ["Handle"]),
    el(".field", {}, [el("span", { style: "color:var(--muted)" }, ["@"]), handleI]),
    el(".svnote", {}, [iconEl("check", "sm"), el("span", {}, ["Changing your handle breaks old links to your profile."])]),
    el("label.ulab", {}, ["Bio"]),
    el(".field", {}, [bioI]),
  ]);

  const cancel = Button({ label: "Cancel", variant: "ghost" });
  const save = Button({ label: "Save profile", variant: "primary" });
  const { close } = openModal({ title: "Edit profile", body, footer: [cancel, save] });
  cancel.addEventListener("click", () => close());
  save.addEventListener("click", async () => {
    if (save.disabled) return;
    save.disabled = true;
    try {
      const vals = await updateProfile({ name: nameI.value, handle: handleI.value, bio: bioI.value });
      Object.assign(p, vals, { initials: (vals.name || vals.handle).trim().slice(0, 2).toUpperCase() });
      opts.onSaved?.();
      close();
      toast({ message: "Profile saved", icon: "check" });
    } catch (e) { toast({ message: e?.message || "Couldn’t save your profile" }); save.disabled = false; }
  });
}

function shelfEmpty(shelf) {
  const map = {
    public: ["globe", "Nothing public yet", "Work published to this shelf shows up here. Post something public, or share a file to your profile."],
    server: ["server", "Nothing on the server shelf", "Files this person shared inside servers you share appear here."],
    private: ["lock", "Nothing private yet", "Files you keep to yourself land here."],
  };
  const [icon, title, sub] = map[shelf] || map.public;
  return emptyState(icon, title, sub);
}

function emptyState(icon, title, sub) {
  const eic = iconEl(icon); eic.classList.add("eic");
  return el(".emptystate", {}, [eic, el("h3", {}, [title]), el("p", {}, [sub])]);
}
