-- =====================================================================
-- Samuka site · feature-use analytics
--   Lets assets/js/analytics.js record which features get used
--   (SamukaTrack: "tour:done", "feeds:open", "challenge:send:gems",
--   "recap:shown", "settings:calm:on", "streak:dot-click", ...) as a new
--   kind 'use' in public.analytics_events, and adds them to the owner's
--   analytics summary (admin panel → analytics → "features used").
--   Same privacy rules as the rest of analytics_events: a short name, the
--   page path and a random per-tab id. No account ids, IPs or cookies.
-- Run AFTER hub.sql (which creates analytics_events), in
-- Supabase → SQL Editor → Run. Safe to re-run (keeps existing data).
-- Until it runs, feature uses are refused by the old check and dropped;
-- page views are sent separately and are not affected.
-- =====================================================================

alter table public.analytics_events drop constraint if exists analytics_events_kind_check;
alter table public.analytics_events add constraint analytics_events_kind_check
  check (kind in ('view', 'section', 'play', 'use'));

-- the same summary as hub.sql, plus 'uses'
create or replace function public.analytics_summary(p_days int default 30) returns json
language plpgsql stable security definer set search_path = public as $$
declare since timestamptz := now() - make_interval(days => least(greatest(p_days, 1), 180));
begin
  if public.my_role() is distinct from 'samuka' then raise exception 'not allowed'; end if;
  return json_build_object(
    'days', (select coalesce(json_agg(d order by d.day), '[]') from (
        select date_trunc('day', created_at)::date as day, count(*) filter (where kind = 'view') as views, count(distinct sid) as visitors
          from public.analytics_events where created_at >= since group by 1) d),
    'pages', (select coalesce(json_agg(p), '[]') from (
        select path, count(*) as views from public.analytics_events where kind = 'view' and created_at >= since group by path order by 2 desc limit 10) p),
    'sections', (select coalesce(json_agg(s), '[]') from (
        select detail as name, count(*) as reads from public.analytics_events where kind = 'section' and created_at >= since group by detail order by 2 desc limit 12) s),
    'referrers', (select coalesce(json_agg(r), '[]') from (
        select coalesce(nullif(referrer, ''), 'direct') as host, count(distinct sid) as visitors from public.analytics_events where kind = 'view' and created_at >= since group by 1 order by 2 desc limit 10) r),
    'plays', (select coalesce(json_agg(g), '[]') from (
        select detail as game, count(*) as plays from public.analytics_events where kind = 'play' and created_at >= since group by detail order by 2 desc) g),
    'uses', (select coalesce(json_agg(u), '[]') from (
        select detail as name, count(*) as uses, count(distinct sid) as visits from public.analytics_events where kind = 'use' and created_at >= since group by detail order by 2 desc limit 30) u),
    'totals', (select json_build_object('views', count(*) filter (where kind = 'view'), 'visitors', count(distinct sid)) from public.analytics_events where created_at >= since)
  );
end $$;
revoke all on function public.analytics_summary(int) from public, anon;
grant execute on function public.analytics_summary(int) to authenticated;
