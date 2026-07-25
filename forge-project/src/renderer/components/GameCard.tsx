import { formatPlaytime } from '../format';

interface GameCardProps {
  title: string;
  playtimeMinutes: number;
}

export default function GameCard({ title, playtimeMinutes }: GameCardProps) {
  const monogram = title.charAt(0).toUpperCase();

  return (
    <div className="card" style={{ padding: '0.85rem', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
      <div
        style={{
          aspectRatio: '3 / 2',
          borderRadius: 6,
          background: 'var(--surface-raised)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '1.75rem',
          fontWeight: 800,
          color: 'var(--text-muted)',
        }}
      >
        {monogram}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem' }}>
        <span style={{ fontSize: '0.85rem', fontWeight: 600, lineHeight: 1.3 }}>{title}</span>
        <span className="badge badge-steam" style={{ flexShrink: 0 }}>
          Steam
        </span>
      </div>
      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{formatPlaytime(playtimeMinutes)} played</span>
    </div>
  );
}
