-- ============================================================================
-- 0007_moderation.sql
-- Reports queue and the admin audit log.
--
-- The prototype let users file a report (handleReportSubmit) but there was
-- nowhere for it to go and no way for an admin to act on one.
-- ============================================================================

create table public.reports (
  id                uuid primary key default gen_random_uuid(),
  reporter_id       uuid not null references auth.users on delete cascade,
  reported_user_id  uuid references auth.users on delete set null,
  venue_slug        text references public.venues on delete set null,
  reason            text not null check (reason in (
                      'inappropriate_behavior',
                      'spam',
                      'harassment',
                      'fake_profile',
                      'safety_concern',
                      'other'
                    )),
  description       text check (char_length(description) <= 4000),
  status            text not null default 'open'
                      check (status in ('open', 'reviewing', 'actioned', 'dismissed')),
  resolved_by       uuid references auth.users on delete set null,
  resolved_at       timestamptz,
  resolution_note   text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint reports_has_subject check (
    reported_user_id is not null or venue_slug is not null
  )
);

create index reports_queue_idx on public.reports (status, created_at)
  where status in ('open', 'reviewing');

create trigger reports_touch_updated_at
  before update on public.reports
  for each row execute function public.touch_updated_at();

alter table public.reports enable row level security;

-- A reporter sees their own reports and their status, but never anyone
-- else's, and never the resolution notes of others.
create policy "reports: read own"
  on public.reports for select
  using (auth.uid() = reporter_id);

create policy "reports: file own"
  on public.reports for insert
  with check (
    auth.uid() = reporter_id
    and (reported_user_id is null or reported_user_id <> auth.uid())
  );

create policy "reports: admin reads all"
  on public.reports for select
  using (public.is_admin());

create policy "reports: admin resolves"
  on public.reports for update
  using (public.is_admin())
  with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- Audit log. Append-only: no update or delete policy exists for anyone,
-- including admins. An audit trail an admin can edit is not an audit trail.
-- Replaces the socialCircleActivity localStorage key.
-- ---------------------------------------------------------------------------
create table public.audit_log (
  id          bigserial primary key,
  actor_id    uuid references auth.users on delete set null,
  action      text not null,
  target_type text,
  target_id   text,
  detail      jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

create index audit_log_actor_idx on public.audit_log (actor_id, created_at desc);
create index audit_log_target_idx on public.audit_log (target_type, target_id);

alter table public.audit_log enable row level security;

create policy "audit: read own actions"
  on public.audit_log for select
  using (auth.uid() = actor_id);

create policy "audit: admin reads all"
  on public.audit_log for select
  using (public.is_admin());

create policy "audit: append own"
  on public.audit_log for insert
  with check (auth.uid() = actor_id);
