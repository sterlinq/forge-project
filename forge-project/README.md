# The Forge Project

A unified gamer identity desktop app — one profile, one activity feed, one
library, aggregated across Steam, Riot Games, and Battle.net.

## Why
Gamer identity is fragmented across Discord, Steam, Riot, Battle.net, and
in-game chats. Forge pulls it into one place: a single "gamer card" that
shows everything you play, not just whatever overlaps with the friend
looking at your profile.

## Status
Early scaffold. See `CLAUDE.md` for architecture and current build state.

## Setup
```bash
npm install
cp .env.example .env   # fill in API keys/secrets
npm run dev
```

## Tech
Electron + React (renderer) + Supabase (Postgres/Auth/Realtime). See
`CLAUDE.md` for the full architecture and per-platform integration notes.
