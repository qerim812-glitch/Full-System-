  -- ============================================================================
  -- 0001_foundation.sql
  -- Extensions, shared helper functions, and the admin-role check.
  -- Run this FIRST. Everything else depends on it.
  -- ============================================================================

  create extension if not exists "pgcrypto";      -- gen_random_uuid()
  create extension if not exists "citext";        -- case-insensitive email

  -- ---------------------------------------------------------------------------
  -- is_admin()
  --
  -- Reads the role from app_metadata, NOT user_metadata.
  --
  -- This distinction is the whole ballgame: user_metadata is writable by the
  -- user through the client SDK, so a role stored there can be self-granted.
  -- app_metadata can only be written with the service-role key, i.e. by our
  -- server. Every admin policy in this schema goes through this function.
  -- ---------------------------------------------------------------------------
  create or replace function public.is_admin()
  returns boolean
  language sql
  stable
  security definer
  set search_path = ''
  as $$
    select coalesce(
      (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin',
      false
    );
  $$;

  comment on function public.is_admin() is
    'True when the caller''s JWT carries app_metadata.role = admin. Never reads user_metadata.';

  -- ---------------------------------------------------------------------------
  -- age_years(date) — current age from a date of birth.
  -- STABLE, not IMMUTABLE: the result changes as time passes, so it can never
  -- be used in a CHECK constraint or an index. Age rules live in triggers.
  -- ---------------------------------------------------------------------------
  create or replace function public.age_years(dob date)
  returns integer
  language sql
  stable
  set search_path = ''
  as $$
    select extract(year from age(current_date, dob))::integer;
  $$;

  -- ---------------------------------------------------------------------------
  -- touch_updated_at() — generic updated_at maintenance trigger.
  -- ---------------------------------------------------------------------------
  create or replace function public.touch_updated_at()
  returns trigger
  language plpgsql
  set search_path = ''
  as $$
  begin
    new.updated_at := now();
    return new;
  end;
  $$;
