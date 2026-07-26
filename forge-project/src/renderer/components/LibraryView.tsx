import { useEffect, useState } from 'react';
import { normalizeGame as normalizeSteamGame } from '../../services/steam';
import {
  normalizeGame as normalizeBattlenetGame,
  normalizeMilestone,
  isTokenExpired,
} from '../../services/battlenet';
import {
  upsertGames,
  fetchGamesForUser,
  upsertLinkedAccount,
  fetchLinkedAccount,
  fetchExistingMilestoneTitles,
  insertMilestones,
} from '../../services/supabase';
import { errorMessage } from '../errorMessage';
import GameCard from './GameCard';

interface GameRow {
  id: string;
  title: string;
  playtime_minutes: number;
}

export default function LibraryView({ userId }: { userId: string }) {
  const [status, setStatus] = useState<'idle' | 'syncing' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [games, setGames] = useState<GameRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [battlenetStatus, setBattlenetStatus] = useState<'idle' | 'syncing' | 'error'>('idle');
  const [battlenetError, setBattlenetError] = useState<string | null>(null);

  // Pulls the account's WoW characters + earned achievements and syncs them
  // into games/milestones. Shared by both entry points: a fresh OAuth
  // round-trip (via the callback effect below) and reusing an already-valid
  // stored token (connectBattlenet, when it skips the browser popup).
  async function syncBattlenetProfile(accessToken: string, region: string) {
    const { characters, achievementsByCharacter } = await window.forge.battlenet.fetchProfile(
      accessToken,
      region
    );

    const { data: gameRows, error: gameError } = await upsertGames([normalizeBattlenetGame(userId)]);
    if (gameError) throw gameError;
    const gameId = gameRows?.[0]?.id;
    if (!gameId) throw new Error('Battle.net sync failed — no games row returned.');

    const existingTitles = await fetchExistingMilestoneTitles(userId, gameId);
    const newMilestones = characters.flatMap((character) => {
      const key = `${character.realm.slug}-${character.name.toLowerCase()}`;
      const earned = achievementsByCharacter[key] ?? [];
      return earned
        .map((achievement) => normalizeMilestone(character, achievement, gameId, userId))
        .filter((milestone) => !existingTitles.has(milestone.title));
    });
    const { error: milestoneError } = await insertMilestones(newMilestones);
    if (milestoneError) throw milestoneError;

    const { data: allGames, error: fetchError } = await fetchGamesForUser(userId);
    if (fetchError) throw fetchError;
    setGames(allGames ?? []);
  }

  useEffect(() => {
    fetchGamesForUser(userId).then(({ data, error }) => {
      if (error) setError(errorMessage(error));
      else setGames(data ?? []);
      setLoaded(true);
    });

    window.forge.steam.onCallback(async (steamId64: string) => {
      setStatus('syncing');
      setError(null);
      try {
        const rawGames = await window.forge.steam.fetchLibrary(steamId64);
        const normalized = rawGames.map((g) => normalizeSteamGame(g, userId));
        const { data, error } = await upsertGames(normalized);
        if (error) throw error;
        setGames(data ?? []);
        setStatus('idle');
      } catch (err) {
        setError(errorMessage(err));
        setStatus('error');
      }
    });

    window.forge.battlenet.onCallback(async (code: string) => {
      setBattlenetStatus('syncing');
      setBattlenetError(null);
      try {
        const { battletag, accessToken, refreshToken, expiresAt, region } =
          await window.forge.battlenet.completeAuth(code);
        const { error: linkError } = await upsertLinkedAccount({
          user_id: userId,
          platform: 'battlenet',
          platform_user_id: battletag,
          access_token: accessToken,
          refresh_token: refreshToken,
          token_expires_at: expiresAt,
        });
        if (linkError) throw linkError;

        await syncBattlenetProfile(accessToken, region);
        setBattlenetStatus('idle');
      } catch (err) {
        setBattlenetError(errorMessage(err));
        setBattlenetStatus('error');
      }
    });

    window.forge.battlenet.onError((reason: string) => {
      setBattlenetError(`Battle.net login failed (${reason}).`);
      setBattlenetStatus('error');
    });
    // syncBattlenetProfile is stable across renders in the ways that matter
    // here (only reads userId, already a dep) — omitting it avoids
    // re-registering these ipcRenderer listeners every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  async function connectBattlenet() {
    setBattlenetStatus('syncing');
    setBattlenetError(null);
    try {
      // Reuse a still-valid stored token instead of forcing a fresh browser
      // consent screen every time — only fall back to the full OAuth
      // round-trip once it's actually expired or missing.
      const { data: linked, error: linkedError } = await fetchLinkedAccount(userId, 'battlenet');
      if (linkedError) throw linkedError;
      if (linked && !isTokenExpired(linked.token_expires_at)) {
        await syncBattlenetProfile(linked.access_token, 'us');
        setBattlenetStatus('idle');
        return;
      }
      window.forge.battlenet.startAuth();
    } catch (err) {
      setBattlenetError(errorMessage(err));
      setBattlenetStatus('error');
    }
  }

  return (
    <div style={{ flex: 1, padding: '1.5rem 2rem', overflowY: 'auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
        <h1 style={{ fontSize: '1.35rem' }}>Your Library</h1>
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <button className="btn btn-primary" onClick={() => window.forge.steam.login()} disabled={status === 'syncing'}>
            {status === 'syncing' ? 'Syncing library…' : 'Connect Steam'}
          </button>
          <button className="btn btn-primary" onClick={connectBattlenet} disabled={battlenetStatus === 'syncing'}>
            {battlenetStatus === 'syncing' ? 'Syncing Battle.net…' : 'Connect Battle.net'}
          </button>
        </div>
      </div>

      {error && (
        <p className="banner-error" style={{ marginBottom: '1rem' }}>
          {error}
        </p>
      )}
      {battlenetError && (
        <p className="banner-error" style={{ marginBottom: '1rem' }}>
          {battlenetError}
        </p>
      )}

      {loaded && games.length === 0 && (
        <div className="card" style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--text-muted)' }}>
          No games yet — connect a platform above to pull in your library.
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '1rem' }}>
        {games.map((game) => (
          <GameCard key={game.id} title={game.title} playtimeMinutes={game.playtime_minutes} />
        ))}
      </div>
    </div>
  );
}
