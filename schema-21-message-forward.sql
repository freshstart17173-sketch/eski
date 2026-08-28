-- eski schema · 21 · message forwarding (CANON §C.4, gallery S5)  — migration: p4_message_forward
-- A forwarded message is a normal message with an optional note whose `forwarded_from` points
-- at the source message. The client renders the source (author · channel · snippet) as a quote
-- block above the note (data.js resolves it on load; forwardMessage inserts one row per target).
-- The messages RLS already gates the insert to channels you may post in (can_interact_channel),
-- and the source only resolves if you can read it — so forwarding can't leak a private message.

alter table messages add column if not exists forwarded_from uuid references messages(id) on delete set null;
