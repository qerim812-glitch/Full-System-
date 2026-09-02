-- ============================================================================
-- 0008_donations.sql
-- Donation records. The prototype's donations.html only copied bank details
-- to the clipboard, so nothing was ever recorded.
--
-- This table works for the current manual bank-transfer flow (an admin marks
-- a transfer received) and is already shaped for a payment provider later:
-- provider_ref carries the external id, and its uniqueness is what makes a
-- replayed webhook idempotent instead of double-counting.
-- ============================================================================

create table public.donations (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid references auth.users on delete set null,
  donor_email   citext,
  amount_minor  bigint  not null check (amount_minor > 0),
  currency      text not null default 'ALL' check (char_length(currency) = 3),
  method        text not null default 'bank_transfer'
                  check (method in ('bank_transfer', 'card', 'other')),
  status        text not null default 'pending'
                  check (status in ('pending', 'confirmed', 'failed', 'refunded')),
  provider_ref  text,
  message       text check (char_length(message) <= 1000),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  -- Idempotency: one row per external payment reference.
  constraint donations_provider_ref_unique unique (provider_ref)
);

comment on column public.donations.amount_minor is
  'Amount in minor units (qindarka for ALL, cents for EUR). Never a float: '
  'binary floating point cannot represent decimal money exactly.';

create index donations_user_idx on public.donations (user_id, created_at desc);
create index donations_status_idx on public.donations (status, created_at desc);

create trigger donations_touch_updated_at
  before update on public.donations
  for each row execute function public.touch_updated_at();

alter table public.donations enable row level security;

create policy "donations: read own"
  on public.donations for select
  using (auth.uid() = user_id);

create policy "donations: declare own"
  on public.donations for insert
  with check (auth.uid() = user_id and status = 'pending');

-- Only an admin (or a server-side webhook using the service-role key, which
-- bypasses RLS entirely) may confirm that money actually arrived.
create policy "donations: admin manages"
  on public.donations for all
  using (public.is_admin())
  with check (public.is_admin());
