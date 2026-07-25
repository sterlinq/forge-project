import { useEffect, useState } from 'react';
import { fetchGamesForUser } from '../../services/supabase';
import { errorMessage } from '../errorMessage';
import PlayerCard from './PlayerCard';
import StatsRow from './StatsRow';
import RecentGames from './RecentGames';
import ComingSoonCard from './ComingSoonCard';

interface GameRow {
  id: string;
  title: string;
  playtime_minutes: number;
  platform: string;
  updated_at: string;
}

export default function Home({ userId, email }: { userId: string; email: string }) {
  const [games, setGames] = useState<GameRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchGamesForUser(userId).then(({ data, error }) => {
      if (error) setError(errorMessage(error));
      else setGames(data ?? []);
    });
  }, [userId]);

  return (
    <div style={{ flex: 1, padding: '1.5rem 2rem', overflowY: 'auto' }}>
      {error && (
        <p className="banner-error" style={{ marginBottom: '1rem' }}>
          {error}
        </p>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', gap: '1.5rem', alignItems: 'start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <PlayerCard userId={userId} email={email} />
          <ComingSoonCard title="Guild" description="Your guild roster and chat will show up here once guilds are wired up." />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <StatsRow games={games} />
          <RecentGames games={games} />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <ComingSoonCard
              title="Achievement Showcase"
              description="Milestones from your connected platforms will appear here once achievement syncing is built."
            />
            <ComingSoonCard
              title="Badge Showcase"
              description="Commendations from teammates will appear here once the reputation feature is built."
            />
          </div>
        </div>
      </div>
    </div>
  );
}
