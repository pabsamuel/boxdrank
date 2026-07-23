'use client';

import { useState } from 'react';
import { api } from '@/lib/api';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [error, setError] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setState('sending');
    try {
      await api('/auth/magic-link', { method: 'POST', json: { email } });
      setState('sent');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'failed');
      setState('error');
    }
  }

  return (
    <main style={{ maxWidth: 420, margin: '48px auto' }}>
      <div className="card">
        <h1>Sign in</h1>
        {state === 'sent' ? (
          <p>
            Check your inbox — we sent a sign-in link to <strong>{email}</strong>. It expires in 15
            minutes. (Local dev: open Mailpit at{' '}
            <a href="http://localhost:8025" target="_blank" rel="noreferrer">
              localhost:8025
            </a>
            .)
          </p>
        ) : (
          <form onSubmit={submit}>
            <label htmlFor="email">Email</label>
            <input
              id="email"
              className="input"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
            />
            {state === 'error' && <p style={{ color: 'var(--accent)' }}>{error}</p>}
            <button
              className="btn"
              style={{ marginTop: 16, width: '100%' }}
              disabled={state === 'sending'}
            >
              {state === 'sending' ? 'Sending…' : 'Email me a sign-in link'}
            </button>
            <p className="muted" style={{ marginTop: 12 }}>
              No passwords. We create your account on first sign-in.
            </p>
          </form>
        )}
      </div>
    </main>
  );
}
