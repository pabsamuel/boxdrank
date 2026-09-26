import Link from 'next/link';
import { BRAND } from '@/lib/api';

/**
 * The starter pack every install ships with — the same twelve the mobile
 * keyboard seeds, so the site shows what you actually get rather than
 * stock art. Angles are a fixed list, not random, so server and client
 * render identically.
 */
const STARTER: [string, string][] = [
  ['🔥', 'onFire'],
  ['😂', 'deadLol'],
  ['💜', 'purpleLove'],
  ['🎉', 'hype'],
  ['😎', 'bigCool'],
  ['👀', 'sus'],
  ['🥳', 'letsGo'],
  ['💀', 'imDead'],
  ['⭐', 'poggers'],
  ['🤝', 'ggwp'],
  ['🧠', 'bigBrain'],
  ['🫶', 'loveYou'],
];
const ANGLES = [-3.2, 2.4, -1.6, 3.1, -2.7, 1.8, -3.4, 2.2, -1.2, 2.9, -2.1, 1.4];

export default function HomePage() {
  return (
    <main>
      <section className="hero">
        <div className="split">
          <div>
            <span className="badge">Twitch subs · Discord roles · Access codes — more coming</span>
            <h1>
              Your community&apos;s <em>emotes</em>, in every chat that matters.
            </h1>
            <p>
              {BRAND} turns creator memberships into portable, official emote access. Fans connect
              their accounts, packs unlock automatically, and a fast mobile keyboard puts emotes
              into supported apps — with honest copy &amp; share fallbacks everywhere else.
            </p>
            <div className="hero-actions">
              <Link className="btn" href="/studio">
                I&apos;m a creator
              </Link>
              <Link className="btn secondary" href="/library">
                I&apos;m a fan
              </Link>
            </div>
          </div>

          {/* What the keyboard actually looks like on a phone. */}
          <div className="kb" aria-label="Preview of the emote keyboard">
            <div className="kb-bar">
              <span className="kb-pill">🌐 {BRAND}</span>
              <span className="kb-priv">🔒 private</span>
            </div>
            <div className="stickers">
              {STARTER.map(([glyph, name], i) => (
                <span
                  key={name}
                  className="sticker"
                  style={{ ['--r' as string]: `${ANGLES[i]}deg` }}
                  title={`:${name}:`}
                >
                  {glyph}
                </span>
              ))}
            </div>
            <p className="kb-priv" style={{ textAlign: 'center', marginTop: 12 }}>
              tap to drop · never sees what you type
            </p>
          </div>
        </div>
      </section>

      <section className="sheet" aria-label="Starter pack">
        <div className="sheet-head">
          <span className="t">Starter pack</span>
          <span className="rule" />
          <span className="n">{STARTER.length} emotes · free</span>
        </div>
        <div className="stickers">
          {STARTER.map(([glyph, name], i) => (
            <span
              key={name}
              className="sticker"
              style={{ ['--r' as string]: `${ANGLES[(i + 5) % ANGLES.length]}deg` }}
              title={`:${name}:`}
            >
              {glyph}
            </span>
          ))}
        </div>
        <p className="muted" style={{ marginTop: 16, marginBottom: 0 }}>
          Every install starts here. Creators upload their own packs on top — those unlock for fans
          who hold the membership.
        </p>
      </section>

      <section className="grid cols-3" aria-label="How it works" style={{ marginTop: 22 }}>
        <div className="card">
          <h3>Official, always</h3>
          <p className="muted">
            Only verified creators publish their own emotes. Membership checks use official platform
            APIs — never scraping, never passwords.
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
            The keyboard never reads, stores, or transmits what you type. Analytics are an allowlist
            of anonymous product events — enforced in code and CI.
          </p>
        </div>
      </section>
    </main>
  );
}
