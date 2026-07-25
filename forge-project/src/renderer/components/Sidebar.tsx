import { signOut } from '../../services/supabase';
import type { View } from '../App';

const COMING_SOON = ['Activity Feed', 'Friends', 'Guilds', 'LFG'];

interface SidebarProps {
  userEmail: string;
  view: View;
  onNavigate: (view: View) => void;
}

export default function Sidebar({ userEmail, view, onNavigate }: SidebarProps) {
  return (
    <div
      style={{
        width: 220,
        flexShrink: 0,
        borderRight: '1px solid var(--border)',
        display: 'flex',
        flexDirection: 'column',
        padding: '1.25rem 1rem',
      }}
    >
      <div className="wordmark" style={{ fontSize: '1.1rem', marginBottom: '2rem' }}>
        <span className="wordmark-accent">Forge</span>
      </div>

      <nav style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', flex: 1 }}>
        {(['home', 'library'] as const).map((navView) => (
          <div
            key={navView}
            className="btn"
            onClick={() => onNavigate(navView)}
            style={{
              justifyContent: 'flex-start',
              background: view === navView ? 'var(--surface-raised)' : 'transparent',
              borderColor: view === navView ? 'var(--accent)' : 'transparent',
            }}
          >
            {navView === 'home' ? 'Home' : 'Library'}
          </div>
        ))}
        {COMING_SOON.map((label) => (
          <div
            key={label}
            className="btn"
            style={{
              justifyContent: 'space-between',
              background: 'transparent',
              border: '1px solid transparent',
              color: 'var(--text-muted)',
              cursor: 'not-allowed',
            }}
          >
            <span>{label}</span>
            <span className="badge badge-soon">Soon</span>
          </div>
        ))}
      </nav>

      <div style={{ borderTop: '1px solid var(--border)', paddingTop: '0.85rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', wordBreak: 'break-all' }}>{userEmail}</span>
        <button className="btn btn-block" onClick={() => signOut()}>
          Sign out
        </button>
      </div>
    </div>
  );
}
