-- The Forge Project — unified schema
-- Every platform service normalizes its API response into these tables.
-- UI reads only from here, never live from platform APIs.

create table users (
  id uuid primary key default gen_random_uuid(),
  display_name text not null,
  created_at timestamptz default now()
);

-- One row per platform a user has linked (steam, riot, battlenet...)
create table linked_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete cascade,
  platform text not null,              -- 'steam' | 'riot' | 'battlenet'
  platform_user_id text not null,      -- steamid64, riot puuid, battletag, etc.
  access_token text,
  refresh_token text,
  token_expires_at timestamptz,
  last_synced_at timestamptz,
  unique (user_id, platform)
);

-- Normalized game library entry, regardless of source platform
create table games (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete cascade,
  platform text not null,
  platform_game_id text,               -- null if manually added (e.g. Epic)
  title text not null,
  playtime_minutes int default 0,
  last_played_at timestamptz,
  is_manual_entry boolean default false,
  updated_at timestamptz default now(),
  -- Lets a platform sync re-run as an upsert (update playtime) instead of
  -- inserting duplicate rows. Manual entries (Epic etc.) have no
  -- platform_game_id, so this constraint only meaningfully applies to
  -- platform-synced rows.
  unique (user_id, platform, platform_game_id)
);

-- Unified milestone/achievement feed — this is the core "showcase" feature
create table milestones (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete cascade,
  game_id uuid references games(id) on delete cascade,
  title text not null,                 -- 'Reached Diamond', '100% Achievements'
  description text,
  achieved_at timestamptz not null,
  rarity_pct numeric,                  -- % of players who have this, if platform provides it
  created_at timestamptz default now()
);

create index on games (user_id);
create index on milestones (user_id, achieved_at desc);

-- ===== Groups model: Friends / Guilds / LFG =====
-- Three lifecycles, three shapes. Do not merge into one generic "groups"
-- table — friends are a relationship, guilds are persistent, LFG is
-- ephemeral. Forcing them into one schema makes all three worse.

-- Friends: a relationship, not a group. request/accept flow.
create table friendships (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid references users(id) on delete cascade,
  addressee_id uuid references users(id) on delete cascade,
  status text not null default 'pending',  -- 'pending' | 'accepted' | 'blocked'
  created_at timestamptz default now(),
  unique (requester_id, addressee_id)
);

-- Guilds: persistent, Forge-native only (no external platform sync).
create table guilds (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  created_by uuid references users(id),
  created_at timestamptz default now()
);

create table guild_members (
  guild_id uuid references guilds(id) on delete cascade,
  user_id uuid references users(id) on delete cascade,
  role text not null default 'member',   -- 'leader' | 'officer' | 'member'
  joined_at timestamptz default now(),
  primary key (guild_id, user_id)
);

-- LFG/LFM: ephemeral. No expiry job needed — closes on fill, checked at join time.
-- post_type distinguishes the two:
--   'LFG' (looking for group) — a solo player asking to join. No player count.
--   'LFM' (looking for more) — a group posting an open slot count.
create table lfg_posts (
  id uuid primary key default gen_random_uuid(),
  created_by uuid references users(id),
  post_type text not null,               -- 'LFG' | 'LFM'
  game_title text not null,
  platform text,
  description text,
  players_needed int,                    -- required for LFM, null for LFG
  status text not null default 'open',   -- 'open' | 'closed' — set 'closed' when full
  created_at timestamptz default now(),
  constraint lfm_requires_count check (
    (post_type = 'LFM' and players_needed is not null)
    or (post_type = 'LFG' and players_needed is null)
  )
);

create table lfg_members (
  lfg_post_id uuid references lfg_posts(id) on delete cascade,
  user_id uuid references users(id) on delete cascade,
  joined_at timestamptz default now(),
  primary key (lfg_post_id, user_id)
);
-- App-layer rule (enforce in service code or a trigger): for LFM posts,
-- when count of lfg_members reaches players_needed, set status = 'closed'.
-- LFG posts close manually (creator found a group) since there's no count.

