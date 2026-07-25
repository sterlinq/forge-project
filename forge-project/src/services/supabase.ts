import { createClient } from '@supabase/supabase-js';
import type { NormalizedGame } from './steam';

// Loaded from .env via Vite's import.meta.env — see .env.example
export const supabase = createClient(
  import.meta.env.SUPABASE_URL,
  import.meta.env.SUPABASE_ANON_KEY
);

// Upserts normalized game rows, keyed on the platform-scoped unique identity
// of a game so re-syncing a library updates playtime instead of duplicating.
export async function upsertGames(games: NormalizedGame[]) {
  if (games.length === 0) return { data: [], error: null };
  return supabase
    .from('games')
    .upsert(games, { onConflict: 'user_id,platform,platform_game_id' })
    .select();
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
