// screens/profile.js — the Profile (P5.10, CANON §C.10). A person's shelves,
// rendered by POV (viewer-dependent, enforced server-side): owner sees all three
// shelves + Settings and an Edit-profile action; a stranger sees only Public + Add
// friend; a friend sees Public + Server + Message. Same card renderer as the Feed,
// NO member colour (a public profile is never server-scoped).

import { el, toast, Avatar, openModal, Button } from "../ui.js";
import { iconEl } from "../icons.js";
import { navigate } from "../router.js";
import { workCard } from "../cards.js";
import { openDetails } from "./details.js";
import { updateProfile } from "../data.js";

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
  const state = { shelf: visibleShelves[0].key, even: true };

  // hero — round avatar, name, @handle, bio, POV actions
  const who = el(".who", {}, whoKids(p));
  const actions = el(".actions");
  if (pov === "owner") actions.append(el("button.btn.primary", { onClick: () => openEditProfile(data, () => who.replaceChildren(...whoKids(p))) }, [iconEl("pen", "sm"), "Edit profile"]));
  else if (pov === "public") actions.append(el("button.btn.primary", { onClick: () => toast({ message: "Friend request sent" }) }, [iconEl("plus", "sm"), "Add friend"]));
  else actions.append(el("button.btn.primary", { onClick: () => toast({ message: "Message (P7)" }) }, [iconEl("mail", "sm"), "Message"]));
  const hero = el(".phero", {}, [el(".top", {}, [Avatar({ name: p.initials || p.name, size: "lg" }), who, actions])]);

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
  tabs.append(el("button.iconbtn", { style: "margin-left:auto", title: "Search this profile", onClick: () => toast({ message: "Search profile (P5.15)" }) }, [iconEl("search")]));

  prof.append(hero, tabs, body);
  paint();
  return screen;

  function paint() {
    // reflect the active tab. NB coerce to a real boolean: classList.toggle(cls,
    // undefined) *flips* rather than clears, which would wrongly light the Settings
    // tab (it sits past the end of visibleShelves).
    tabs.querySelectorAll(".ptab2").forEach((t, i) => t.classList.toggle("on", !!(visibleShelves[i] && visibleShelves[i].key === state.shelf)));
    const works = data.shelves?.[state.shelf] || [];
    if (!works.length) { body.replaceChildren(shelfEmpty(state.shelf)); return; }
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

// Edit-profile modal (CANON §C.10, gallery #epModal) — the text fields (name / handle /
// bio) are a real self-only `profiles` write; on success the caller repaints the hero.
// Avatar + banner are R2 uploads, deferred to the R2 write env (same gate as file uploads
// and Download) — honest markers, not fakes. `onSaved` runs after the values are patched.
function openEditProfile(data, onSaved) {
  const p = data.profile;
  const avRow = el(".epavrow", { style: "display:flex;align-items:center;gap:12px;margin-bottom:6px" }, [
    Avatar({ name: p.initials || p.name, size: "lg" }),
    Button({ label: "Change photo", size: "sm", icon: "pen", onClick: () => toast({ message: "Profile photo (needs the R2 upload env)" }) }),
    Button({ label: "Change banner", size: "sm", icon: "pen", onClick: () => toast({ message: "Profile banner (needs the R2 upload env)" }) }),
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
      onSaved?.();
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
