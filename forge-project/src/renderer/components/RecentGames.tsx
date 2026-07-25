import GameCard from './GameCard';

interface GameRow {
  id: string;
  title: string;
  playtime_minutes: number;
  updated_at: string;
}

// "Recent" is approximated as most-recently-synced rather than
// most-recently-played: Steam's normalizeGame() (src/services/steam.ts)
// doesn't populate the schema's last_played_at column yet — that needs an
// extra API flag we don't currently request.
export default function RecentGames({ games }: { games: GameRow[] }) {
  const recent = [...games]
    .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
    .slice(0, 6);

  return (
    <div>
      <h2 style={{ fontSize: '0.95rem', marginBottom: '0.75rem', color: 'var(--text-muted)' }}>Recently synced</h2>
      {recent.length === 0 ? (
        <div className="card" style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--text-muted)' }}>
          No games synced yet.
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '0.85rem' }}>
          {recent.map((game) => (
            <GameCard key={game.id} title={game.title} playtimeMinutes={game.playtime_minutes} />
          ))}
        </div>
      )}
    </div>
  );
}
