import Link from 'next/link';
import { BRAND } from '@/lib/api';

export default function HomePage() {
  return (
    <main>
      <section className="hero">
        <span className="badge">Twitch subs · Discord roles · Access codes — more coming</span>
        <h1>
          Your community&apos;s emotes,
          <br />
          in every chat that matters.
        </h1>
        <p>
          {BRAND} turns creator memberships into portable, official emote access. Fans connect
          their accounts, packs unlock automatically, and a fast mobile keyboard puts emotes into
          supported apps — with honest copy &amp; share fallbacks everywhere else.
        </p>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
          <Link className="btn" href="/studio">
            I&apos;m a creator
          </Link>
          <Link className="btn secondary" href="/library">
            I&apos;m a fan
          </Link>
        </div>
      </section>

      <section className="grid cols-3" aria-label="How it works">
        <div className="card">
          <h3>Official, always</h3>
          <p className="muted">
            Only verified creators publish their own emotes. Membership checks use official
            platform APIs — never scraping, never passwords.
          </p>
        </div>
        <div className="card">
          <h3>Unlocks that follow the membership</h3>
          <p className="muted">
            Subscribe on Twitch, hold a Discord role, or redeem a creator code. Access ends with a
            fair grace period when the membership ends — automatically.
          </p>
        </div>
        <div className="card">
          <h3>A keyboard, not a keylogger</h3>
          <p className="muted">
            The keyboard never reads, stores, or transmits what you type. Analytics are an
            allowlist of anonymous product events — enforced in code and CI.
          </p>
        </div>
      </section>
    </main>
  );
}
