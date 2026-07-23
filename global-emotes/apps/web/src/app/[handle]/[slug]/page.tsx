import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { API_URL, BRAND } from '@/lib/api';

interface PublicPack {
  pack: {
    id: string;
    name: string;
    description: string | null;
    creatorHandle: string;
    creatorDisplayName: string;
    accessSummary: string[];
    emoteCount: number;
  };
  emotes: Array<{
    id: string;
    name: string;
    shortcode: string;
    animated: boolean;
    previewUrl: string | null;
  }>;
  installUrl: string;
}

async function fetchPack(handle: string, slug: string): Promise<PublicPack | null> {
  const res = await fetch(
    `${API_URL}/v1/public/creators/${encodeURIComponent(handle)}/packs/${encodeURIComponent(slug)}`,
    { cache: 'no-store' },
  );
  if (!res.ok) return null;
  return (await res.json()) as PublicPack;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ handle: string; slug: string }>;
}): Promise<Metadata> {
  const { handle, slug } = await params;
  const data = await fetchPack(handle, slug);
  if (!data) return {};
  return {
    title: `${data.pack.name} by ${data.pack.creatorDisplayName}`,
    description: `Unlock ${data.pack.emoteCount} official emotes by ${data.pack.creatorDisplayName} on ${BRAND}.`,
    openGraph: {
      title: `${data.pack.name} — ${data.pack.creatorDisplayName}`,
      description: data.pack.description ?? `Official emote pack on ${BRAND}`,
    },
  };
}

const ACCESS_LABELS: Record<string, string> = {
  public: 'Free for everyone',
  tier: 'Members only',
  member: 'Members only',
  discord_role: 'Discord role holders',
  patreon_tier: 'Patreon patrons',
  access_code: 'Access code',
  purchase: 'Purchase',
  campaign: 'Limited-time',
  follower: 'Followers',
};

/** SSR public pack page with membership CTA and install deep link. */
export default async function PackPage({
  params,
}: {
  params: Promise<{ handle: string; slug: string }>;
}) {
  const { handle, slug } = await params;
  const data = await fetchPack(handle, slug);
  if (!data) notFound();

  return (
    <main>
      <section className="hero" style={{ paddingBottom: 24 }}>
        <h1>{data.pack.name}</h1>
        <p>
          by <Link href={`/${data.pack.creatorHandle}`}>{data.pack.creatorDisplayName}</Link>
        </p>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
          {data.pack.accessSummary.map((kind) => (
            <span className="badge" key={kind}>
              {ACCESS_LABELS[kind] ?? kind}
            </span>
          ))}
        </div>
      </section>

      <div className="card">
        <div className="emote-grid">
          {data.emotes.map((emote) => (
            <div className="emote-cell" key={emote.id} title={`:${emote.shortcode}:`}>
              {emote.previewUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- signed URLs, no optimizer
                <img src={emote.previewUrl} alt={emote.name} loading="lazy" />
              ) : (
                <span>{emote.name.slice(0, 2)}</span>
              )}
            </div>
          ))}
        </div>
        {data.emotes.length === 0 && <p className="muted">Emotes are processing…</p>}
      </div>

      <div className="card" style={{ marginTop: 20, textAlign: 'center' }}>
        <h3>Use these emotes anywhere</h3>
        <p className="muted">
          Install {BRAND}, connect your account, and this pack unlocks automatically if you qualify
          — or redeem a code from the creator.
        </p>
        <Link className="btn" href="/library">
          Unlock this pack
        </Link>
      </div>
    </main>
  );
}
