-- ============================================================================
-- 0022_posts.sql
-- Posts, stories, likes and comments — the feed becomes something members
-- write to, not only a view over meetups and check-ins.
-- Idempotent — safe to re-run. Run after 0021.
--
-- Three kinds of row share one table:
--   post     — text and/or a photo, optionally tagged with a venue or meetup.
--   story    — a photo with a caption that disappears after 24 hours
--              (expires_at is set; the read policy hides it after that).
--   checkin  — written by a trigger when a member checks in somewhere, so
--              "I'm at Radio Bar tonight" shows up in the feed without a
--              second action. Members cannot insert this kind directly.
--
-- Counters (like_count, comment_count) are maintained by triggers and pinned
-- to zero on insert, so nobody can post with a thousand likes attached.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. TABLES
-- ----------------------------------------------------------------------------
create table if not exists public.posts (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users on delete cascade,
  kind          text not null default 'post'
                  check (kind in ('post','story','checkin')),
  body          text check (char_length(body) <= 1000),
  photo_url     text check (char_length(photo_url) <= 600),
  venue_slug    text references public.venues on delete set null,
  meetup_id     uuid references public.meetups on delete set null,
  expires_at    timestamptz,
  is_hidden     boolean not null default false,
  like_count    integer not null default 0 check (like_count >= 0),
  comment_count integer not null default 0 check (comment_count >= 0),
  created_at    timestamptz not null default now(),
  -- A post is text, a photo, or both. A check-in carries its venue instead.
  constraint posts_has_content check (
    kind = 'checkin' or nullif(btrim(body), '') is not null or photo_url is not null
  ),
  -- Stories expire; nothing else does.
  constraint posts_story_expires check ((kind = 'story') = (expires_at is not null)),
  constraint posts_story_has_photo check (kind <> 'story' or photo_url is not null)
);

create index if not exists posts_feed_idx
  on public.posts (created_at desc) where is_hidden = false;
create index if not exists posts_author_idx
  on public.posts (user_id, created_at desc);
create index if not exists posts_venue_idx
  on public.posts (venue_slug, created_at desc) where venue_slug is not null;
create index if not exists posts_stories_idx
  on public.posts (expires_at) where kind = 'story';

create table if not exists public.post_likes (
  post_id    uuid not null references public.posts on delete cascade,
  user_id    uuid not null references auth.users on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);
create index if not exists post_likes_user_idx on public.post_likes (user_id);

