-- eski, sound effects as a stance + cue linking.
-- run after schema-parts.sql. safe to re-run.
--
-- TWO THINGS, and they are here together because the studio that uses one
-- uses the other.
--
-- 1. SOUND EFFECTS BECOME A PART KIND. They were going to live inside both
--    the voice part and the score part, which needed a rule for who is heard
--    when two contributors both noticed the same door, and still had a case
--    with no good answer: three voice parts selected, all three having added
--    the obvious effects, heard three times. As a kind of its own the reader
--    picks one effects part or none, exactly as they pick one score or none,
--    and two can no more be selected at once than two scores can.
--
--    It also makes effects findable work ("no effects yet" is a role in the
--    hub) and creditable (a part has an owner and a profile row; a corner of
--    someone else's part does not).
--
-- 2. A CUE IS RELATIVE TO THE CUE BEFORE IT. Today every one-shot on a page
--    fires at the page turn, so a page is a chord and never a conversation.
--    Two columns fix that, and they go on tracks because that is where the
--    author's script already lives.
--
-- see docs/design/CONTRIBUTION.md for the full reasoning.

-- --------------------------------------------------------- 1. sfx consent
-- A THIRD AXIS, not a reuse of music_consent. An author who is happy for
-- someone to score their comic has not thereby agreed to someone adding
-- gunshots to it. Same default as the other two: open, because the project
-- is collaboration and a closed default means nobody ever finds the switch.
alter table comics add column if not exists sfx_consent text not null default 'open';

do $$ begin
  alter table comics add constraint sfx_consent_values
    check (sfx_consent in ('open','closed'));
exception when duplicate_object then null; end $$;

-- ------------------------------------------------------- 1b. the sfx kind
-- a check constraint cannot be altered in place, so it is dropped and rebuilt.
-- the name is postgres's default for an inline check on this column.
do $$ begin
  alter table parts drop constraint if exists parts_kind_check;
exception when undefined_object then null; end $$;

alter table parts add constraint parts_kind_check
  check (kind in ('vo','soundtrack','sfx'));

-- character_key is already nullable and an effects part has no character, so
-- the existing vo_names_a_character check needs nothing: it only constrains
-- kind = 'vo'.

-- ------------------------------------------------- 1c. the gate learns three
-- this REPLACES the two-axis version in schema-parts.sql. the case was a
-- two-armed expression; a third arm and an else that refuses anything
-- unrecognised, so a typo in a kind fails closed rather than open.
create or replace function eski_part_allowed(cid uuid, k text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from comics c
    where c.id = cid
      and case k
            when 'vo'         then c.voice_consent
            when 'soundtrack' then c.music_consent
            when 'sfx'        then c.sfx_consent
            else 'closed'
          end = 'open'
  );
$$;

-- ---------------------------------------------------------- 2. cue linking
-- HOW A CUE IS TIMED AGAINST THE ONE BEFORE IT, in the same page, in
-- order_idx order.
--
--   after  start = prev.start + prev.duration      (ordinary back-and-forth)
--   with   start = prev.start                      (two at once, a crowd)
--   over   start = prev.start + prev.duration * pct/100   (an interruption)
--
-- 'after' is the default, so every row that exists today keeps behaving
-- exactly as it does today.
alter table tracks add column if not exists link text not null default 'after';

do $$ begin
  alter table tracks add constraint link_values check (link in ('after','with','over'));
exception when duplicate_object then null; end $$;

-- WHY A PERCENTAGE AND NOT MILLISECONDS. The audio does not exist when the
-- author writes this, and when it does exist there is more than one of it:
-- a line is voiced by however many people choose to, and their takes are
-- different lengths. An offset authored in ms against the first take is wrong
-- for every other take, and silently wrong — it does not error, it just stops
-- landing where it was written to land. A percentage is authored against the
-- LINE, which is text, which is the same for everybody, and the reader
-- resolves it at play time against whichever take is actually selected.
alter table tracks add column if not exists over_pct smallint;

do $$ begin
  alter table tracks add constraint over_pct_range
    check (over_pct is null or (over_pct between 1 and 99));
exception when duplicate_object then null; end $$;

-- a percentage only means something on an 'over', and 'over' is meaningless
-- without one. keeping the pair honest here means the reader's scheduler
-- never has to decide what a null means.
do $$ begin
  alter table tracks add constraint over_pct_needs_over
    check ((link = 'over') = (over_pct is not null));
exception when duplicate_object then null; end $$;

create index if not exists parts_kind_idx on parts (comic_id, kind) where status = 'published';

notify pgrst, 'reload schema';

-- ------------------------------------------------------------------ verify
-- three axes on comics, three kinds allowed on parts, two new columns on
-- tracks. the kinds row should read {vo,soundtrack,sfx}.
select 'consent axes' as check, string_agg(column_name, ', ' order by column_name) as found
from information_schema.columns
where table_schema = 'public' and table_name = 'comics'
  and column_name in ('voice_consent','music_consent','sfx_consent')
union all
select 'cue linking', string_agg(column_name, ', ' order by column_name)
from information_schema.columns
where table_schema = 'public' and table_name = 'tracks'
  and column_name in ('link','over_pct')
union all
select 'part kinds', pg_get_constraintdef(oid)
from pg_constraint where conname = 'parts_kind_check';
