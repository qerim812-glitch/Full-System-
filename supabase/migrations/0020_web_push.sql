-- ============================================================================
-- 0020_web_push.sql
-- Web Push subscriptions and the delivery bookkeeping for them.
-- Idempotent — safe to re-run. Run after 0019.
--
-- The app already writes `notifications` rows from database triggers. Those
-- only light up the bell when the member happens to have the tab open, which
-- for "your meetup starts in an hour" or "someone asked to join" is exactly
-- when they are not looking. Web Push reaches them anyway.
--
-- HOW DELIVERY WORKS: notifications are created inside Postgres, so no
-- application code sees them happen. Rather than teach every trigger to call
-- out to the network, each notification carries `pushed_at`, and a dispatcher
-- (POST /api/push-dispatch, called on a schedule) picks up the ones that are
-- still null. That keeps the triggers pure and makes delivery retryable.
-- ============================================================================

create table if not exists public.push_subscriptions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users on delete cascade,
  -- The browser's endpoint URL. Unique because re-subscribing on the same
  -- device returns the same endpoint, and two rows would mean two pushes.
  endpoint   text not null unique,
  p256dh     text not null,
  auth       text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  -- Set when a push is rejected as gone (404/410) so dead devices stop being
  -- retried forever.
  failed_at  timestamptz
);

create index if not exists push_subscriptions_user_idx
  on public.push_subscriptions (user_id) where failed_at is null;

alter table public.push_subscriptions enable row level security;
grant select, insert, delete on public.push_subscriptions to authenticated;

drop policy if exists "push: manage own" on public.push_subscriptions;
create policy "push: manage own" on public.push_subscriptions
for select to authenticated using (user_id = auth.uid());

drop policy if exists "push: subscribe own" on public.push_subscriptions;
create policy "push: subscribe own" on public.push_subscriptions
for insert to authenticated with check (user_id = auth.uid());

drop policy if exists "push: unsubscribe own" on public.push_subscriptions;
create policy "push: unsubscribe own" on public.push_subscriptions
for delete to authenticated using (user_id = auth.uid());

-- Delivery bookkeeping on the existing notifications table.
alter table public.notifications
  add column if not exists pushed_at timestamptz;

-- Partial index: the dispatcher only ever asks for the unsent ones, and this
-- keeps that query cheap however large the table grows.
create index if not exists notifications_unpushed_idx
  on public.notifications (created_at) where pushed_at is null;

comment on column public.notifications.pushed_at is
  'When a Web Push for this notification was dispatched. NULL = still queued. Written only by the service role, from /api/push-dispatch.';
