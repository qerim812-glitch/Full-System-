-- Shared helpers for the pgTAP suites. Not a test file itself.
--
-- `supabase test db` runs each *.sql in supabase/tests inside its own
-- transaction and rolls it back, so fixtures created here never persist.

-- Act as a given member for subsequent statements.
create or replace function tests.act_as(p_id uuid) returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', p_id::text, true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_id, 'app_metadata', json_build_object())::text, true);
  perform set_config('role', 'authenticated', true);
end $$;

create or replace function tests.act_as_admin(p_id uuid) returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', p_id::text, true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_id,
      'app_metadata', json_build_object('role', 'admin'))::text, true);
  perform set_config('role', 'authenticated', true);
end $$;

-- Runs a statement and reports whether it was refused. Used instead of
-- throws_ok() where the exact message is not the point — only that RLS or a
-- guard said no.
create or replace function tests.refused(p_sql text) returns boolean
language plpgsql as $$
begin
  execute p_sql;
  return false;
exception when others then
  return true;
end $$;

-- The helpers are called while acting as `authenticated`, so that role needs
-- to reach them. Without this every assertion fails with "permission denied
-- for schema tests" rather than testing anything.
grant usage on schema tests to authenticated, anon;
grant execute on all functions in schema tests to authenticated, anon;
