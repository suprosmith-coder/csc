-- =========================================================
--  DEVIT — Supabase SQL Setup
--  Run this in your Supabase SQL Editor:
--  https://supabase.com/dashboard/project/nynrocdgmowjgslgfdmc/sql
-- =========================================================

-- PROFILES
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique not null,
  display_name text not null default '',
  email text,
  bio text default '',
  avatar_url text default '',
  is_verified boolean default false,
  is_admin boolean default false,
  follower_count int default 0,
  following_count int default 0,
  post_count int default 0,
  xp int default 0,
  github_url text default '',
  website_url text default '',
  created_at timestamptz default now()
);

-- POSTS
create table if not exists posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references profiles(id) on delete cascade,
  content text not null,
  parent_id uuid references posts(id) on delete cascade,
  like_count int default 0,
  reply_count int default 0,
  repost_count int default 0,
  created_at timestamptz default now()
);

-- LIKES
create table if not exists likes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  post_id uuid not null references posts(id) on delete cascade,
  created_at timestamptz default now(),
  unique(user_id, post_id)
);

-- REPOSTS
create table if not exists reposts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  post_id uuid not null references posts(id) on delete cascade,
  created_at timestamptz default now(),
  unique(user_id, post_id)
);

-- FOLLOWS
create table if not exists follows (
  id uuid primary key default gen_random_uuid(),
  follower_id uuid not null references profiles(id) on delete cascade,
  following_id uuid not null references profiles(id) on delete cascade,
  created_at timestamptz default now(),
  unique(follower_id, following_id)
);

-- NOTIFICATIONS
create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  actor_id uuid not null references profiles(id) on delete cascade,
  type text not null, -- 'like', 'reply', 'follow', 'repost'
  post_id uuid references posts(id) on delete cascade,
  read boolean default false,
  created_at timestamptz default now()
);

-- TAGS
create table if not exists tags (
  name text primary key,
  post_count int default 1,
  created_at timestamptz default now()
);

-- =========================================================
--  RPC FUNCTIONS (counter helpers)
-- =========================================================

create or replace function increment_like(post_id uuid)
returns void language sql as $$
  update posts set like_count = like_count + 1 where id = post_id;
$$;

create or replace function decrement_like(post_id uuid)
returns void language sql as $$
  update posts set like_count = greatest(like_count - 1, 0) where id = post_id;
$$;

create or replace function increment_repost(post_id uuid)
returns void language sql as $$
  update posts set repost_count = repost_count + 1 where id = post_id;
$$;

create or replace function decrement_repost(post_id uuid)
returns void language sql as $$
  update posts set repost_count = greatest(repost_count - 1, 0) where id = post_id;
$$;

create or replace function increment_reply(post_id uuid)
returns void language sql as $$
  update posts set reply_count = reply_count + 1 where id = post_id;
$$;

create or replace function increment_follower(user_id uuid)
returns void language sql as $$
  update profiles set follower_count = follower_count + 1 where id = user_id;
$$;

create or replace function decrement_follower(user_id uuid)
returns void language sql as $$
  update profiles set follower_count = greatest(follower_count - 1, 0) where id = user_id;
$$;

create or replace function increment_following(user_id uuid)
returns void language sql as $$
  update profiles set following_count = following_count + 1 where id = user_id;
$$;

create or replace function decrement_following(user_id uuid)
returns void language sql as $$
  update profiles set following_count = greatest(following_count - 1, 0) where id = user_id;
$$;

create or replace function increment_tag(tag_name text)
returns void language sql as $$
  update tags set post_count = post_count + 1 where name = tag_name;
$$;

create or replace function add_xp(user_id uuid, amount int)
returns void language sql as $$
  update profiles set xp = xp + amount where id = user_id;
$$;

-- =========================================================
--  ROW LEVEL SECURITY
-- =========================================================

alter table profiles enable row level security;
alter table posts enable row level security;
alter table likes enable row level security;
alter table reposts enable row level security;
alter table follows enable row level security;
alter table notifications enable row level security;
alter table tags enable row level security;

-- Profiles: anyone can read, only owner can write
create policy "profiles_read" on profiles for select using (true);
create policy "profiles_insert" on profiles for insert with check (auth.uid() = id);
create policy "profiles_update" on profiles for update using (auth.uid() = id);

-- Posts: anyone reads, auth users create/delete own
create policy "posts_read" on posts for select using (true);
create policy "posts_insert" on posts for insert with check (auth.uid() = author_id);
create policy "posts_delete" on posts for delete using (auth.uid() = author_id);

-- Likes
create policy "likes_read" on likes for select using (true);
create policy "likes_insert" on likes for insert with check (auth.uid() = user_id);
create policy "likes_delete" on likes for delete using (auth.uid() = user_id);

-- Reposts
create policy "reposts_read" on reposts for select using (true);
create policy "reposts_insert" on reposts for insert with check (auth.uid() = user_id);
create policy "reposts_delete" on reposts for delete using (auth.uid() = user_id);

-- Follows
create policy "follows_read" on follows for select using (true);
create policy "follows_insert" on follows for insert with check (auth.uid() = follower_id);
create policy "follows_delete" on follows for delete using (auth.uid() = follower_id);

-- Notifications: only read your own
create policy "notif_read" on notifications for select using (auth.uid() = user_id);
create policy "notif_insert" on notifications for insert with check (auth.uid() = actor_id);
create policy "notif_update" on notifications for update using (auth.uid() = user_id);

-- Tags: anyone reads, auth users insert
create policy "tags_read" on tags for select using (true);
create policy "tags_insert" on tags for insert with check (auth.uid() is not null);
create policy "tags_update" on tags for update using (auth.uid() is not null);
