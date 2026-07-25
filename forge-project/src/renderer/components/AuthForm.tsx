import { useState } from 'react';
import { signUp, signIn } from '../../services/supabase';
import { errorMessage } from '../errorMessage';

export default function AuthForm() {
  const [mode, setMode] = useState<'signIn' | 'signUp'>('signIn');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    const { error } = mode === 'signUp' ? await signUp(email, password) : await signIn(email, password);
    if (error) {
      setError(errorMessage(error));
    } else if (mode === 'signUp') {
      setInfo('Account created — check your email to confirm, then sign in.');
    }
  }

  return (
    <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <form
        onSubmit={handleSubmit}
        className="card"
        style={{ width: 320, padding: '2rem', display: 'flex', flexDirection: 'column', gap: '0.85rem' }}
      >
        <div className="wordmark" style={{ fontSize: '1.4rem', textAlign: 'center', marginBottom: '0.5rem' }}>
          <span className="wordmark-accent">Forge</span>
        </div>
        <h2 style={{ fontSize: '1rem', color: 'var(--text-muted)', fontWeight: 500, textAlign: 'center' }}>
          {mode === 'signUp' ? 'Create your account' : 'Sign in'}
        </h2>
        <input
          className="input"
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <input
          className="input"
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={6}
        />
        <button type="submit" className="btn btn-primary btn-block">
          {mode === 'signUp' ? 'Sign up' : 'Sign in'}
        </button>
        <button
          type="button"
          className="btn btn-block"
          style={{ background: 'transparent', border: 'none' }}
          onClick={() => setMode(mode === 'signUp' ? 'signIn' : 'signUp')}
        >
          {mode === 'signUp' ? 'Have an account? Sign in' : "Don't have an account? Sign up"}
        </button>
        {error && <p className="banner-error">{error}</p>}
        {info && <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{info}</p>}
      </form>
    </div>
  );
}
