'use client';

import { use, useEffect, useState } from 'react';
import { api } from '@/lib/api';

interface Me {
  creatorProfiles: Array<{ id: string; handle: string; plan: string }>;
}
interface Rule {
  id?: string;
  kind: string;
  providerId: string | null;
  config: Record<string, unknown>;
}
interface CodeBatch {
  batchId: string;
  codes: Array<{ id: string; code: string }>;
}

export default function PackEditorPage({ params }: { params: Promise<{ packId: string }> }) {
  const { packId } = use(params);
  const [creatorId, setCreatorId] = useState<string | null>(null);
  const [emoteName, setEmoteName] = useState('');
  const [shortcode, setShortcode] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [rules, setRules] = useState<Rule[]>([]);
  const [codes, setCodes] = useState<CodeBatch | null>(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<Me>('/me')
      .then((me) => setCreatorId(me.creatorProfiles[0]?.id ?? null))
      .catch(() => setCreatorId(null));
  }, []);

  async function uploadEmote(e: React.FormEvent) {
    e.preventDefault();
    if (!file || !creatorId) return;
    setBusy(true);
    setMessage('');
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const grant = await api<{ grantId: string; uploadUrl: string }>('/uploads', {
        method: 'POST',
        json: { fileName: file.name, mimeType: file.type, bytes: bytes.length },
      });
      const put = await fetch(grant.uploadUrl, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'content-type': file.type },
        body: bytes,
      });
      if (!put.ok) throw new Error('upload failed');
      const emote = await api<{ id: string; status: string }>(`/creators/${creatorId}/emotes`, {
        method: 'POST',
        json: { name: emoteName, shortcode, uploadGrantId: grant.grantId, tags: [] },
      });
      await api(`/packs/${packId}/emotes`, {
        method: 'POST',
        json: { emoteId: emote.id, position: 0 },
      });
      setMessage(`Emote "${emoteName}" uploaded (${emote.status}) and added to the pack.`);
      setEmoteName('');
      setShortcode('');
      setFile(null);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'upload failed');
    } finally {
      setBusy(false);
    }
  }

  async function saveRules(kind: string) {
    setMessage('');
    const next: Rule[] =
      kind === 'public'
        ? [{ kind: 'public', providerId: null, config: {} }]
        : kind === 'access_code'
          ? [{ kind: 'access_code', providerId: 'access_code', config: {} }]
          : [{ kind: 'tier', providerId: 'mock', config: { tiers: ['tier1', 'tier2', 'tier3'] } }];
    try {
      const res = await api<{ rules: Rule[] }>(`/packs/${packId}/rules`, {
        method: 'PUT',
        json: { rules: next },
      });
      setRules(res.rules);
      setMessage('Access rules saved.');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'failed');
    }
  }

  async function publish() {
    setMessage('');
    try {
      const res = await api<{ published: boolean; version: number }>(`/packs/${packId}/publish`, {
        method: 'POST',
      });
      setMessage(`Published — version ${res.version}. Share your public link!`);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'publish failed');
    }
  }

  async function generateCodes() {
    setMessage('');
    try {
      const res = await api<CodeBatch>(`/packs/${packId}/codes`, {
        method: 'POST',
        json: { quantity: 5, maxRedemptions: 1 },
      });
      setCodes(res);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'failed');
    }
  }

  return (
    <main>
      <h1>Pack editor</h1>
      <p className="muted">Pack {packId}</p>

      <div className="grid cols-3" style={{ marginTop: 20 }}>
        <div className="card">
          <h3>Upload an emote</h3>
          <form onSubmit={uploadEmote}>
            <label>Name</label>
            <input className="input" value={emoteName} onChange={(e) => setEmoteName(e.target.value)} required />
            <label>Shortcode</label>
            <input
              className="input"
              value={shortcode}
              onChange={(e) => setShortcode(e.target.value)}
              placeholder="myHype"
              required
            />
            <label>Image (PNG/WebP/GIF, ≤2MB, 32–1024px)</label>
            <input
              className="input"
              type="file"
              accept="image/png,image/webp,image/gif,image/jpeg"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              required
            />
            <button className="btn" style={{ marginTop: 14 }} disabled={busy}>
              {busy ? 'Uploading…' : 'Upload & add to pack'}
            </button>
          </form>
        </div>

        <div className="card">
          <h3>Access rules</h3>
          <p className="muted">Who unlocks this pack?</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <button className="btn secondary" onClick={() => saveRules('public')}>
              Public (everyone)
            </button>
            <button className="btn secondary" onClick={() => saveRules('access_code')}>
              Access codes
            </button>
            <button className="btn secondary" onClick={() => saveRules('tier')}>
              Members (any tier, mock provider)
            </button>
          </div>
          {rules.length > 0 && (
            <p className="muted" style={{ marginTop: 8 }}>
              Current: {rules.map((r) => r.kind).join(', ')}
            </p>
          )}
        </div>

        <div className="card">
          <h3>Publish &amp; share</h3>
          <button className="btn" onClick={publish}>
            Publish pack
          </button>
          <hr style={{ margin: '16px 0', border: 'none', borderTop: '1px solid var(--border)' }} />
          <button className="btn secondary" onClick={generateCodes}>
            Generate 5 access codes
          </button>
          {codes && (
            <ul style={{ paddingLeft: 18, marginTop: 10, fontFamily: 'monospace' }}>
              {codes.codes.map((c) => (
                <li key={c.id}>{c.code}</li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {message && <p style={{ marginTop: 16 }}>{message}</p>}
    </main>
  );
}