create table if not exists public.post_comments (
  id         uuid primary key default gen_random_uuid(),
  post_id    uuid not null references public.posts on delete cascade,
  user_id    uuid not null references auth.users on delete cascade,
  body       text not null check (char_length(btrim(body)) between 1 and 500),
  is_hidden  boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists post_comments_post_idx
  on public.post_comments (post_id, created_at);

-- ----------------------------------------------------------------------------
-- 2. ROW LEVEL SECURITY
-- ----------------------------------------------------------------------------
alter table public.posts         enable row level security;
alter table public.post_likes    enable row level security;
alter table public.post_comments enable row level security;

grant select, insert, delete on public.posts         to authenticated;
grant select, insert, delete on public.post_likes    to authenticated;
grant select, insert, delete on public.post_comments to authenticated;

-- Visible when: not hidden by a moderator, the author is not suspended,
-- neither side has blocked the other, and (for stories) not yet expired —
-- except to its own author, who should still see what they posted.
create or replace function public.can_view_post(p_post public.posts)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select auth.uid() is not null
     and (
       public.is_admin()
       or (
         p_post.is_hidden = false
         and not public.is_blocked_between(auth.uid(), p_post.user_id)
         and exists (
           select 1 from public.profiles pr
           where pr.id = p_post.user_id and pr.is_suspended = false
         )
         and (p_post.expires_at is null
              or p_post.expires_at > now()
              or p_post.user_id = auth.uid())
       )
     );
$$;
revoke execute on function public.can_view_post(public.posts) from public;
grant  execute on function public.can_view_post(public.posts) to authenticated;

drop policy if exists "posts: read visible" on public.posts;
create policy "posts: read visible" on public.posts
for select to authenticated
using (public.can_view_post(posts));

drop policy if exists "posts: write own" on public.posts;
create policy "posts: write own" on public.posts
for insert to authenticated
with check (
  user_id = auth.uid()
  -- 'checkin' rows come from the trigger below, never from a member.
  and kind in ('post','story')
  and is_hidden = false
  and like_count = 0 and comment_count = 0
  and exists (
    select 1 from public.profiles p where p.id = auth.uid() and p.is_suspended = false
  )
);

drop policy if exists "posts: delete own" on public.posts;
create policy "posts: delete own" on public.posts
for delete to authenticated
using (user_id = auth.uid());

drop policy if exists "posts: admin moderates" on public.posts;
create policy "posts: admin moderates" on public.posts
for all to authenticated
using (public.is_admin()) with check (public.is_admin());

-- Likes: anyone who can see the post may like it, once (the primary key).
drop policy if exists "post_likes: read" on public.post_likes;
create policy "post_likes: read" on public.post_likes
for select to authenticated
using (exists (select 1 from public.posts p where p.id = post_id));

drop policy if exists "post_likes: like own" on public.post_likes;
create policy "post_likes: like own" on public.post_likes
for insert to authenticated
with check (
  user_id = auth.uid()
  and exists (select 1 from public.posts p where p.id = post_id)
);

drop policy if exists "post_likes: unlike own" on public.post_likes;
create policy "post_likes: unlike own" on public.post_likes
for delete to authenticated
using (user_id = auth.uid());

-- Comments: same visibility as the post, plus the block and hidden rules.
drop policy if exists "post_comments: read" on public.post_comments;
create policy "post_comments: read" on public.post_comments
for select to authenticated
using (
  public.is_admin()
  or (
    is_hidden = false
    and not public.is_blocked_between(auth.uid(), user_id)
    and exists (select 1 from public.posts p where p.id = post_id)
  )
);

drop policy if exists "post_comments: write own" on public.post_comments;
create policy "post_comments: write own" on public.post_comments
for insert to authenticated
with check (
  user_id = auth.uid()
  and is_hidden = false
  and exists (select 1 from public.posts p where p.id = post_id)
  and exists (
    select 1 from public.profiles p where p.id = auth.uid() and p.is_suspended = false
  )
);

drop policy if exists "post_comments: delete own" on public.post_comments;
create policy "post_comments: delete own" on public.post_comments
for delete to authenticated
using (user_id = auth.uid());

drop policy if exists "post_comments: admin moderates" on public.post_comments;
create policy "post_comments: admin moderates" on public.post_comments
for all to authenticated
using (public.is_admin()) with check (public.is_admin());

-- ----------------------------------------------------------------------------
-- 3. COUNTERS — security definer, because a member has no UPDATE on posts
-- ----------------------------------------------------------------------------
create or replace function public.bump_post_like_count()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    update public.posts set like_count = like_count + 1 where id = new.post_id;
    return new;
  else
    update public.posts set like_count = greatest(like_count - 1, 0) where id = old.post_id;
    return old;
  end if;
end;
$$;
drop trigger if exists post_likes_count on public.post_likes;
create trigger post_likes_count
  after insert or delete on public.post_likes
  for each row execute function public.bump_post_like_count();

create or replace function public.bump_post_comment_count()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    update public.posts set comment_count = comment_count + 1 where id = new.post_id;
    return new;
  else
    update public.posts set comment_count = greatest(comment_count - 1, 0) where id = old.post_id;
    return old;
  end if;
end;
$$;
drop trigger if exists post_comments_count on public.post_comments;
create trigger post_comments_count
  after insert or delete on public.post_comments
  for each row execute function public.bump_post_comment_count();

-- ----------------------------------------------------------------------------
-- 4. NOTIFICATIONS — extend the kind whitelist, then notify on like/comment
-- ----------------------------------------------------------------------------
do $$ begin
  alter table public.notifications drop constraint if exists notifications_kind_check;
  alter table public.notifications add constraint notifications_kind_check check (kind in (
    'connection_request','connection_accepted','booking_updated',
    'connection_checkin','review_hidden','system',
    'meetup_join_request','meetup_approved','meetup_declined',
    'meetup_joined','meetup_cancelled',
    'post_like','post_comment'
  ));
end; $$;

create or replace function public.notify_post_like()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare v_author uuid;
begin
  select user_id into v_author from public.posts where id = new.post_id;
  -- Liking your own post is allowed but not news.
  if v_author is null or v_author = new.user_id then return new; end if;
  insert into public.notifications (user_id, kind, title, body, link)
  values (
    v_author, 'post_like',
    public.member_name(new.user_id) || ' liked your post',
    null,
    '/posts/' || new.post_id
  );
  return new;
end;
$$;
drop trigger if exists post_likes_notify on public.post_likes;
create trigger post_likes_notify
  after insert on public.post_likes
  for each row execute function public.notify_post_like();

create or replace function public.notify_post_comment()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare v_author uuid;
begin
  select user_id into v_author from public.posts where id = new.post_id;
  if v_author is null or v_author = new.user_id then return new; end if;
  insert into public.notifications (user_id, kind, title, body, link)
  values (
    v_author, 'post_comment',
    public.member_name(new.user_id) || ' commented on your post',
    left(new.body, 140),
    '/posts/' || new.post_id
  );
  return new;
end;
$$;
drop trigger if exists post_comments_notify on public.post_comments;
create trigger post_comments_notify
  after insert on public.post_comments
  for each row execute function public.notify_post_comment();

-- ----------------------------------------------------------------------------
-- 5. CHECK-IN POSTS — a check-in writes itself into the feed
-- ----------------------------------------------------------------------------
create or replace function public.post_from_checkin()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.posts (user_id, kind, body, venue_slug)
  values (new.user_id, 'checkin', nullif(btrim(new.note), ''), new.venue_slug);
  return new;
end;
$$;
drop trigger if exists presence_post_to_feed on public.presence_checkins;
create trigger presence_post_to_feed
  after insert on public.presence_checkins
  for each row execute function public.post_from_checkin();

-- ----------------------------------------------------------------------------
-- 6. REPORTS — posts and comments can be reported
-- ----------------------------------------------------------------------------
do $$ begin
  alter table public.reports drop constraint if exists reports_target_kind_check;
  alter table public.reports add constraint reports_target_kind_check check (
    target_kind in ('chat_message','direct_message','review','profile','venue',
                    'post','post_comment')
  );
end; $$;

-- ----------------------------------------------------------------------------
-- 7. STORAGE — post photos (public read, owner-scoped writes, 5 MB)
-- ----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('post-photos', 'post-photos', true, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update
  set public = true,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "post-photos: public read"  on storage.objects;
drop policy if exists "post-photos: owner insert" on storage.objects;
drop policy if exists "post-photos: owner delete" on storage.objects;

create policy "post-photos: public read" on storage.objects for select
  using (bucket_id = 'post-photos');
create policy "post-photos: owner insert" on storage.objects for insert
  with check (bucket_id = 'post-photos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "post-photos: owner delete" on storage.objects for delete
  using (bucket_id = 'post-photos' and (storage.foldername(name))[1] = auth.uid()::text);
