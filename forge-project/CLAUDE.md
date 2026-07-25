# The Forge Project

Unified cross-platform gamer identity app. One profile, one activity feed, one
library view — aggregated from Steam, Riot, Battle.net (Discord presence is
phase 2, see caveat below). Desktop app, not a web app.

## Stack (decided — flag before changing)
- Shell: Electron + Vite + React (renderer)
- Backend/DB/Auth: Supabase (Postgres, real-time, OAuth token storage)
- Language: TypeScript throughout — convert stub .js files as you build them out
- Styling: plain CSS + variables (`src/renderer/styles.css`), no framework.
  Dark theme, ember-amber accent (`--accent`). Native OS window chrome
  (not frameless) — revisit only if a custom title bar is explicitly wanted.

## Architecture
1. `src/main` — Electron main process. Owns OAuth redirect handling (opens
   system browser or in-app webview per platform's requirements) and any
   filesystem/OS-level work.
2. `src/renderer` — React UI. Never talks to platform APIs directly — always
   goes through `src/services` -> Supabase.
3. `src/services/*` — one file per platform. Each exposes: `getAuthUrl()`,
   `exchangeToken()`, `fetchLibrary()`/`fetchStats()`. Normalize each
   platform's response into the shared schema in `supabase/schema.sql` before
   writing to Supabase. UI reads only from Supabase, never live from
   platform APIs — keeps rate limits sane and the UI fast.
4. `supabase/schema.sql` — source of truth for the unified data model.

## Platform integration notes (read before touching services/*)
- **Steam**: no OAuth. Use Steam OpenID for login (returns SteamID64), then
  server-side calls use your app's Web API key + that SteamID. Profile must
  be public or user must grant "game details" visibility.
- **Riot**: needs RSO (Riot Sign On) for per-user OAuth, which requires an
  *approved production key* first — apply early, it's a ~2 week review and
  blocks real user login. Personal keys work for solo testing but Valorant
  specifically requires production even for that. Dev keys expire every
  24h — expect to regenerate constantly during early build.
- **Battle.net**: OAuth 2.0 authorization-code flow for user profile data
  (needs user consent), client-credentials flow for static game data. Only
  covers WoW / Diablo III / Hearthstone / StarCraft II — no general presence,
  no Overwatch.
- **Epic Games Store**: no public API. Out of scope for automatic sync;
  if we want Epic titles in the library, it'll need manual user entry —
  design the schema to allow a manual/unverified game entry from day one.
- **Discord**: Rich Presence is per-game opt-in from that game's Discord SDK
  integration — we can't pull a generic "what's this friend doing" feed.
  Treat as phase 2 / partial coverage, not a core pillar.

## Reputation model (decided)
Commendations, not ratings — see `commendations` table in `supabase/schema.sql`.
Positive-only (no negative counterpart, by design — avoids the brigading/
stat-shaming vector peer-rating systems like Overwatch endorsements have),
permanent/cumulative (no decay), and gated to people who've actually played
together (shared closed LFG/LFM post or shared guild). Four categories:
good_teammate, great_strategist, good_sport, helpful. Capped at 2
categories per person per session — enforce in service code or a trigger,
the schema's unique constraint alone permits up to 4.

## Groups model (decided)
Three separate shapes in `supabase/schema.sql` — do not merge them:
- **Friends** — a relationship (request/accept), not a group table.
- **Guilds** — persistent, Forge-native only, no external platform sync.
  Has roles (leader/officer/member) and an associated chat channel.
- **LFG posts** — ephemeral, no expiry job. Closes when `lfg_members` count
  hits `party_size` — enforce this in service code or a DB trigger, not
  a scheduled job.
Chat (`channels`/`messages`) covers both DMs and guild channels via a
`kind` column. Milestone comments are a separate lightweight table, not
part of the channel/message system.

## Home dashboard (decided)
The app's landing screen after sign-in is `Home` (`src/renderer/components/
Home.tsx`), not the raw library grid — player-card-first, consolidating
highlights across the whole product concept. `Library` (the full game grid,
`LibraryView.tsx`) is a separate, still fully-functional nav item; `Sidebar`
switches between them via `App.tsx`'s `view` state (no router — only two
real screens exist).

Layout (two-column):
```
┌───────────────┬─────────────────────────────┐
│  PlayerCard    │   StatsRow (games / playtime │
│                │   / platforms connected)     │
│  Guild panel   ├─────────────────────────────┤
│  (below card)  │   RecentGames                │
│                ├──────────────┬──────────────┤
│                │ Achievement  │ Badge        │
│                │ Showcase     │ Showcase     │
└───────────────┴──────────────┴──────────────┘
```

What's real today vs. placeholder ("Soon" styling, `ComingSoonCard.tsx`) —
**don't build fake data for these, wire the real feature first**:
- **PlayerCard, StatsRow, RecentGames**: real, computed from `games` +
  `users` rows that already exist. RecentGames is sorted by `updated_at`
  (most-recently-synced) as a stand-in for "recently played" — Steam's
  `normalizeGame()` doesn't populate `last_played_at` yet (needs an extra
  API flag we don't currently request).
- **Guild panel**: placeholder until the guilds feature (schema already
  exists — see Groups model above) gets service code + UI.
- **Achievement Showcase**: placeholder until platform achievements are
  fetched and normalized into `milestones` — Steam's `fetchAchievements()`
  (`src/services/steam.ts`) exists but is never called yet.
- **Badge Showcase**: placeholder until the commendations feature (see
  Reputation model above) gets service code + UI.

## Current status
Steam round-trip wired end-to-end: OpenID login (system browser, via a
short-lived localhost callback server — Steam's OpenID rejects custom
`forge://` schemes) → SteamID64 extracted → renderer fetches library (proxied
through the main process to avoid CORS and keep `STEAM_API_KEY` out of the
renderer bundle) → normalizes into `games` rows → upserts to Supabase →
renders list. Real Supabase Auth (email/password) is wired in
`src/renderer/App.tsx`/`src/services/supabase.ts` — `public.users` rows are
created automatically via an `auth.users` trigger (`supabase/schema.sql`),
and `games` RLS is scoped to `auth.uid() = user_id`. `vite.config.js`/
`tsconfig.json` now exist; `npm run start` runs Vite + Electron together.
Riot/Battle.net services remain stubs.
Next step: repeat the OAuth round-trip for a second platform (Battle.net has
a more standard OAuth flow than Riot, which needs an approved production key
first).

## Conventions
- One commit per working slice, not per file.
- Every service file needs a comment block at the top noting the platform's
  rate limits and auth expiry behavior — these vary a lot and silently
  breaking on token expiry is the most likely early bug.
