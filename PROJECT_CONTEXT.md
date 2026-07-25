# The Forge — Project Context

Consolidated project knowledge for use in a **Claude Project** (claude.ai).
This is the portable summary for planning and drafting batches of change
requests; the authoritative doc Claude *Code* actually reads while
implementing is `forge-project/CLAUDE.md` in the repo. See the "Claude
Projects ↔ Claude Code workflow" section at the end for how the two stay in
sync.

## Concept
A unified gamer identity desktop app — one profile, one activity feed, one
library view, aggregated across Steam, Riot Games, and Battle.net (Discord
presence is phase 2, not a core pillar — see platform notes below). Gamer
identity today is fragmented across Discord, Steam, Riot, Battle.net, and
in-game chats; Forge pulls it into one place: a single "gamer card" showing
everything a person plays, not just whatever overlaps with the friend
looking at their profile. Desktop app, not a web app.

## Stack (decided — flag before changing)
- **Shell**: Electron + Vite + React (renderer)
- **Backend/DB/Auth**: Supabase (Postgres, real-time, OAuth token storage)
- **Language**: TypeScript throughout — convert stub `.js` files as they get
  built out (Riot/Battle.net services are still `.js` stubs; everything
  actively wired — Steam, Supabase, the renderer — is TypeScript)
- **Styling**: plain CSS + variables (`src/renderer/styles.css`), no
  framework. Dark theme, ember-amber accent. Native OS window chrome (not
  frameless) — a deliberate scope cut, not an oversight; revisit only if a
  custom title bar is explicitly wanted later.

## Architecture
1. `src/main` — Electron main process. Owns OAuth redirect handling and any
   filesystem/OS-level or CORS-sensitive network work (see Steam notes below
   for why the actual Steam API call lives here, not the renderer).
2. `src/renderer` — React UI. Never talks to platform APIs directly — always
   goes through `src/services` → Supabase (or, for Steam's raw fetch, through
   a main-process IPC call — see below).
3. `src/services/*` — one file per platform, normalizing that platform's API
   response into the shared schema in `supabase/schema.sql` before writing to
   Supabase. UI reads only from Supabase, never live from platform APIs.
4. `supabase/schema.sql` — source of truth for the unified data model.

## Platform integration notes
- **Steam**: no OAuth. Steam OpenID login returns a SteamID64; server-side
  calls then use the app's Web API key + that SteamID. Profile must be
  public or the user must grant "game details" visibility, or calls return
  empty data with no error. **Steam's OpenID provider requires `return_to`/
  `realm` to be `http(s)://` URLs** — a custom scheme (`forge://...`) is
  rejected with "invalid protocol". **Steam's Web API also has no CORS
  headers**, so calling it with `fetch()` from the renderer (a browser
  context) fails silently with "Failed to fetch". Both are why the actual
  network calls happen in the Electron **main process**, not the renderer —
  see Current Status below for exactly how.
- **Riot**: needs RSO (Riot Sign On) for per-user OAuth, requiring an
  *approved production key* first — apply early, ~2 week review, blocks real
  user login. Personal keys work for solo testing but Valorant specifically
  requires production even for that. Dev keys expire every 24h.
- **Battle.net**: OAuth 2.0 authorization-code flow for user profile data
  (user consent), client-credentials flow for static game data. Only covers
  WoW / Diablo III / Hearthstone / StarCraft II — no general presence, no
  Overwatch. Access tokens go in the `Authorization` header, not the URL
  query string (a common but outdated mistake).
- **Epic Games Store**: no public API — out of scope for automatic sync; if
  wanted, needs manual user entry (schema already supports a manual/
  unverified game entry).
- **Discord**: Rich Presence is per-game opt-in from that game's own Discord
  SDK integration — no generic "what's this friend doing" feed is possible.
  Phase 2 / partial coverage, not a core pillar.

## Reputation model (decided)
Commendations, not ratings (`commendations` table). Positive-only (no
negative counterpart — avoids the brigading/stat-shaming vector peer-rating
systems like Overwatch endorsements have), permanent/cumulative (no decay),
gated to people who've actually played together (shared closed LFG/LFM post
or shared guild). Four categories: `good_teammate`, `great_strategist`,
`good_sport`, `helpful`. Capped at 2 categories per person per session —
must be enforced in service code or a trigger; the schema's unique
constraint alone permits up to 4.

## Groups model (decided)
Three separate shapes — do not merge:
- **Friends** — a relationship (request/accept), not a group table.
- **Guilds** — persistent, Forge-native only, no external platform sync.
  Roles (leader/officer/member) + an associated chat channel.
- **LFG posts** — ephemeral, no expiry job. Closes when `lfg_members` count
  hits `party_size` — service code or DB trigger, not a scheduled job.
Chat (`channels`/`messages`) covers both DMs and guild channels via a `kind`
column. Milestone comments are a separate lightweight table.

## Home dashboard (decided)
Landing screen after sign-in is player-card-first (`Home.tsx`), not the raw
library grid — consolidates highlights across the whole product concept.
`Library` (full game grid) is a separate, still fully-functional nav item;
sidebar switches between the two (no router — only two real screens exist
yet).

Layout (two columns):
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

What's real vs. placeholder ("Soon" styling) — **don't build fake data for
placeholders, wire the real feature first**:
- **Real** (computed from `games`/`users` rows that already exist):
  PlayerCard, StatsRow, RecentGames. RecentGames sorts by `updated_at`
  (most-recently-synced) as a stand-in for "recently played" — Steam's
  normalizer doesn't populate `last_played_at` yet (needs an extra API flag
  not currently requested).
- **Placeholder**: Guild panel (needs guilds service code + UI), Achievement
  Showcase (needs platform achievements fetched into `milestones` — Steam's
  `fetchAchievements()` exists but is never called), Badge Showcase (needs
  the commendations feature built).

