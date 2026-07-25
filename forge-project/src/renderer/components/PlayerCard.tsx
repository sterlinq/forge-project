import { useEffect, useState } from 'react';
import { fetchUserProfile } from '../../services/supabase';

interface Profile {
  display_name: string;
  created_at: string;
}

export default function PlayerCard({ userId, email }: { userId: string; email: string }) {
  const [profile, setProfile] = useState<Profile | null>(null);

  useEffect(() => {
    fetchUserProfile(userId).then(({ data }) => setProfile(data));
  }, [userId]);

  const displayName = profile?.display_name || email;
  const monogram = displayName.charAt(0).toUpperCase();
  const memberSince = profile?.created_at
    ? new Date(profile.created_at).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
    : null;

  return (
    <div className="card" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.75rem', textAlign: 'center' }}>
      <div
        style={{
          width: 72,
          height: 72,
          borderRadius: '50%',
          background: 'var(--surface-raised)',
          border: '2px solid var(--accent)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '1.75rem',
          fontWeight: 800,
        }}
      >
        {monogram}
      </div>
      <div>
        <div style={{ fontWeight: 700, fontSize: '1.05rem', wordBreak: 'break-word' }}>{displayName}</div>
        {memberSince && <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Member since {memberSince}</div>}
      </div>
    </div>
  );
}
