import Link from 'next/link';
import { notFound } from 'next/navigation';
import { API_URL } from '@/lib/api';

interface PublicCreator {
  creator: { handle: string; displayName: string; bio: string | null };
  packs: Array<{ id: string; slug: string; name: string; description: string | null }>;
}

/** SSR public creator page — the top of the acquisition funnel (IP-11). */
export default async function CreatorPage({ params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params;
  const res = await fetch(`${API_URL}/v1/public/creators/${encodeURIComponent(handle)}`, {
    cache: 'no-store',
  });
  if (!res.ok) notFound();
  const data = (await res.json()) as PublicCreator;

  return (
    <main>
      <section className="hero" style={{ paddingBottom: 24 }}>
        <h1>{data.creator.displayName}</h1>
        <p>@{data.creator.handle}</p>
        {data.creator.bio && <p>{data.creator.bio}</p>}
      </section>
      <div className="grid cols-3">
        {data.packs.map((pack) => (
          <div className="card" key={pack.id}>
            <h3>{pack.name}</h3>
            {pack.description && <p className="muted">{pack.description}</p>}
            <Link className="btn" href={`/${data.creator.handle}/${pack.slug}`}>
              View pack
            </Link>
          </div>
        ))}
        {data.packs.length === 0 && <p className="muted">No published packs yet.</p>}
      </div>
    </main>
  );
}