## Current status (verified working end-to-end)
- **Auth**: real Supabase email/password auth. `public.users` rows are
  created automatically via an `auth.users` insert trigger
  (`handle_new_user`, in `supabase/schema.sql`) — the client never inserts
  into `users` directly.
- **Steam round-trip**: "Connect Steam" → Steam OpenID login opens in the
  system browser via a **short-lived local HTTP server** (`http://127.0.0.1:
  <ephemeral port>/auth-callback`) that Electron's main process spins up just
  for that redirect (see Steam notes above for why not `forge://`) → SteamID64
  extracted → renderer requests the library via `window.forge.steam.
  fetchLibrary()`, which is proxied through an IPC handler in the main
  process (`steam:fetchLibrary`) that does the actual `fetch()` call there —
  avoids the CORS block and keeps `STEAM_API_KEY` out of the renderer's JS
  bundle entirely (loaded via `dotenv` in main only) → normalized into
  `games` rows (`src/services/steam.ts`'s `normalizeGame()`) → upserted to
  Supabase → rendered.
- **RLS**: `games` table policy scoped to `auth.uid() = user_id` (an earlier
  wide-open `anon` policy used to unblock the very first working version has
  been dropped). `users` table currently has **no RLS policy at all** — a
  known gap, not yet a real problem since no sensitive data lives there, but
  worth closing before this goes anywhere near production.
- **UI**: full visual redesign — dark theme, ember-amber accent, sidebar nav
  (Home/Library functional; Activity Feed/Friends/Guilds/LFG shown disabled
  with a "Soon" badge, previewing the intended app shape honestly), branded
  auth screen, player-card-first Home dashboard (see above).
- **Window title**: "The Forge" (was "The Forge Project") — set both in
  `index.html`'s `<title>` and the Electron `BrowserWindow` `title` option.
- **Tooling**: `vite.config.js`/`tsconfig.json` now exist (didn't originally
  — the app couldn't build at all at the start of this work). `npm run
  start` runs Vite + Electron together (`concurrently`/`wait-on` — note the
  wait step is its own npm script, `electron:wait`, not an inline `npm:`
  reference chained with `&&` inside one string; the latter breaks on
  Windows `cmd.exe`, which misparses `npm:electron` as an NTFS
  alternate-data-stream path).
- **Riot/Battle.net**: still stubs — no OAuth flow wired, service files exist
  with normalization notes but nothing calling them yet.

## Known limitations / open items
- `display_name` in `public.users` currently just falls back to the email
  address (the signup trigger has no real display-name collection step yet).
- No RLS policy on `public.users` (see above).
- No password-reset flow; relies on Supabase's default email confirmation on
  sign-up (works, but no custom UX around it).
- Riot/Battle.net rounds trips not started. Recommended order: Battle.net
  next (standard OAuth, no approval wait), Riot last (needs an approved
  production key, ~2 week lead time — worth applying for early even before
  starting the implementation work).
- Achievements/milestones, commendations, guilds, friends, LFG: schema exists
  for all of these, **zero service code or UI** — the placeholders on Home
  and the disabled sidebar items are the only trace of them in the app today.

## File map (for orientation)
```
forge-project/
  CLAUDE.md              — authoritative in-repo doc for Claude Code
  supabase/schema.sql    — full data model, RLS policies, auth trigger
  src/main/index.js      — Electron main: window, Steam OAuth callback server,
                            steam:fetchLibrary IPC handler
  src/main/preload.js    — renderer-exposed window.forge bridge
  src/services/steam.ts  — Steam OpenID URL + normalizeGame()
  src/services/supabase.ts — Supabase client + all queries/auth helpers
  src/services/riot.js, battlenet.js — stubs, not wired up
  src/renderer/App.tsx   — session gate + view switch (home/library)
  src/renderer/components/
    AuthForm.tsx, Sidebar.tsx, Home.tsx, LibraryView.tsx,
    PlayerCard.tsx, StatsRow.tsx, RecentGames.tsx, GameCard.tsx,
    ComingSoonCard.tsx
  src/renderer/styles.css, format.ts, errorMessage.ts — shared UI utilities
```

---

## Claude Projects ↔ Claude Code workflow
This file (`PROJECT_CONTEXT.md`, at the repo's parent folder) is meant to be
**project knowledge inside a Claude Project on claude.ai** — the place to
draft, discuss, and batch up upcoming changes or improvements *before*
sending them to Claude Code for implementation. The intended loop:

1. **Plan in the Claude Project.** Use this file as shared context so
   Claude (in claude.ai) understands the app's current state, decisions
   already made, and what's still a placeholder — without re-explaining any
   of it each time. Draft a batch of desired changes/improvements here.
2. **Hand the batch to Claude Code.** Paste the drafted batch (plus this
   file, if anything in it changed) into a Claude Code session against the
   `forge-project` repo. Claude Code's actual source of truth while coding
   is `forge-project/CLAUDE.md` — not this file — so no manual copying of
   architecture facts is needed there; this file exists so the *planning*
   side (claude.ai) has the same picture.
3. **Keep the two in sync.** Whenever Claude Code implements something that
   changes a "decided" fact, current status, or known limitation, its
   session updates `CLAUDE.md` in the repo directly. Periodically (after a
   batch lands, or before planning the next one), refresh this file from the
   latest `CLAUDE.md` so the Claude Project doesn't plan against stale
   status — treat drift between the two as a signal to re-sync, not ignore.
4. **File sharing**: since this file lives outside `forge-project/` (at the
   `Forge/` folder root), it travels independently of the git repo — easy to
   attach directly to a Claude Project as knowledge, or drop into a fresh
   Claude Code session for extra context, without pulling in the whole
   codebase.
