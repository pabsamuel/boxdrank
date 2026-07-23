import type { Metadata } from 'next';
import Link from 'next/link';
import './globals.css';
import { BRAND } from '@/lib/api';

export const metadata: Metadata = {
  title: {
    default: `${BRAND} — your creator emotes, everywhere`,
    template: `%s · ${BRAND}`,
  },
  description:
    'Turn creator memberships into portable, official emote access usable beyond the original platform.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="container">
          <nav className="nav" aria-label="Main">
            <Link href="/" className="wordmark">
              Global<span>Emotes</span>
            </Link>
            <div className="nav-links">
              <Link href="/library">Library</Link>
              <Link href="/studio">Creator Studio</Link>
              <Link href="/pricing">Pricing</Link>
              <Link href="/login" className="btn secondary">
                Sign in
              </Link>
            </div>
          </nav>
          {children}
          <footer>
            <div>
              {BRAND} · <Link href="/legal/terms">Terms</Link> ·{' '}
              <Link href="/legal/privacy">Privacy</Link> ·{' '}
              <Link href="/legal/keyboard-privacy">Keyboard privacy</Link>
            </div>
            <div style={{ marginTop: 8 }}>
              Emotes are images, not Unicode emoji. Insertion works across supported apps; copy and
              share flows cover the rest — honestly.
            </div>
          </footer>
        </div>
      </body>
    </html>
  );
}
