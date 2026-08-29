// screens/roles.js — the Roles editor (CANON §C.16, gated manage_roles). A two-column modal:
// the server's roles on the left (＋ New role · @everyone pinned + undeletable), and the
// selected role's editor on the right — name, a 30-hue colour picker, and the permission
// matrix grouped Server / Members / Content (§D.1). Roles are direct `roles` table CRUD
// (roles_write = has_perm(manage_roles)); every change saves immediately.

import { el, openModal, Button, toast } from "../ui.js";
import { iconEl } from "../icons.js";
import { loadRoles, createRole, updateRole, deleteRole, permBit, PERM_GROUPS, loadChannelRoles, setChannelAccess } from "../data.js";

export async function openRolesEditor(serverId) {
  let roles;
  try { roles = await loadRoles(serverId); } catch (e) { toast({ message: e?.message || "Couldn’t load the roles" }); return; }
  // custom roles first (by position), @everyone last.
  roles.sort((a, b) => (a.is_default ? 1 : 0) - (b.is_default ? 1 : 0) || (a.position || 0) - (b.position || 0));
  let sel = roles[0] || null;

  const list = el(".rolelist");
  const editor = el(".roleedit");

  function paintList() {
    list.replaceChildren(...roles.map((r) => el("button.rolerow" + (r === sel ? ".on" : ""), { onClick: () => { sel = r; paint(); } }, [
      el("span.rsw", { style: `background:${r.color != null ? `var(--m${r.color + 1})` : "var(--line2)"}` }),
      el("span.rnm", {}, [r.name]),
      r.is_default ? el("span.rdef", {}, ["default"]) : null,
    ])));
  }

  function paintEditor() {
    editor.replaceChildren();
    if (!sel) { editor.append(el(".sharenone", {}, ["Create a role to begin."])); return; }

    const nameI = el("input", { value: sel.name, "aria-label": "Role name", disabled: sel.is_default });
    nameI.addEventListener("change", async () => {
      const v = nameI.value.trim(); if (!v || v === sel.name) { nameI.value = sel.name; return; }
      sel.name = v; paintList();
      try { await updateRole(sel.id, { name: v }); } catch (e) { toast({ message: e?.message || "Couldn’t rename" }); }
    });
    editor.append(el("label.ulab", {}, ["Name"]), el(".field", {}, [nameI]));

    if (!sel.is_default) {
      const sw = el(".swatches");
      for (let i = 0; i < 30; i++) {
        sw.append(el("button.swatch" + (sel.color === i ? ".on" : ""), { style: `background:var(--m${i + 1})`, "aria-label": "hue " + (i + 1), onClick: async () => {
          sel.color = i; paintList(); paintEditor();
          try { await updateRole(sel.id, { color: i }); } catch (e) { toast({ message: e?.message || "Couldn’t set the colour" }); }
        } }));
      }
      editor.append(el("label.ulab", { style: "margin-top:12px" }, ["Colour"]), sw);
    }

    editor.append(el("label.ulab", { style: "margin-top:14px" }, ["Permissions"]));
    if (sel.is_default) editor.append(el(".rhint", {}, ["@everyone is the baseline every member holds. Admin/manage flags stay off."]));
    for (const g of PERM_GROUPS) {
      editor.append(el(".pgh", {}, [g.group]));
      for (const [flag, label] of g.flags) {
        const bit = permBit(flag);
        const box = el("span.cbx" + (((sel.permissions & bit) === bit) ? ".on" : ""), {}, [iconEl("check")]);
        editor.append(el("label.permrow", { onClick: (e) => {
          e.preventDefault();
          const nowOn = (sel.permissions & bit) === bit;
          sel.permissions = nowOn ? (sel.permissions & ~bit) : (sel.permissions | bit);
          box.classList.toggle("on", !nowOn);
          updateRole(sel.id, { permissions: sel.permissions }).catch((err) => toast({ message: err?.message || "Couldn’t save" }));
        } }, [box, el("span.pl", {}, [label])]));
      }
    }

    if (!sel.is_default) {
      const del = Button({ label: "Delete role", variant: "danger", size: "sm", icon: "trash" });
      del.addEventListener("click", async () => {
        try { await deleteRole(sel.id); roles = roles.filter((r) => r !== sel); sel = roles[0] || null; paint(); toast({ message: "Role deleted" }); }
        catch (e) { toast({ message: e?.message || "Couldn’t delete" }); }
      });
      editor.append(el("div", { style: "margin-top:18px" }, [del]));
    }
  }

  function paint() { paintList(); paintEditor(); }

  const newBtn = Button({ label: "New role", size: "sm", icon: "plus" });
  newBtn.addEventListener("click", async () => {
    try {
      const r = await createRole(serverId, "new role");
      const everyoneIdx = roles.findIndex((x) => x.is_default);
      roles.splice(everyoneIdx < 0 ? roles.length : everyoneIdx, 0, r);
      sel = r; paint();
    } catch (e) { toast({ message: e?.message || "Couldn’t create the role" }); }
  });

  const body = el(".roleseditor", {}, [
    el(".rolescol", {}, [el(".rolescolhd", {}, [el("b", {}, ["Roles"]), newBtn]), list]),
    editor,
  ]);
  paint();
  openModal({ title: "Roles & permissions", body, size: "wide" });
}

// Channel permissions (§C.18, gated manage_channels): a private channel's ROLE allow-list.
// The beta scopes access by role only (channel_roles) — zero picked = open to all members.
export async function openChannelAccess(serverId, channel) {
  let roles, allowed;
  try { [roles, allowed] = await Promise.all([loadRoles(serverId), loadChannelRoles(channel.id)]); }
  catch (e) { toast({ message: e?.message || "Couldn’t load channel access" }); return; }
  const custom = roles.filter((r) => !r.is_default);   // @everyone isn't an allow-list entry (it IS everyone)
  const picked = new Set(allowed);

  const rows = custom.map((r) => {
    const box = el("span.cbx" + (picked.has(r.id) ? ".on" : ""), {}, [iconEl("check")]);
    return el("label.permrow", { onClick: (e) => {
      e.preventDefault();
      if (picked.has(r.id)) { picked.delete(r.id); box.classList.remove("on"); }
      else { picked.add(r.id); box.classList.add("on"); }
    } }, [box, el("span.rsw", { style: `background:var(--m${(r.color ?? 0) + 1})` }), el("span.pl", {}, [r.name])]);
  });

  const save = Button({ label: "Save access", variant: "primary" });
  const body = el("div", {}, [
    el("p", { style: "font-size:var(--fs-sm);color:var(--muted);margin:0 0 12px" }, [`Pick which roles can see #${channel.name}. Leave all unchecked to keep it open to every member.`]),
    custom.length ? el(".permlist", {}, rows) : el(".sharenone", {}, ["No custom roles yet — create one in Roles & permissions first."]),
  ]);
  const { close } = openModal({ title: `#${channel.name} access`, body, footer: [save] });
  save.addEventListener("click", async () => {
    save.disabled = true;
    try {
      await setChannelAccess(channel.id, [...picked]);
      close();
      toast({ message: picked.size ? "Channel restricted to the picked roles" : "Channel open to all members", icon: "check" });
    } catch (e) { save.disabled = false; toast({ message: e?.message || "Couldn’t save access" }); }
  });
}
