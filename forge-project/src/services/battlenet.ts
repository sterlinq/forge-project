// Battle.net covers WoW, Diablo III, Hearthstone, StarCraft II only —
// no general presence, no Overwatch. Two auth flows:
//   - Authorization-code flow (user consent) for profile data (characters,
//     achievements) — this is what we need.
//   - Client-credentials flow for static game data (items, zones etc.) —
//     not user-specific, lower priority.
// Recent Blizzard change: access tokens must go in the Authorization header,
// NOT the URL query string — older examples online are wrong on this.
//
// These functions are the typed reference for the OAuth/API shape — the
// actual runtime calls happen in src/main/index.js instead, duplicated
// there (same as steam.ts's getOpenIdLoginUrl) because main has no TS
// build step and can't import this file directly. Keep both in sync if
// the OAuth params or endpoints change. normalizeGame/normalizeMilestone
// below are the exception — those run in the renderer, same as steam.ts's
// normalizeGame.

export interface BattlenetTokenResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
  [key: string]: unknown;
}

export interface BattlenetUserinfo {
  sub: string;
  id: number;
  battletag: string;
}

export interface BattlenetCharacterSummary {
  name: string;
  realm: { slug: string; name: string };
  playable_class?: { name: string };
  playable_race?: { name: string };
  level?: number;
  [key: string]: unknown;
}

export interface BattlenetEarnedAchievement {
  id: number;
  achievement: { id: number; name: string };
  completed_timestamp: number;
  [key: string]: unknown;
}

export interface NormalizedGame {
  user_id: string;
  platform: 'battlenet';
  platform_game_id: string;
  title: string;
  playtime_minutes: number;
  is_manual_entry: false;
}

export interface NormalizedMilestone {
  user_id: string;
  game_id: string;
  title: string;
  description: string | null;
  achieved_at: string;
  rarity_pct: number | null;
}

export function getOAuthLoginUrl(clientId: string, redirectUri: string, region = 'us'): string {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'wow.profile',
  });
  return `https://${region}.battle.net/oauth/authorize?${params}`;
}

export async function exchangeToken(
  clientId: string,
  clientSecret: string,
  code: string,
  redirectUri: string
): Promise<BattlenetTokenResponse> {
  const res = await fetch('https://oauth.battle.net/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
    }),
  });
  return res.json();
}

// BattleTag — the only stable per-account identifier the OAuth response
// gives us, so it's what linked_accounts.platform_user_id stores.
export async function fetchUserinfo(accessToken: string, region = 'us'): Promise<BattlenetUserinfo> {
  const res = await fetch(`https://${region}.battle.net/oauth/userinfo`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  return res.json();
}

// A token alone doesn't tell you realmSlug/characterName — this is the
// entry point: list every character on the account across all realms
// (flattened, since a Battle.net account can hold multiple WoW accounts
// after account merges), then the caller loops that list into
// fetchCharacterProfile/fetchCharacterAchievements for full detail.
export async function fetchAccountProfile(
  accessToken: string,
  region = 'us'
): Promise<BattlenetCharacterSummary[]> {
  const url = `https://${region}.api.blizzard.com/profile/user/wow?namespace=profile-${region}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const data = await res.json();
  const accounts = data?.wow_accounts ?? [];
  return accounts.flatMap(
    (account: { characters?: BattlenetCharacterSummary[] }) => account.characters ?? []
  );
}

export async function fetchCharacterProfile(
  accessToken: string,
  region: string,
  realmSlug: string,
  characterName: string
) {
  // Blizzard's character API requires a lowercase name/slug in the URL.
  const url = `https://${region}.api.blizzard.com/profile/wow/character/${realmSlug}/${characterName.toLowerCase()}?namespace=profile-${region}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` }, // header, not query param
  });
  return res.json();
}

export async function fetchCharacterAchievements(
  accessToken: string,
  region: string,
  realmSlug: string,
  characterName: string
): Promise<BattlenetEarnedAchievement[]> {
  const url = `https://${region}.api.blizzard.com/profile/wow/character/${realmSlug}/${characterName.toLowerCase()}/achievements?namespace=profile-${region}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const data = await res.json();
  // Only ones actually earned — the endpoint also lists in-progress criteria.
  return (data?.achievements ?? []).filter((a: BattlenetEarnedAchievement) => a.completed_timestamp);
}

// Tokens last ~24h nominally but can expire early (password change,
// revocation, account lock) — callers must check linked_accounts.
// token_expires_at before reusing a stored token rather than trusting the
// nominal lifetime.
export function isTokenExpired(tokenExpiresAt: string | null): boolean {
  if (!tokenExpiresAt) return true;
  return new Date(tokenExpiresAt).getTime() <= Date.now();
}

// One `games` row per Battle.net game the account has activity in, not per
// character — multiple WoW characters all collapse onto the same row
// (platform_game_id: 'wow') via the games table's (user_id, platform,
// platform_game_id) unique constraint, same upsert-not-duplicate behavior
// steam.ts's normalizeGame relies on. Blizzard's API doesn't expose total
// /played time, so playtime_minutes stays 0 — this row represents
// ownership, not hours.
export function normalizeGame(userId: string): NormalizedGame {
  return {
    user_id: userId,
    platform: 'battlenet',
    platform_game_id: 'wow',
    title: 'World of Warcraft',
    playtime_minutes: 0,
    is_manual_entry: false,
  };
}

// Maps one earned achievement into the `milestones` table shape
// (supabase/schema.sql). rarity_pct is left null — Blizzard doesn't expose
// population % without extra static-game-data calls, out of scope for v1.
export function normalizeMilestone(
  character: BattlenetCharacterSummary,
  achievement: BattlenetEarnedAchievement,
  gameId: string,
  userId: string
): NormalizedMilestone {
  return {
    user_id: userId,
    game_id: gameId,
    title: `${achievement.achievement.name} — ${character.name}`,
    description: null,
    achieved_at: new Date(achievement.completed_timestamp).toISOString(),
    rarity_pct: null,
  };
}
