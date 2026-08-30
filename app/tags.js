// tags.js — P11 typed, colour-coded tags (owner picked the "soft chip" treatment, 2026-08-30).
//
// A typed tag is stored in `content_tags.tag` as "type:value" (e.g. "bpm:142", "key:F min").
// The part before the first colon must be one of TAG_TYPES to count as typed — anything else is
// an untyped free tag. No schema change: the type lives in the string, the colour is client-side
// (--tt-<type>, tokens.css, generated with the member-hue OKLCH method so they harmonise). This
// is content metadata, NOT member identity, so unlike the member hue it may render anywhere
// (explorer, feed, details). Required-tags-per-channel enforcement is D5 (separate).

import { el } from "./ui.js";

export const TAG_TYPES = ["bpm", "key", "genre", "mood", "instrument"];

// "bpm:142" -> { type:"bpm", value:"142", raw:"bpm:142", typed:true }; a bare/unknown-prefix
// word -> { type:null, value:"lofi", typed:false }. Only a KNOWN type before the colon is typed.
export function parseTag(raw) {
  const s = String(raw || "").trim();
  const i = s.indexOf(":");
  if (i > 0) {
    const type = s.slice(0, i).trim().toLowerCase();
    const value = s.slice(i + 1).trim();
    if (TAG_TYPES.includes(type) && value) return { type, value, raw: `${type}:${value}`, typed: true };
  }
  return { type: null, value: s, raw: s, typed: false };
}

// type + value -> the stored "type:value" (or a bare value when untyped/unknown)
export function makeTag(type, value) {
  const v = String(value || "").trim();
  if (!v) return "";
  return type && TAG_TYPES.includes(type) ? `${type}:${v}` : v;
}

// the fixed hue token for a type (or --soft for untyped)
export const tagColor = (type) => (type && TAG_TYPES.includes(type)) ? `var(--tt-${type})` : "var(--soft)";
// a low wash of the type hue over the surface, for the chip background
const wash = (type) => `color-mix(in srgb, var(--tt-${type}) 15%, var(--surface))`;

// render one tag as the V2 soft chip: typed = tinted by its type + a small type affix; untyped =
// a neutral --tagbg chip. `removable` adds a hover ✕ that calls onRemove(raw).
export function tagChip(raw, { removable = false, onRemove } = {}) {
  const t = parseTag(raw);
  const chip = el(".tchip" + (t.typed ? ".typed" : ""));
  if (t.typed) {
    chip.style.background = wash(t.type);
    chip.style.color = tagColor(t.type);
    chip.append(el("span.ty", {}, [t.type]), el("span", {}, [t.value]));
  } else {
    chip.append(el("span", {}, [t.value]));
  }
  if (removable) chip.append(el("span.x", { title: "Remove tag", "aria-label": "Remove tag", onClick: (e) => { e.stopPropagation(); onRemove && onRemove(t.raw); } }, ["✕"]));
  return chip;
}

// A managed typed-tag input (owner V2). Renders committed tags as chips + a colon-aware input:
// typing "bpm:142" colours the recognised type live; Enter commits it. `required` (an array of
// type names, e.g. a channel's mandatory types — D5) pre-seeds fill-in-place slots that can't be
// removed. Returns { node, getTags } — getTags() gives the current stored strings.
export function tagEditor({ initial = [], required = [], placeholder = "add a tag… (bpm:142)" } = {}) {
  let tags = (initial || []).map((x) => parseTag(x).raw);
  const chips = el(".tchips");

  const commit = (raw) => { const t = parseTag(raw); if (!t.value || tags.includes(t.raw)) return; tags.push(t.raw); paint(); };
  const remove = (raw) => { tags = tags.filter((x) => x !== raw); paint(); };

  function paint() {
    chips.replaceChildren();
    // required typed slots first — pre-seeded, non-removable, fill-in-place (type name = placeholder)
    for (const type of required) {
      const slot = el(".tchip.typed.chipslot");
      slot.style.background = `color-mix(in srgb, var(--tt-${type}) 15%, var(--surface))`;
      slot.style.color = tagColor(type);
      const inp = el("input", { placeholder: type, "aria-label": type + " (required)" });
      const existing = tags.find((x) => parseTag(x).type === type);
      if (existing) inp.value = parseTag(existing).value;
      const ty = el("span.ty", {}, [type]); ty.style.display = inp.value ? "inline" : "none";
      inp.addEventListener("input", () => {
        tags = tags.filter((x) => parseTag(x).type !== type);
        if (inp.value.trim()) tags.push(makeTag(type, inp.value));
        ty.style.display = inp.value ? "inline" : "none";
      });
      slot.append(inp, ty); chips.append(slot);
    }
    // committed free/typed tags (skip any bound to a required slot)
    for (const raw of tags) { if (required.includes(parseTag(raw).type)) continue; chips.append(tagChip(raw, { removable: true, onRemove: remove })); }
  }

  const input = el("input", { placeholder });
  const field = el(".field.searchbar.tagin", {}, [input]);
  const hint = el(".taghint");
  const recolor = () => {
    const a = (input.value.split(":")[0] || "").trim().toLowerCase();
    if (input.value.includes(":") && TAG_TYPES.includes(a)) {
      input.style.color = tagColor(a); input.style.fontWeight = "600";
      hint.textContent = `typed ${a} — press Enter to add`;
    } else { input.style.color = ""; input.style.fontWeight = ""; hint.textContent = input.value.trim() ? "tip: add a colon to type it (bpm:142)" : ""; }
  };
  input.addEventListener("input", recolor);
  input.addEventListener("keydown", (e) => { if (e.key !== "Enter" || !input.value.trim()) return; e.preventDefault(); commit(input.value); input.value = ""; recolor(); });

  paint();
  return { node: el(".tageditor", {}, [chips, field, hint]), getTags: () => tags.slice() };
}
