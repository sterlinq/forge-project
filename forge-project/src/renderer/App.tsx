import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { getSession, onAuthStateChange } from '../services/supabase';
import AuthForm from './components/AuthForm';
import Sidebar from './components/Sidebar';
import LibraryView from './components/LibraryView';
import Home from './components/Home';

export type View = 'home' | 'library';

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<View>('home');

  useEffect(() => {
    getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data: subscription } = onAuthStateChange(setSession);
    return () => subscription.subscription.unsubscribe();
  }, []);

  if (loading) {
    return (
      <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
        Loading…
      </div>
    );
  }

  if (!session) {
    return (
      <div style={{ height: '100vh' }}>
        <AuthForm />
      </div>
    );
  }

  return (
    <div style={{ height: '100vh', display: 'flex' }}>
      <Sidebar userEmail={session.user.email ?? ''} view={view} onNavigate={setView} />
      {view === 'home' ? (
        <Home userId={session.user.id} email={session.user.email ?? ''} />
      ) : (
        <LibraryView userId={session.user.id} />
      )}
    </div>
  );
}
