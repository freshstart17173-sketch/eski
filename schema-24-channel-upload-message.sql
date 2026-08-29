-- eski schema · 24 · channel uploads post a message (B5)  — migration: p14_channel_upload_message
--
-- The owner reported that a file uploaded into a channel "didn't show in the channel" — it
-- landed as a server work with a channel placement (visible only in the server File explorer,
-- and, once B5 wired it, the channel's Files tab), but nothing appeared in the chat stream.
-- Discord-style, a channel upload should read as a message. So `messages` gains an optional
-- `work_id`: a message can carry a work as its attachment, and `create_work` (schema-23) now
-- posts one such message when — and only when — a file is uploaded straight into a channel.
--
-- `on delete set null` (not cascade): deleting the underlying work should leave the message in
-- place (its attachment just resolves to nothing) rather than silently vanishing from history —
-- same choice as `forwarded_from`. loadWorkspace/realtime resolve work_id → the attachment card.

alter table messages add column if not exists work_id uuid references works(id) on delete set null;

-- partial index: only attachment-bearing messages, for the per-work "where is this posted" lookups
-- and to keep the resolve join cheap. Most messages have no work_id, so the partial index stays small.
create index if not exists messages_work_id_idx on messages(work_id) where work_id is not null;