-- Chat: DMs and guild channels share one shape. LFG posts can reuse
-- guild-style channels keyed by lfg_post_id if in-app coordination chat
-- is wanted later — not required for v1.
create table channels (
  id uuid primary key default gen_random_uuid(),
  kind text not null,                    -- 'dm' | 'guild'
  guild_id uuid references guilds(id) on delete cascade,  -- null for dm
  created_at timestamptz default now()
);

create table channel_members (
  channel_id uuid references channels(id) on delete cascade,
  user_id uuid references users(id) on delete cascade,
  primary key (channel_id, user_id)
);

create table messages (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid references channels(id) on delete cascade,
  sender_id uuid references users(id),
  body text not null,
  created_at timestamptz default now()
);

-- Comments on feed milestones — lightweight, not a full thread system.
create table milestone_comments (
  id uuid primary key default gen_random_uuid(),
  milestone_id uuid references milestones(id) on delete cascade,
  user_id uuid references users(id),
  body text not null,
  created_at timestamptz default now()
);

-- Commendations: reputation signal. Positive-only, by design — no negative
-- counterpart, which removes the brigading/stat-shaming vector that peer
-- rating systems like Overwatch endorsements are prone to. Permanent and
-- cumulative (no decay) — a running badge of honor, not a decaying score.
-- Gated at the app layer: only commendable if from_user and to_user shared
-- a closed LFG/LFM post together, or are in the same guild. context_lfg_post_id
-- ties a commendation to the session that earned it when applicable; for
-- guild-based commendations (no specific session) it's null and the app
-- layer should apply a cooldown (e.g. once per person per week) to prevent
-- spam between guildmates — not enforced here as a DB constraint.
-- Cap: max 2 categories per (from_user, to_user, context_lfg_post_id) per
-- session — the unique constraint below allows up to 4 (one per category),
-- so the 2-max needs enforcing in service code or a trigger, not here.
create table commendations (
  id uuid primary key default gen_random_uuid(),
  from_user_id uuid references users(id) on delete cascade,
  to_user_id uuid references users(id) on delete cascade,
  category text not null,   -- 'good_teammate' | 'great_strategist' | 'good_sport' | 'helpful'
  context_lfg_post_id uuid references lfg_posts(id),
  created_at timestamptz default now(),
  unique (from_user_id, to_user_id, category, context_lfg_post_id)
);

create index on commendations (to_user_id, category);

create index on friendships (addressee_id, status);
create index on guild_members (user_id);
create index on lfg_posts (status, game_title);
create index on messages (channel_id, created_at);

-- ===== Real Supabase Auth (email/password) =====
-- auth.users (Supabase Auth's own table) is separate from this project's
-- public.users (schema.sql:5-9, holds display_name and is what games.user_id
-- etc. actually reference). This trigger keeps them in sync: every signup
-- automatically gets a matching public.users row, so the client never has
-- to (and can't forget to, or do it inconsistently).
create function handle_new_user()
returns trigger as $$
begin
  insert into public.users (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', new.email));
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure handle_new_user();

-- Supabase enables row-level security by default on new public-schema
-- tables, but no policies exist yet — every insert/select gets blocked with
-- "new row violates row-level security policy" until a policy is added.
-- Scoped to the signed-in user's own rows now that real auth exists.
alter table games enable row level security;
create policy "users can manage their own games" on games
  for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Supabase enables RLS by default but no policies existed on `users` until
-- now — see PROJECT_CONTEXT_FORGE.md "Known limitations" (this closes that
-- gap). display_name/created_at are non-sensitive, so read access is open
-- to any authenticated user (needed for friends/guilds/LFG rosters, none of
-- which are built yet but will read other users' rows). Writes stay
-- self-only. No insert policy: handle_new_user (security definer) is the
-- only insert path by design. No delete policy: no delete flow exists.
alter table users enable row level security;

create policy "authenticated users can read any profile" on users
  for select
  to authenticated
  using (true);

create policy "users can update their own profile" on users
  for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);
