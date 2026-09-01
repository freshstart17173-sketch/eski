// search-modifiers.js — the shared modifier grammar (P27 + P34, folding in P38's tag click-through).
import { el } from "./ui.js";
import { iconEl } from "./icons.js";
//
// THE MODEL (owner 2026-08-31, replacing the old free-text-only P21/P24 parse): a committed
// modifier lives in a RAIL below the search field, as a removable chip — NOT as text inside the
// field. The field holds ONLY free-text search words. This is P27's filter/search split made
// visible: the rail (structured, removable at a glance) is the FILTER state (screen-local by
// default); whatever's left as plain words in the field is the SEARCH text (goes deep, server-side).
// You can literally SEE the difference — chip = filter, typed word = search — instead of it being a
// behavioural rule buried in the code.
//
// Sort/Group stay OUT of this grammar for now (owner: still solid as dropdowns — P33). One small
// module so a later P31 (the same grammar in channel/message search) has something to import
// instead of re-deriving it.

// Reserved keys ALWAYS win over a same-named tag type (owner: "setting some modifiers as protected
// is fine"). Anything else shaped like word:value is an exact tag filter — including a brand-new
// CUSTOM type nobody's told this module about (P38: any type:value self-defines a coloured tag).
export const RESERVED_KEYS = ["in", "ext", "by", "channel", "hastag", "tag", "before", "after"];

// owner 2026-09-01: "no logic stopping me from making illegal typed tags like in:folder or
// hastag:tag" — a REAL content tag typed with one of these words as its type (content_tags.tag =
// "in:folder") collides with the reserved grammar above: typing in:folder into the search box
// always parses as the folder-scope modifier (parseModifierToken), never as a literal tag search,
// so an unquoted search for that exact tag can never reach it. Shared by every tag-creation entry
// point (tags.js's tagEditor, the folder-tag popover input in explorer.js) so the rule can't drift
// between them the way a duplicated check would.
export function isReservedTagType(type) { return RESERVED_KEYS.includes(String(type || "").toLowerCase()); }

// the muted lead-in word a chip shows for each reserved key (the bold part is always the value)
const RESERVED_LABEL = { in: "in", ext: "type", by: "by", channel: "in #", hastag: "has", tag: "tag", before: "before", after: "after" };

// one-line description for the autocomplete helper / a11y titles
export const RESERVED_HINT = {
  in: "scope to a folder (and its subfolders)", ext: "file extension", by: "uploaded by",
  channel: "posted in this channel", hastag: "has a tag of this type", tag: "has this exact tag",
  before: "added before this date", after: "added after this date",
};

// "in:beats"  -> {kind:'reserved', key:'in', value:'beats'}
// "bpm:120"   -> {kind:'tag', type:'bpm', value:'120'}        (exact type:value — known OR custom)
// "acapella"  -> null                                          (free text — no colon / empty side)
// '"in:beats"'-> {kind:'tag', type:'in', value:'beats'}        (quoted escape hatch past a reserved word)
export function parseModifierToken(raw) {
  let s = String(raw || "").trim();
  if (!s) return null;
  let forceTag = false;
  if (s.length > 2 && s.startsWith('"') && s.endsWith('"')) { s = s.slice(1, -1).trim(); forceTag = true; }
  const ci = s.indexOf(":");
  if (ci <= 0 || ci === s.length - 1) return null;   // no colon, or nothing before/after it
  const key = s.slice(0, ci).trim().toLowerCase();
  const value = s.slice(ci + 1).trim();
  if (!key || !value) return null;
  if (!forceTag && RESERVED_KEYS.includes(key)) return { kind: "reserved", key, value };
  return { kind: "tag", type: key, value };
}

// a committed modifier's raw text form — round-trips through parseModifierToken
export function modifierRaw(mod) {
  return mod.kind === "reserved" ? `${mod.key}:${mod.value}` : `${mod.type}:${mod.value}`;
}

// {label, value, hint} for rendering — label is the muted lead-in, value is the bold part
export function modifierLabel(mod) {
  if (mod.kind === "reserved") return { label: RESERVED_LABEL[mod.key] || mod.key, value: mod.value, hint: RESERVED_HINT[mod.key] };
  return { label: mod.type, value: mod.value, hint: `has the tag ${mod.type}:${mod.value}` };
}

// two modifiers are the same committed filter if they carry the same key/type + value
export function sameModifier(a, b) { return modifierRaw(a) === modifierRaw(b); }

// convenience constructors for the tag-chip click-through (P38's two surfaces) and the folder-scope
// chip, so callers never hand-build a modifier's shape
export const modHasTag = (type) => ({ kind: "reserved", key: "hastag", value: type });
export const modExactTag = (type, value) => ({ kind: "tag", type, value });
export const modUntypedTag = (value) => ({ kind: "reserved", key: "tag", value });
export const modInFolder = (folderName) => ({ kind: "reserved", key: "in", value: folderName });

// Split a committed-modifiers array into the shape the explorer's client-side filter and the
// search_files RPC both consume. `by`/`channel`/`before`/`in` are applied CLIENT-SIDE as a
// post-filter on the loaded/fetched rows (search_files has no folder-scope or channel/before param
// yet — K12 indexing is the place to move them server-side; not this pass).
export function splitModifiers(modifiers) {
  const exts = [], hastypes = [], tags = [];
  let by = null, channel = null, before = null, after = null, inFolder = null;
  for (const m of modifiers) {
    if (m.kind === "tag") { tags.push(`${m.type}:${m.value}`); continue; }
    switch (m.key) {
      case "ext": exts.push(m.value.toLowerCase().replace(/^\./, "")); break;
      case "hastag": hastypes.push(m.value.toLowerCase()); break;
      case "tag": tags.push(m.value); break;
      case "by": by = m.value; break;
      case "channel": channel = m.value; break;
      case "before": before = m.value; break;
      case "after": after = m.value; break;
      case "in": inFolder = m.value; break;
    }
  }
  return { exts, hastypes, tags, by, channel, before, after, inFolder };
}

// One chip in the rail. Owner 2026-08-31: a modifier gets its OWN colour (--mod) — a magenta/rose,
// distinct from a grey untyped tag AND a coloured typed tag — so a filter chip is never mistaken for
// a content tag sitting on a card, even when the modifier itself came from clicking a tag (e.g.
// hastag:bpm or an exact bpm:120 filter both render in --mod, not bpm's own blue; the blue stays on
// the card, the magenta says "this is a filter"). Mirrors tagChip's two-part label+value structure
// for a consistent reading, just recoloured.
export function modChip(mod, { onRemove } = {}) {
  const { label, value, hint } = modifierLabel(mod);
  const chip = el(".mchip", { title: hint || "" }, [
    el("span.k", {}, [label]), el("span.v", {}, [value]),
  ]);
  if (onRemove) chip.append(el("button.x", { title: "Remove filter", "aria-label": `Remove ${label} ${value} filter`, onClick: (e) => { e.stopPropagation(); onRemove(mod); } }, [iconEl("x", "sm")]));
  return chip;
}
