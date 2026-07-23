'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { api } from '@/lib/api';

function VerifyInner() {
  const params = useSearchParams();
  const router = useRouter();
  const [error, setError] = useState('');

  useEffect(() => {
    const token = params.get('token');
    if (!token) {
      setError('missing token');
      return;
    }
    api('/auth/verify', { method: 'POST', json: { token } })
      .then(() => router.replace('/library'))
      .catch((err) => setError(err instanceof Error ? err.message : 'verification failed'));
  }, [params, router]);

  return (
    <main style={{ maxWidth: 420, margin: '48px auto' }}>
      <div className="card">
        <h1>Signing you in…</h1>
        {error ? (
          <p style={{ color: 'var(--accent)' }}>
            {error}. <a href="/login">Request a new link</a>.
          </p>
        ) : (
          <p className="muted">One moment.</p>
        )}
      </div>
    </main>
  );
}

export default function VerifyPage() {
  return (
    <Suspense>
      <VerifyInner />
    </Suspense>
  );
}
