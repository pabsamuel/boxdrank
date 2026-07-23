'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api, ApiError } from '@/lib/api';

interface Me {
  id: string;
  email: string;
  fanPlan: string;
}
interface Entitlement {
  id: string;
  packId: string | null;
  status: string;
  tier: string | null;
  providerId: string | null;
  graceUntil: string | null;
}
interface Connection {
  id: string;
  providerId: string;
  displayName: string | null;
  status: string;
}
interface Provider {
  id: string;
  name: string;
  status: string;
  enabled: boolean;
}

export default function LibraryPage() {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const [entitlements, setEntitlements] = useState<Entitlement[]>([]);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [code, setCode] = useState('');
  const [message, setMessage] = useState('');

  async function refresh() {
    try {
      const meRes = await api<Me>('/me');
      setMe(meRes);
      const [ents, conns, provs] = await Promise.all([
        api<{ items: Entitlement[] }>('/entitlements'),
        api<{ items: Connection[] }>('/connections'),
        api<{ items: Provider[] }>('/providers'),
      ]);
      setEntitlements(ents.items);
      setConnections(conns.items);
      setProviders(provs.items.filter((p) => p.enabled));
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) setMe(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function redeem(e: React.FormEvent) {
    e.preventDefault();
    setMessage('');
    try {
      const res = await api<{ unlocked: boolean; packId: string }>('/codes/redeem', {
        method: 'POST',
        json: { code },
      });
      setMessage(res.unlocked ? 'Pack unlocked 🎉' : 'Something went wrong');
      setCode('');
      await refresh();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'redeem failed');
    }
  }

  async function connect(providerId: string) {
    try {
      const res = await api<{ url: string }>(`/providers/${providerId}/connect?role=fan`);
      window.location.href = res.url;
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'connect failed');
    }
  }

  async function syncNow() {
    setMessage('Syncing…');
    const res = await api<{ granted: number; extended: number }>('/entitlements/refresh', {
      method: 'POST',
    });
    setMessage(`Sync done — ${res.granted} new unlock(s).`);
    await refresh();
  }

  if (loading) return <main className="muted">Loading…</main>;
  if (!me) {
    return (
      <main style={{ maxWidth: 480, margin: '48px auto' }}>
        <div className="card">
          <h1>Your library</h1>
          <p className="muted">Sign in to see unlocked packs and connect your accounts.</p>
          <Link className="btn" href="/login">
            Sign in
          </Link>
        </div>
      </main>
    );
  }

  const live = entitlements.filter((e) => e.status === 'active' || e.status === 'grace');

  return (
    <main>
      <h1>Your library</h1>
      <p className="muted">
        Signed in as {me.email} · plan: {me.fanPlan}
      </p>

      <div className="grid cols-3" style={{ marginTop: 20 }}>
        <div className="card">
          <h3>Connected accounts</h3>
          {connections.length === 0 && <p className="muted">Nothing connected yet.</p>}
          <ul style={{ paddingLeft: 18 }}>
            {connections.map((c) => (
              <li key={c.id}>
                {c.providerId} — {c.displayName ?? 'account'}{' '}
                <span className={`badge ${c.status === 'active' ? 'ok' : 'warn'}`}>{c.status}</span>
              </li>
            ))}
          </ul>
          {providers.map((p) => (
            <button
              key={p.id}
              className="btn secondary"
              style={{ marginRight: 8, marginTop: 8 }}
              onClick={() => connect(p.id)}
            >
              Connect {p.name}
            </button>
          ))}
          <button className="btn" style={{ marginTop: 12 }} onClick={syncNow}>
            Sync entitlements now
          </button>
        </div>

        <div className="card">
          <h3>Redeem a code</h3>
          <form onSubmit={redeem}>
            <input
              className="input"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="XXXX-XXXX-XXXX"
              aria-label="Access code"
            />
            <button className="btn" style={{ marginTop: 10 }}>
              Unlock
            </button>
          </form>
        </div>

        <div className="card">
          <h3>Get the keyboard</h3>
          <p className="muted">
            Android: rich insertion where supported. iOS: fast copy &amp; share. Never logs what you
            type.
          </p>
          <span className="badge">Android beta</span> <span className="badge">iOS beta</span>
        </div>
      </div>

      {message && <p style={{ marginTop: 16 }}>{message}</p>}

      <h2 style={{ marginTop: 32 }}>Unlocked packs ({live.length})</h2>
      <table>
        <thead>
          <tr>
            <th>Pack</th>
            <th>Source</th>
            <th>Tier</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {entitlements.map((e) => (
            <tr key={e.id}>
              <td>{e.packId ?? 'creator-wide'}</td>
              <td>{e.providerId ?? '—'}</td>
              <td>{e.tier ?? '—'}</td>
              <td>
                <span
                  className={`badge ${e.status === 'active' ? 'ok' : e.status === 'grace' ? 'warn' : ''}`}
                >
                  {e.status}
                  {e.status === 'grace' && e.graceUntil
                    ? ` until ${new Date(e.graceUntil).toLocaleDateString()}`
                    : ''}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
