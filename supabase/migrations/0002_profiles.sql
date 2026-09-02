-- ============================================================================
-- 0002_profiles.sql
-- One row per user, keyed to auth.users. Replaces the prototype's
-- `currentUser` object and the hardcoded 'USR-1003' id.
-- ============================================================================

create table public.profiles (
  id            uuid primary key references auth.users on delete cascade,
  email         citext not null,
  display_name  text,
  -- Stored as a DATE, deliberately. The prototype stored an age *string*
  -- ("25-30") in four buckets, while venues used entirely different buckets
  -- (16-24, 18-22, 21-30...). No string bucket can be compared against a
  -- venue's min_age, and a stored bucket silently goes stale as the user
  -- ages. A date is the only representation every bucket can be derived from.
  date_of_birth date not null,
  avatar_url    text,
  is_suspended  boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index profiles_email_idx on public.profiles (email);

create trigger profiles_touch_updated_at
  before update on public.profiles
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- MINIMUM AGE — 18+
--
-- ** THIS IS THE ONE PLACE TO CHANGE THE AGE POLICY. **
--
-- Set to 18 because NewPop shows a live per-venue age breakdown of who is
-- present AND offers private messaging between users. Mixing adults and
-- minors in that combination is a child-safety problem, and in the EU it
-- triggers parental-consent duties under GDPR Article 8.
--
-- Note the prototype contradicted itself here: venue 'Mulliri' declared
-- min_age 16, but the registration dropdown's lowest option was 18-24, so a
-- 16-year-old could never sign up anyway. Seed data resolves this to 18.
--
-- To admit 16-17s instead: lower MIN_AGE below, then add a guardian-consent
-- table and age-segregated direct messages. It is not a one-line change.
--
-- Implemented as a trigger, not a CHECK constraint: CHECK forbids
-- non-immutable functions, and any age rule depends on the current date.
-- ---------------------------------------------------------------------------
create or replace function public.enforce_minimum_age()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  min_age constant integer := 18;
begin
  if new.date_of_birth is null then
    raise exception 'Date of birth is required';
  end if;

  if new.date_of_birth > current_date then
    raise exception 'Date of birth cannot be in the future';
  end if;

  if public.age_years(new.date_of_birth) < min_age then
    raise exception 'You must be at least % years old to use NewPop', min_age
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

create trigger profiles_enforce_minimum_age
  before insert or update of date_of_birth on public.profiles
  for each row execute function public.enforce_minimum_age();

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;

create policy "profiles: read own"
  on public.profiles for select
  using (auth.uid() = id);

create policy "profiles: update own"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

create policy "profiles: insert own"
  on public.profiles for insert
  with check (auth.uid() = id);

create policy "profiles: admin reads all"
  on public.profiles for select
  using (public.is_admin());

create policy "profiles: admin updates all"
  on public.profiles for update
  using (public.is_admin());

-- ---------------------------------------------------------------------------
-- Auto-create a profile when a user signs up.
--
-- Expects date_of_birth and display_name to be passed in the signup payload's
-- options.data, which lands in raw_user_meta_data. A signup without a valid
-- date_of_birth is rejected here, which is what keeps the age rule
-- unavoidable rather than merely encouraged.
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, display_name, date_of_birth)
  values (
    new.id,
    new.email,
    nullif(new.raw_user_meta_data ->> 'display_name', ''),
    (new.raw_user_meta_data ->> 'date_of_birth')::date
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
