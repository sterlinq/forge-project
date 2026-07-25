import { formatPlaytime } from '../format';

interface GameRow {
  id: string;
  title: string;
  playtime_minutes: number;
  platform: string;
}

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="card" style={{ padding: '1rem', flex: 1, textAlign: 'center' }}>
      <div style={{ fontSize: '1.4rem', fontWeight: 800 }}>{value}</div>
      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{label}</div>
    </div>
  );
}

export default function StatsRow({ games }: { games: GameRow[] }) {
  const totalPlaytime = games.reduce((sum, g) => sum + g.playtime_minutes, 0);
  const platformCount = new Set(games.map((g) => g.platform)).size;

  return (
    <div style={{ display: 'flex', gap: '1rem' }}>
      <StatTile label="Games" value={String(games.length)} />
      <StatTile label="Total playtime" value={formatPlaytime(totalPlaytime)} />
      <StatTile label="Platforms connected" value={String(platformCount)} />
    </div>
  );
}
