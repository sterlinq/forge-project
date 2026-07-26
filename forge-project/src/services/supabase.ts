import { createClient } from '@supabase/supabase-js';

// Loaded from .env via Vite's import.meta.env — see .env.example
export const supabase = createClient(
  import.meta.env.SUPABASE_URL,
  import.meta.env.SUPABASE_ANON_KEY
);

// Structural, not imported from steam.ts's platform-specific NormalizedGame
// (platform: 'steam') — every platform's normalizeGame() (steam.ts,
// battlenet.ts, ...) returns a narrower `platform` literal, and TS accepts
// those here since they all satisfy this shape.
interface GameRow {
  user_id: string;
  platform: string;
  platform_game_id: string;
  title: string;
  playtime_minutes: number;
  is_manual_entry: boolean;
}

interface MilestoneRow {
  user_id: string;
  game_id: string;
  title: string;
  description: string | null;
  achieved_at: string;
  rarity_pct: number | null;
}

// Upserts normalized game rows, keyed on the platform-scoped unique identity
// of a game so re-syncing a library updates playtime instead of duplicating.
export async function upsertGames(games: GameRow[]) {
  if (games.length === 0) return { data: [], error: null };
  return supabase
    .from('games')
    .upsert(games, { onConflict: 'user_id,platform,platform_game_id' })
    .select();
}

// linked_accounts has a (user_id, platform) unique constraint, so this
// updates the stored token in place on reconnect instead of duplicating.
export async function upsertLinkedAccount(account: {
  user_id: string;
  platform: string;
  platform_user_id: string;
  access_token: string;
  refresh_token: string | null;
  token_expires_at: string;
}) {
  return supabase
    .from('linked_accounts')
    .upsert(account, { onConflict: 'user_id,platform' })
    .select();
}

export async function fetchLinkedAccount(userId: string, platform: string) {
  return supabase
    .from('linked_accounts')
    .select('access_token, refresh_token, token_expires_at')
    .eq('user_id', userId)
    .eq('platform', platform)
    .maybeSingle();
}

// milestones has no unique constraint (unlike games/linked_accounts), so
// re-syncing can't rely on upsert for dedup — callers fetch existing titles
// for the game first and only insert the ones that aren't already there.
export async function fetchExistingMilestoneTitles(userId: string, gameId: string): Promise<Set<string>> {
  const { data, error } = await supabase
    .from('milestones')
    .select('title')
    .eq('user_id', userId)
    .eq('game_id', gameId);
  if (error) throw error;
  return new Set((data ?? []).map((row) => row.title));
}

export async function insertMilestones(milestones: MilestoneRow[]) {
  if (milestones.length === 0) return { data: [], error: null };
  return supabase.from('milestones').insert(milestones).select();
}

export async function fetchGamesForUser(userId: string) {
  return supabase
    .from('games')
    .select('*')
    .eq('user_id', userId)
    .order('playtime_minutes', { ascending: false });
}

export async function fetchUserProfile(userId: string) {
  return supabase.from('users').select('display_name, created_at').eq('id', userId).single();
}

// Session persistence (localStorage) is automatic in supabase-js — the
// renderer is a normal browser context, no extra wiring needed.
export function signUp(email: string, password: string) {
  return supabase.auth.signUp({ email, password });
}

export function signIn(email: string, password: string) {
  return supabase.auth.signInWithPassword({ email, password });
}

export function signOut() {
  return supabase.auth.signOut();
}

export function getSession() {
  return supabase.auth.getSession();
}

export function onAuthStateChange(callback: (session: import('@supabase/supabase-js').Session | null) => void) {
  return supabase.auth.onAuthStateChange((_event, session) => callback(session));
}
