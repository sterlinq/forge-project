import { useEffect, useState } from 'react';
import { normalizeGame } from '../../services/steam';
import { upsertGames, fetchGamesForUser } from '../../services/supabase';
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
        const normalized = rawGames.map((g) => normalizeGame(g, userId));
        const { data, error } = await upsertGames(normalized);
        if (error) throw error;
        setGames(data ?? []);
        setStatus('idle');
      } catch (err) {
        setError(errorMessage(err));
        setStatus('error');
      }
    });
  }, [userId]);

  return (
    <div style={{ flex: 1, padding: '1.5rem 2rem', overflowY: 'auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
        <h1 style={{ fontSize: '1.35rem' }}>Your Library</h1>
        <button className="btn btn-primary" onClick={() => window.forge.steam.login()} disabled={status === 'syncing'}>
          {status === 'syncing' ? 'Syncing library…' : 'Connect Steam'}
        </button>
      </div>

      {error && (
        <p className="banner-error" style={{ marginBottom: '1rem' }}>
          {error}
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
