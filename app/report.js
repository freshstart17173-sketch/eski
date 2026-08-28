// report.js — the shared Report modal (CANON §C.4 S6 / §C.7 / §C.11). One reason-radio
// surface used from a message ⋯, a DM row, a profile, and the details-pane flag. A report is
// a direct `reports` insert (reportTarget); the reason list includes CSAM per CANON.

import { el, openModal, Button, toast } from "./ui.js";
import { reportTarget } from "./data.js";

const REASONS = [
  ["spam", "Spam or scam"],
  ["harassment", "Harassment or hate"],
  ["explicit", "Explicit or inappropriate content"],
  ["csam", "Child sexual content (CSAM)"],
  ["other", "Something else"],
];

/** openReport({ targetType, targetId, serverId?, label? }) — opens the reason picker. */
export function openReport({ targetType, targetId = null, serverId = null, label = "this" }) {
  let reason = null;
  const opts = el(".repopts");
  for (const [v, t] of REASONS) {
    const row = el("button.repopt", { onClick: () => {
      reason = v;
      [...opts.children].forEach((c) => c.classList.remove("on"));
      row.classList.add("on");
      submit.disabled = false;
    } }, [el("span.repdot"), t]);
    opts.append(row);
  }
  const details = el("input", { placeholder: "Add details (optional)", "aria-label": "Details" });
  const submit = Button({ label: "Submit report", variant: "primary", disabled: true });
  const body = el("div", {}, [
    el("p", { style: "font-size:var(--fs-sm);color:var(--muted);margin:0 0 12px" }, [`Report ${label}. A moderator reviews every report; the reported party isn’t told who reported them.`]),
    opts,
    el("label.ulab", { style: "margin-top:14px" }, ["Details"]),
    el(".field", {}, [details]),
  ]);
  const { close } = openModal({ title: "Report", body, footer: [submit] });
  submit.addEventListener("click", async () => {
    submit.disabled = true;
    const full = reason + (details.value.trim() ? `: ${details.value.trim()}` : "");
    try {
      await reportTarget({ targetType, targetId, serverId, reason: full });
      close();
      toast({ message: "Report submitted — thank you", icon: "check" });
    } catch (e) { submit.disabled = false; toast({ message: e?.message || "Couldn’t submit the report" }); }
  });
  return { close };
}
