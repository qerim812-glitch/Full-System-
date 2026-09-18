-- ============================================================================
-- 0015_rename_social_circle.sql
-- Product rename: NewPop → Social Circle.
--
-- The only place the old name reached the database is the user-facing
-- exception text in enforce_minimum_age(). 0013 and 0014 are already applied
-- on the live project and must not be edited, so the function is replaced
-- here instead. Idempotent — safe to re-run.
--
-- Nothing else changes: no table, column, policy or trigger is touched, and
-- the trigger created by 0013 keeps pointing at this same function name.
-- src/routes/register.tsx matches on /at least 18/i, not the brand name, so
-- the client message stays correct either way.
-- ============================================================================

create or replace function public.enforce_minimum_age()
returns trigger language plpgsql set search_path = ''
as $$
declare min_age constant integer := 18;
begin
  if new.date_of_birth is null then
    raise exception 'Date of birth is required';
  end if;
  if new.date_of_birth > current_date then
    raise exception 'Date of birth cannot be in the future';
  end if;
  if public.age_years(new.date_of_birth) < min_age then
    raise exception 'You must be at least % years old to use Social Circle', min_age
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
