// Steam has no OAuth. Flow is:
//   1. Send user through Steam OpenID login -> returns their SteamID64
//   2. All subsequent calls use OUR Web API key (not user-specific) + their SteamID
// Rate limit: ~100k calls/day per key, generous for personal use.
// User's Steam profile/game-details privacy must be set to public or these
// calls return empty data with no error — worth a UI warning for that case.

export interface SteamGame {
  appid: number;
  name: string;
  playtime_forever: number; // minutes
  [key: string]: unknown;
}

export interface NormalizedGame {
  user_id: string;
  platform: 'steam';
  platform_game_id: string;
  title: string;
  playtime_minutes: number;
  is_manual_entry: false;
}

const STEAM_API_BASE = 'https://api.steampowered.com';

export function getOpenIdLoginUrl(returnUrl: string): string {
  const params = new URLSearchParams({
    'openid.ns': 'http://specs.openid.net/auth/2.0',
    'openid.mode': 'checkid_setup',
    'openid.return_to': returnUrl,
    'openid.realm': returnUrl,
    'openid.identity': 'http://specs.openid.net/auth/2.0/identifier_select',
    'openid.claimed_id': 'http://specs.openid.net/auth/2.0/identifier_select',
  });
  return `https://steamcommunity.com/openid/login?${params}`;
}

export async function fetchLibrary(apiKey: string, steamId64: string): Promise<SteamGame[]> {
  const url = `${STEAM_API_BASE}/IPlayerService/GetOwnedGames/v1/?key=${apiKey}&steamid=${steamId64}&include_appinfo=true&include_played_free_games=true`;
  const res = await fetch(url);
  const { response } = await res.json();
  return response?.games ?? [];
}

export async function fetchAchievements(apiKey: string, steamId64: string, appId: number) {
  const url = `${STEAM_API_BASE}/ISteamUserStats/GetPlayerAchievements/v1/?appid=${appId}&key=${apiKey}&steamid=${steamId64}`;
  const res = await fetch(url);
  const { playerstats } = await res.json();
  // TODO: map achieved achievements into the `milestones` table schema
  return playerstats?.achievements ?? [];
}

// Maps a raw GetOwnedGames entry into the `games` table row shape
// (supabase/schema.sql). platform_game_id is Steam's appid, stringified to
// match the schema's `text` column shared across all platforms.
export function normalizeGame(game: SteamGame, userId: string): NormalizedGame {
  return {
    user_id: userId,
    platform: 'steam',
    platform_game_id: String(game.appid),
    title: game.name,
    playtime_minutes: game.playtime_forever ?? 0,
    is_manual_entry: false,
  };
}
