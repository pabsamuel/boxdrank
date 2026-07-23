'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api, ApiError } from '@/lib/api';

interface CreatorProfile {
  id: string;
  handle: string;
  displayName: string;
  plan: string;
}
interface Me {
  email: string;
  creatorProfiles: CreatorProfile[];
}
interface Pack {
  id: string;
  slug: string;
  name: string;
  visibility: string;
}

export default function StudioPage() {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const [handle, setHandle] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [packs, setPacks] = useState<Pack[]>([]);
  const [packName, setPackName] = useState('');
  const [message, setMessage] = useState('');

  const creator = me?.creatorProfiles[0] ?? null;

  async function refresh() {
    try {
      const meRes = await api<Me>('/me');
      setMe(meRes);
      const profile = meRes.creatorProfiles[0];
      if (profile) {
        const packRes = await api<{ items: Pack[] }>(`/creators/${profile.id}/packs`);
        setPacks(packRes.items);
      }
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) setMe(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function createProfile(e: React.FormEvent) {
    e.preventDefault();
    setMessage('');
    try {
      await api('/creators', { method: 'POST', json: { handle, displayName } });
      await refresh();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'failed');
    }
  }

  async function createPack(e: React.FormEvent) {
    e.preventDefault();
    if (!creator) return;
    setMessage('');
    try {
      await api(`/creators/${creator.id}/packs`, { method: 'POST', json: { name: packName } });
      setPackName('');
      await refresh();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'failed');
    }
  }

  if (loading) return <main className="muted">Loading…</main>;
  if (!me) {
    return (
      <main style={{ maxWidth: 480, margin: '48px auto' }}>
        <div className="card">
          <h1>Creator Studio</h1>
          <p className="muted">Sign in to publish your emote packs.</p>
          <Link className="btn" href="/login">
            Sign in
          </Link>
        </div>
      </main>
    );
  }

  if (!creator) {
    return (
      <main style={{ maxWidth: 520, margin: '48px auto' }}>
        <div className="card">
          <h1>Claim your creator handle</h1>
          <form onSubmit={createProfile}>
            <label htmlFor="handle">Handle (your public URL)</label>
            <input
              id="handle"
              className="input"
              value={handle}
              onChange={(e) => setHandle(e.target.value)}
              placeholder="your-name"
              required
            />
            <label htmlFor="displayName">Display name</label>
            <input
              id="displayName"
              className="input"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              required
            />
            {message && <p style={{ color: 'var(--accent)' }}>{message}</p>}
            <button className="btn" style={{ marginTop: 16 }}>
              Create creator profile
            </button>
          </form>
        </div>
      </main>
    );
  }

  return (
    <main>
      <h1>Creator Studio</h1>
      <p className="muted">
        @{creator.handle} · plan: {creator.plan} ·{' '}
        <a href={`/${creator.handle}`} target="_blank" rel="noreferrer">
          public page ↗
        </a>
      </p>

      <div className="card" style={{ marginTop: 20 }}>
        <h3>Create a pack</h3>
        <form onSubmit={createPack} style={{ display: 'flex', gap: 12 }}>
          <input
            className="input"
            value={packName}
            onChange={(e) => setPackName(e.target.value)}
            placeholder="Pack name"
            required
          />
          <button className="btn">Create</button>
        </form>
        {message && <p style={{ color: 'var(--accent)' }}>{message}</p>}
      </div>

      <h2 style={{ marginTop: 32 }}>Your packs</h2>
      <div className="grid cols-3">
        {packs.map((pack) => (
          <div className="card" key={pack.id}>
            <h3>{pack.name}</h3>
            <p>
              <span className={`badge ${pack.visibility === 'published' ? 'ok' : ''}`}>
                {pack.visibility}
              </span>
            </p>
            <Link className="btn secondary" href={`/studio/packs/${pack.id}`}>
              Edit pack
            </Link>
          </div>
        ))}
        {packs.length === 0 && <p className="muted">No packs yet — create your first one above.</p>}
      </div>
    </main>
  );
}
