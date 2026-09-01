// tags.js — P11 typed, colour-coded tags (owner picked the "soft chip" treatment, 2026-08-30),
// extended for P38 custom tag types + the two-click-surface search-modifier hand-off (2026-08-31).
//
// A typed tag is stored in `content_tags.tag` as "type:value" (e.g. "bpm:142", "key:F min"). ANY
// word before the first colon makes it typed now (P38) — not just the curated TAG_TYPES set. A
// curated type gets its fixed --tt-<type> hex (tokens.css); anything else gets a colour HASHED from
// the type string through the same OKLCH generator (customHue below) — deterministic, no schema
// change, no JS dark-mode detection needed (only the hue is computed; --tt-l/--tt-c theme-swap on
// their own). This is content metadata, NOT member identity, so unlike the member hue it may render
// anywhere (explorer, feed, details). Required-tags-per-channel enforcement is D5 (separate).

import { el } from "./ui.js";
import { isReservedTagType } from "./search-modifiers.js";

// the curated subset with hand-picked (not hashed) hex tokens — kept for the ones used often enough
// to deserve a considered colour. Any OTHER type is still typed (P38), just hash-coloured.
export const TAG_TYPES = ["bpm", "key", "genre", "mood", "instrument"];

// "bpm:142" -> { type:"bpm", value:"142", raw:"bpm:142", typed:true }; a bare word (no colon, or
// nothing on one side of it) -> { type:null, value:"lofi", typed:false }. P38: ANY non-empty type
// before the colon counts now, curated or custom.
export function parseTag(raw) {
  const s = String(raw || "").trim();
  const i = s.indexOf(":");
  if (i > 0) {
    const type = s.slice(0, i).trim().toLowerCase();
    const value = s.slice(i + 1).trim();
    if (type && value) return { type, value, raw: `${type}:${value}`, typed: true };
  }
  return { type: null, value: s, raw: s, typed: false };
}

// type + value -> the stored "type:value" (or a bare value when no type given)
export function makeTag(type, value) {
  const v = String(value || "").trim();
  if (!v) return "";
  return type ? `${type}:${v}` : v;
}

// a small deterministic string hash -> a hue in [0,360). Not cryptographic — just needs to spread
// custom types across the wheel so two different types rarely land on the same hue.
function hashHue(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
  return h % 360;
}
// the CSS colour for a type: a curated fixed token, or a hashed oklch() for a custom one. --soft
// for untyped. oklch()/color-mix() are both baseline-supported; --tt-l/--tt-c theme-swap already.
export const tagColor = (type) => {
  if (!type) return "var(--soft)";
  if (TAG_TYPES.includes(type)) return `var(--tt-${type})`;
  return `oklch(var(--tt-l) var(--tt-c) ${hashHue(type)}deg)`;
};
// a low wash of the type hue over the surface, for the chip background
const wash = (type) => `color-mix(in srgb, ${tagColor(type)} 15%, var(--surface))`;

// a keyboard-and-mouse clickable inline element (role=button, Enter/Space activates) — used for the
// tag chip's two independent click surfaces (P38) so each is its own accessible target without
// pulling in a real <button>'s UA padding inside the dense chip.
function clickableSpan(cls, text, title, onClick) {
  const s = el("span" + cls, { role: "button", tabindex: "0", title }, [text]);
  s.addEventListener("click", (e) => { e.stopPropagation(); onClick(e); });
  s.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick(e); } });
  return s;
}

// render one tag as the V2 soft chip: typed = tinted by its type + a small type affix; untyped =
// a neutral --tagbg chip. P38: a typed chip has TWO independent click surfaces — the type affix
// calls onSearch({kind:'reserved',key:'hastag',value:type}) (any file with a tag of that type), the
// value calls onSearch({kind:'tag',type,value}) (that exact type:value). An untyped chip has ONE
// surface, calling onSearch({kind:'reserved',key:'tag',value}) (that exact bare tag) — the shapes
// search-modifiers.js expects, so a click commits straight into the filter rail, no text parsing.
// `removable` adds a ✕ that appears ON HOVER as an OVERLAY on the right edge, calling onRemove(raw).
export function tagChip(raw, { removable = false, onRemove, onSearch } = {}) {
  const t = parseTag(raw);
  const chip = el(".tchip" + (t.typed ? ".typed" : "") + (onSearch ? ".clickable" : ""));
  if (t.typed) {
    chip.style.background = wash(t.type);
    chip.style.color = tagColor(t.type);
    if (onSearch) {
      chip.append(
        clickableSpan(".ty", t.type, `Show every file with a ${t.type} tag`, () => onSearch({ kind: "reserved", key: "hastag", value: t.type })),
        clickableSpan("", t.value, `Show files tagged ${t.raw}`, () => onSearch({ kind: "tag", type: t.type, value: t.value })),
      );
    } else {
      chip.append(el("span.ty", {}, [t.type]), el("span", {}, [t.value]));
    }
  } else if (onSearch) {
    chip.append(clickableSpan("", t.value, `Show files tagged ${t.raw}`, () => onSearch({ kind: "reserved", key: "tag", value: t.value })));
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

  // owner 2026-09-01: reject a typed tag whose type is a reserved search word (in/ext/by/channel/
  // hastag/tag/before/after) — see isReservedTagType's comment. Returns true/false so the input
  // knows whether to clear itself or leave the rejected text in place with a hint explaining why.
  const commit = (raw) => {
    const t = parseTag(raw);
    if (!t.value || tags.includes(t.raw)) return true;   // no-op (blank / dupe) — still "handled", clear the field
    if (t.typed && isReservedTagType(t.type)) return false;
    tags.push(t.raw); paint();
    return true;
  };
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
    // P38: ANY colon-prefixed type colours live now (curated or custom), not just TAG_TYPES.
    if (input.value.includes(":") && a && input.value.slice(input.value.indexOf(":") + 1).trim()) {
      if (isReservedTagType(a)) {
        input.style.color = "var(--danger)"; input.style.fontWeight = "600";
        hint.textContent = `"${a}" is a reserved search word — pick a different type`;
      } else {
        input.style.color = tagColor(a); input.style.fontWeight = "600";
        hint.textContent = `typed ${a} — press Enter to add`;
      }
    } else { input.style.color = ""; input.style.fontWeight = ""; hint.textContent = input.value.trim() ? "tip: add a colon to type it (bpm:142)" : ""; }
  };
  input.addEventListener("input", recolor);
  input.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" || !input.value.trim()) return;
    e.preventDefault();
    if (commit(input.value)) { input.value = ""; recolor(); }
    // rejected: leave the text so the owner can just fix the type, hint (set by recolor) explains why
  });

  paint();
  return { node: el(".tageditor", {}, [chips, field, hint]), getTags: () => tags.slice() };
}
