interface ComingSoonCardProps {
  title: string;
  description: string;
}

export default function ComingSoonCard({ title, description }: ComingSoonCardProps) {
  return (
    <div className="card" style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ fontSize: '0.95rem' }}>{title}</h2>
        <span className="badge badge-soon">Soon</span>
      </div>
      <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: 0 }}>{description}</p>
    </div>
  );
}
